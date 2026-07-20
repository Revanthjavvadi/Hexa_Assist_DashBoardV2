'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Azure Cosmos DB Service  —  4-container architecture
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  dashboard  — Overview, System Info, HIP, Security, Fixes, Scripts
 *               { id, type:'overview'|'system'|'hip'|'security'|'fix'|'script', ...data }
 *
 *  admin      — Users, Settings, Device Tags, Tag Catalog, Temp Access
 *               { id, type:'user'|'admin-settings'|'tag-assignment'|'tag-catalog'|'temp-access', ...data }
 *
 *  pins       — PIN Management
 *               { id, hostname, rawPin, ... }
 *
 *  audit      — PIN Audit Logs
 *               { id, hostname, outcome, timestamp, ... }
 *
 * All containers use /id as the partition key.
 * Containers are auto-created in Azure Cosmos DB on first use (createIfNotExists).
 *
 * Data flow: Azure Blob Storage → syncJob → Cosmos DB → API controllers → UI
 * Cosmos DB is NEVER written back to Blob Storage.
 */

const { CosmosClient } = require('@azure/cosmos');
const logger = require('../utils/logger');
const config = require('../config/env');

// ── Lazy singleton ─────────────────────────────────────────────────────────────
let _client   = null;
let _database = null;
const _containers = {};  // cache: physicalName → ContainerClient

function isAvailable() {
  return !!(config.cosmos.endpoint && config.cosmos.key);
}

function getClient() {
  if (_client) return _client;
  if (!isAvailable()) return null;
  try {
    _client = new CosmosClient({ endpoint: config.cosmos.endpoint, key: config.cosmos.key });
    logger.info('[CosmosService] Client initialised', { database: config.cosmos.database });
    return _client;
  } catch (err) {
    logger.error('[CosmosService] Failed to init client', { error: err.message });
    return null;
  }
}

async function getDatabase() {
  if (_database) return _database;
  const client = getClient();
  if (!client) return null;
  try {
    const { database } = await client.databases.createIfNotExists({ id: config.cosmos.database });
    _database = database;
    logger.info('[CosmosService] Database ready', { id: config.cosmos.database });
    return _database;
  } catch (err) {
    logger.error('[CosmosService] Database error', { error: err.message });
    return null;
  }
}

/**
 * Resolve logical name → physical container name, then get/create the container.
 * Logical names: 'dashboard' | 'admin' | 'pins' | 'audit'
 */
async function getContainer(logicalName) {
  const containerName = config.cosmos.containers[logicalName];
  if (!containerName) throw new Error(`Unknown Cosmos container: "${logicalName}". Valid: dashboard, admin, pins, audit`);
  if (_containers[containerName]) return _containers[containerName];

  const db = await getDatabase();
  if (!db) throw new Error('Cosmos DB database not available');

  const { container } = await db.containers.createIfNotExists({
    id:           containerName,
    partitionKey: { paths: ['/id'] },
  });
  _containers[containerName] = container;
  logger.info('[CosmosService] Container ready', { container: containerName });
  return container;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic read helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read ALL documents from a container. */
async function readAll(logicalName) {
  const container = await getContainer(logicalName);
  const { resources } = await container.items.query('SELECT * FROM c').fetchAll();
  return resources;
}

/** Read a single document by id (uses point-read for efficiency). */
async function readOne(logicalName, id) {
  const container = await getContainer(logicalName);
  try {
    const { resource } = await container.item(id, id).read();
    return resource ?? null;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
}

/** Run a parameterised SQL query. */
async function query(logicalName, sql, parameters = []) {
  const container = await getContainer(logicalName);
  const { resources } = await container.items
    .query({ query: sql, parameters })
    .fetchAll();
  return resources;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-scoped helpers (dashboard + admin containers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query documents by type from the dashboard container.
 * type: 'overview' | 'system' | 'hip' | 'security' | 'fix' | 'script'
 */
async function queryByType(type) {
  return query('dashboard', 'SELECT * FROM c WHERE c.type = @type', [{ name: '@type', value: type }]);
}

/**
 * Query documents by type from the admin container.
 * type: 'user' | 'admin-settings' | 'tag-assignment' | 'tag-catalog' | 'temp-access'
 */
async function queryAdminByType(type) {
  return query('admin', 'SELECT * FROM c WHERE c.type = @type', [{ name: '@type', value: type }]);
}

/**
 * Delete all documents of a given type from the dashboard container.
 * Never deletes docs whose id starts with '__'.
 */
async function deleteAllByType(type) {
  const container = await getContainer('dashboard');
  const { resources } = await container.items
    .query({ query: 'SELECT c.id FROM c WHERE c.type = @type', parameters: [{ name: '@type', value: type }] })
    .fetchAll();
  const toDelete = resources.filter(r => !String(r.id).startsWith('__'));
  if (!toDelete.length) return;
  await Promise.all(toDelete.map(r => container.item(r.id, r.id).delete()));
  logger.info('[CosmosService] deleteAllByType(dashboard) complete', { type, count: toDelete.length });
}

/**
 * Delete all documents of a given type from the admin container.
 * Never deletes docs whose id starts with '__'.
 */
async function deleteAdminByType(type) {
  const container = await getContainer('admin');
  const { resources } = await container.items
    .query({ query: 'SELECT c.id FROM c WHERE c.type = @type', parameters: [{ name: '@type', value: type }] })
    .fetchAll();
  const toDelete = resources.filter(r => !String(r.id).startsWith('__'));
  if (!toDelete.length) return;
  await Promise.all(toDelete.map(r => container.item(r.id, r.id).delete()));
  logger.info('[CosmosService] deleteAdminByType complete', { type, count: toDelete.length });
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert a single document. doc MUST have an 'id' field. */
async function upsertOne(logicalName, doc) {
  if (!doc.id) throw new Error('upsertOne: doc must have an id field');
  const container = await getContainer(logicalName);
  await container.items.upsert(doc);
}

/** Bulk-upsert documents in batches to stay within Cosmos RU limits. */
async function upsertBulk(logicalName, docs, batchSize = 50) {
  if (!docs.length) return;
  const container = await getContainer(logicalName);
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    await Promise.all(batch.map(doc => {
      if (!doc.id) throw new Error('upsertBulk: every doc must have an id field');
      return container.items.upsert(doc);
    }));
  }
  logger.info('[CosmosService] Bulk upsert complete', { container: logicalName, count: docs.length });
}

/** Delete ALL documents in a container (full reset). */
async function deleteAll(logicalName) {
  const container = await getContainer(logicalName);
  const { resources } = await container.items.query('SELECT c.id FROM c').fetchAll();
  if (!resources.length) return;
  await Promise.all(resources.map(r => container.item(r.id, r.id).delete()));
  logger.info('[CosmosService] deleteAll complete', { container: logicalName, count: resources.length });
}

/** Delete a single document by id. Silently ignores 404. */
async function deleteOne(logicalName, id) {
  const container = await getContainer(logicalName);
  try {
    await container.item(id, id).delete();
  } catch (err) {
    if (err.code !== 404) throw err;
  }
}

module.exports = {
  isAvailable,
  readAll, readOne, query,
  queryByType, queryAdminByType,
  deleteAllByType, deleteAdminByType,
  upsertOne, upsertBulk,
  deleteAll, deleteOne,
};
