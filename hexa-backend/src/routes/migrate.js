'use strict';
/**
 * Migration & Health Routes — /api/migrate
 *
 * GET  /api/migrate/status           — shows all containers in Azure Cosmos DB and flags old ones
 * POST /api/migrate/delete-old       — deletes old containers from Azure Cosmos DB (irreversible)
 * GET  /api/migrate/verify           — confirms only the 4 new containers exist and are reachable
 */

const router = require('express').Router();
const { CosmosClient } = require('@azure/cosmos');
const cosmos = require('../services/cosmosService');
const config = require('../config/env');
const logger = require('../utils/logger');

// The only 4 containers that should exist after migration
const NEW_CONTAINERS = ['dashboard', 'admin', 'pins', 'audit'];

// Old containers from previous architectures
const OLD_CONTAINERS = [
  'overview', 'fixes', 'hip', 'security', 'system-info', 'scripts',
  'device-tags', 'users', 'pin-audit', 'temp-access',
];

// ── GET /api/migrate/status ────────────────────────────────────────────────────
// Lists all containers in the Cosmos DB database and identifies old vs new.
router.get('/status', async (_req, res) => {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const client   = new CosmosClient({ endpoint: config.cosmos.endpoint, key: config.cosmos.key });
    const database = client.database(config.cosmos.database);
    const { resources: containers } = await database.containers.readAll().fetchAll();
    const names = containers.map(c => c.id);

    const oldFound = names.filter(n => OLD_CONTAINERS.includes(n));
    const newFound = names.filter(n => NEW_CONTAINERS.includes(n));
    const unknown  = names.filter(n => !OLD_CONTAINERS.includes(n) && !NEW_CONTAINERS.includes(n));

    return res.json({
      success:          true,
      database:         config.cosmos.database,
      allContainers:    names,
      newContainers:    newFound,
      oldContainers:    oldFound,
      unknownContainers:unknown,
      migrationStatus:  oldFound.length === 0 ? '✅ CLEAN — only new containers exist' : `⚠️  OLD CONTAINERS FOUND: ${oldFound.join(', ')} — call POST /api/migrate/delete-old to remove them`,
      newContainersMissing: NEW_CONTAINERS.filter(n => !names.includes(n)),
    });
  } catch (err) {
    logger.error('[migrate] status error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/migrate/delete-old ─────────────────────────────────────────────
// Permanently deletes old containers from Azure Cosmos DB.
// Safe: only deletes containers listed in OLD_CONTAINERS.
router.post('/delete-old', async (_req, res) => {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const client   = new CosmosClient({ endpoint: config.cosmos.endpoint, key: config.cosmos.key });
    const database = client.database(config.cosmos.database);
    const { resources: containers } = await database.containers.readAll().fetchAll();
    const existingNames = containers.map(c => c.id);

    const toDelete = OLD_CONTAINERS.filter(n => existingNames.includes(n));
    if (toDelete.length === 0) {
      return res.json({ success: true, message: 'No old containers found. Nothing to delete.', deleted: [] });
    }

    const results = [];
    for (const name of toDelete) {
      try {
        await database.container(name).delete();
        logger.info(`[migrate] Deleted old container: ${name}`);
        results.push({ container: name, status: 'deleted' });
      } catch (e) {
        logger.error(`[migrate] Failed to delete container ${name}`, { error: e.message });
        results.push({ container: name, status: 'error', error: e.message });
      }
    }

    const deleted  = results.filter(r => r.status === 'deleted').map(r => r.container);
    const failed   = results.filter(r => r.status === 'error');

    return res.json({
      success:  failed.length === 0,
      message:  `Deleted ${deleted.length} old container(s).${failed.length > 0 ? ` ${failed.length} failed.` : ''}`,
      deleted,
      failed,
    });
  } catch (err) {
    logger.error('[migrate] delete-old error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/migrate/verify ───────────────────────────────────────────────────
// Verifies the 4 new containers exist, have documents, and are reachable.
router.get('/verify', async (_req, res) => {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const checks = {};

    // dashboard — check doc counts per type
    try {
      const [ov, fix, hip, sec, sys, scr] = await Promise.all([
        cosmos.queryByType('overview'),
        cosmos.queryByType('fix'),
        cosmos.queryByType('hip'),
        cosmos.queryByType('security'),
        cosmos.queryByType('system'),
        cosmos.queryByType('script'),
      ]);
      checks.dashboard = {
        status:   '✅ reachable',
        overview: ov.length,
        fixes:    fix.length,
        hip:      hip.length,
        security: sec.length,
        system:   sys.length,
        scripts:  scr.length,
        total:    ov.length + fix.length + hip.length + sec.length + sys.length + scr.length,
      };
    } catch (e) {
      checks.dashboard = { status: '❌ error', error: e.message };
    }

    // admin — check doc counts per type
    try {
      const [users, settings, tags, catalog, tempAccess] = await Promise.all([
        cosmos.queryAdminByType('user'),
        cosmos.queryAdminByType('admin-settings'),
        cosmos.queryAdminByType('tag-assignment'),
        cosmos.queryAdminByType('tag-catalog'),
        cosmos.queryAdminByType('temp-access'),
      ]);
      checks.admin = {
        status:     '✅ reachable',
        users:      users.length,
        settings:   settings.length,
        tagAssign:  tags.length,
        tagCatalog: catalog.length,
        tempAccess: tempAccess.length,
        total:      users.length + settings.length + tags.length + catalog.length + tempAccess.length,
      };
    } catch (e) {
      checks.admin = { status: '❌ error', error: e.message };
    }

    // pins
    try {
      const docs = await cosmos.readAll('pins');
      checks.pins = { status: '✅ reachable', count: docs.length };
    } catch (e) {
      checks.pins = { status: '❌ error', error: e.message };
    }

    // audit
    try {
      const docs = await cosmos.readAll('audit');
      checks.audit = { status: '✅ reachable', count: docs.length };
    } catch (e) {
      checks.audit = { status: '❌ error', error: e.message };
    }

    const allOk = Object.values(checks).every(c => c.status.startsWith('✅'));
    return res.json({
      success:   allOk,
      database:  config.cosmos.database,
      containers: checks,
      summary:   allOk
        ? '✅ All 4 containers are reachable and populated.'
        : '⚠️  One or more containers have issues. Check the containers object above.',
    });
  } catch (err) {
    logger.error('[migrate] verify error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
