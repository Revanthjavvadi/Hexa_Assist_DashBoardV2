'use strict';
/**
 * Azure Blob Storage Service — Container-SAS edition
 *
 * The SAS URL in .env is a CONTAINER-level SAS that already includes the
 * container path.  We must use ContainerClient directly — NOT BlobServiceClient
 * + getContainerClient(), which would double the container name in the URL.
 *
 * Real blob structure (read-only):
 *   Log_Collection/{device}/{user}/fixes/          ← one JSON per fix event
 *   Log_Collection/{device}/{user}/hip_checks/     ← one JSON per HIP check
 *   Log_Collection/{device}/{user}/security_compliance/
 *   Log_Collection/{device}/{user}/system_info/
 *   Log_Collection/{device}/{user}/actions/
 *   pins/{device}.json
 *   JSON/scripts.json
 *   JSON/os_compliance.json
 *   JSON/support_config.json
 *   *.ps1  (script files — not read here)
 */

const { ContainerClient } = require('@azure/storage-blob');
const logger = require('../utils/logger');
const cache  = require('../utils/cache');
const config = require('../config/env');

// ── Lazy singleton ────────────────────────────────────────────────────────────
let _containerClient = null;

function getContainerClient() {
  if (_containerClient) return _containerClient;
  if (!config.azure.blobSasUrl) return null;
  try {
    // Container SAS — use ContainerClient directly, not BlobServiceClient
    _containerClient = new ContainerClient(config.azure.blobSasUrl);
    logger.info('[BlobService] Container client initialised', {
      account:   config.azure.storageAccount,
      container: config.azure.containerName,
    });
    return _containerClient;
  } catch (err) {
    logger.error('[BlobService] Failed to initialise client', { error: err.message });
    return null;
  }
}

// ── Read a single blob as parsed JSON ─────────────────────────────────────────
// Pass force=true to bypass cache (used when client sends ?fresh=1)
async function readJson(blobName, force = false) {
  const cacheKey = `blob:${blobName}`;
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.debug('[BlobService] Cache hit', { blob: blobName });
      return cached;
    }
  }

  const client = getContainerClient();
  if (!client) {
    logger.warn('[BlobService] No container client — SAS URL not set.', { blob: blobName });
    return null;
  }

  try {
    const blobClient = client.getBlobClient(blobName);
    const downloadResponse = await blobClient.download();
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    cache.set(cacheKey, data);
    logger.info('[BlobService] Downloaded blob', { blob: blobName });
    return data;
  } catch (err) {
    if (err.statusCode === 404) {
      logger.warn('[BlobService] Blob not found', { blob: blobName });
    } else {
      logger.error('[BlobService] Error reading blob', { blob: blobName, error: err.message });
    }
    return null;
  }
}

// ── List all blobs under a prefix, return full metadata ───────────────────────
// Pass force=true to bypass cache
async function listBlobs(prefix = '', force = false) {
  const cacheKey = `list:${prefix}`;
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  const client = getContainerClient();
  if (!client) return [];

  const results = [];
  try {
    for await (const blob of client.listBlobsFlat({ prefix })) {
      results.push({
        name:         blob.name,
        size:         blob.properties.contentLength,
        lastModified: blob.properties.lastModified,
        contentType:  blob.properties.contentType,
      });
    }
    // List cache always uses a short TTL (30 s) so new blobs are discovered quickly
    cache.set(cacheKey, results, 30);
    logger.info('[BlobService] Listed blobs', { prefix, count: results.length });
  } catch (err) {
    const isAuthErr = err.message && (
      err.message.includes('not authorized') ||
      err.message.includes('AuthorizationFailure') ||
      err.statusCode === 403
    );
    if (isAuthErr) {
      logger.error('[BlobService] Authorization DENIED listing blobs. ' +
        'The SAS token is missing the List ("l") permission. ' +
        'Regenerate SAS with Read+List permissions and update AZURE_BLOB_SAS_URL in .env.',
        { prefix });
    } else {
      logger.error('[BlobService] Error listing blobs', { prefix, error: err.message });
    }
    throw err; // Re-throw so callers can handle auth errors specifically
  }
  return results;
}

// ── Read ALL blobs under a prefix and return array of parsed JSON objects ─────
// Uses a short TTL cache (cacheTtl param, default = config.cacheTtlSeconds)
async function readAllJson(prefix, cacheTtl) {
  const ttl = cacheTtl ?? config.cacheTtlSeconds;
  const cacheKey = `all:${prefix}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.debug('[BlobService] Cache hit (all)', { prefix });
    return cached;
  }

  const client = getContainerClient();
  if (!client) return [];

  const blobs = [];
  try {
    for await (const b of client.listBlobsFlat({ prefix })) {
      if (b.name.endsWith('.json')) blobs.push(b.name);
    }
  } catch (err) {
    logger.error('[BlobService] Error listing for readAllJson', { prefix, error: err.message });
    return [];
  }

  const results = [];
  // Read concurrently in batches of 20
  const BATCH = 20;
  for (let i = 0; i < blobs.length; i += BATCH) {
    const batch = blobs.slice(i, i + BATCH);
    const parsed = await Promise.all(
      batch.map(async name => {
        try {
          const bc = client.getBlobClient(name);
          const dl = await bc.download();
          const chunks = [];
          for await (const ch of dl.readableStreamBody) {
            chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
          }
          return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        } catch {
          return null;
        }
      })
    );
    results.push(...parsed.filter(Boolean));
  }

  cache.set(cacheKey, results, ttl);
  logger.info('[BlobService] Read all blobs', { prefix, count: results.length });
  return results;
}

// ── Write (upload) a JSON object to a blob ────────────────────────────────────
async function writeJson(blobName, data) {
  const client = getContainerClient();
  if (!client) {
    logger.warn('[BlobService] No container client — cannot write blob.', { blob: blobName });
    throw new Error('Azure Blob Storage not configured');
  }
  try {
    const json    = JSON.stringify(data, null, 2);
    const buf     = Buffer.from(json, 'utf-8');
    const bc      = client.getBlockBlobClient(blobName);
    await bc.upload(buf, buf.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' },
      overwrite: true,
    });
    // Invalidate cache so next read picks up the new data
    cache.invalidate(`blob:${blobName}`);
    logger.info('[BlobService] Wrote blob', { blob: blobName, bytes: buf.length });
  } catch (err) {
    logger.error('[BlobService] Error writing blob', { blob: blobName, error: err.message });
    throw err;
  }
}

module.exports = { readJson, listBlobs, readAllJson, writeJson };
