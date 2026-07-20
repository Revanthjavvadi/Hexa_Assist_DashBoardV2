'use strict';
/**
 * GET  /api/sync-status
 *   Reports current state of the Blob → Cosmos DB sync job.
 *
 * POST /api/cache/invalidate
 *   Triggers an immediate forced re-sync from Blob Storage → Cosmos DB.
 *   Clears the in-memory blob cache so fresh data is read from Blob.
 *
 * Blob Storage is NEVER written to.  One-way: Blob → Cosmos only.
 */
const router     = require('express').Router();
const inMemCache = require('../utils/cache');
const syncJob    = require('../services/syncJob');
const cosmos     = require('../services/cosmosService');
const config     = require('../config/env');
const logger     = require('../utils/logger');

// ── GET /api/sync-status ──────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const jobStatus = syncJob.getStatus();

  res.json({
    success:        true,
    blobSource:     {
      connected: !!config.azure.blobSasUrl,
      container: config.azure.containerName,
    },
    cosmosDestination: {
      available: cosmos.isAvailable(),
      database:  config.cosmos.database,
      containers: config.cosmos.containers,
    },
    syncJob: jobStatus,
    refreshIntervalMs: config.refreshIntervalMs,
    cacheTtlSeconds:   config.cacheTtlSeconds,
    serverTime:        new Date().toISOString(),
  });
});

// ── POST /api/cache/invalidate — force immediate re-sync ──────────────────────
router.post('/invalidate', (req, res) => {
  logger.info('[syncStatus] Force Blob→Cosmos sync requested');

  // Clear in-memory blob cache so syncJob re-reads fresh blobs
  inMemCache.clear();

  // Trigger sync in background — return 202 immediately
  syncJob.forceSync().catch(err =>
    logger.error('[syncStatus] Force sync error', { error: err.message })
  );

  res.status(202).json({
    success: true,
    message: 'Force sync triggered — Cosmos DB will be updated from Blob Storage shortly.',
  });
});

module.exports = router;
