'use strict';
/**
 * PIN Audit Routes — mounted at /api/pins/audit (before /api/pins to avoid conflicts)
 * Data read exclusively from Cosmos DB 'audit' container.
 */
const router    = require('express').Router();
const auditCtrl = require('../controllers/pinAuditController');
const syncJob   = require('../services/syncJob');
const cosmos    = require('../services/cosmosService');
const logger    = require('../utils/logger');

// GET /api/pins/audit — aggregated per device, one row per hostname
router.get('/', auditCtrl.getAuditLog);

// GET /api/pins/audit/debug — returns raw Cosmos docs for diagnosis
router.get('/debug', async (_req, res) => {
  if (!cosmos.isAvailable()) return res.status(503).json({ error: 'Cosmos not available' });
  try {
    const docs = await cosmos.readAll('audit');
    return res.json({
      total: docs.length,
      breakdown: docs.reduce((acc, d) => {
        const o = (d.outcome || d.result || 'UNKNOWN').toUpperCase();
        acc[o] = (acc[o] || 0) + 1;
        return acc;
      }, {}),
      hostnames: [...new Set(docs.map(d => d.hostname || d.device_name || '—'))],
      sample: docs.slice(0, 3).map(({ id, hostname, userId, outcome, timestamp, scriptName, blobName }) =>
        ({ id, hostname, userId, outcome, timestamp, scriptName, blobName })
      ),
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// GET /api/pins/audit/:hostname/attempts?outcome=SUCCESS|FAILED
router.get('/:hostname/attempts', auditCtrl.getAttempts);

// POST /api/pins/audit/flush — clears stale audit docs and triggers fresh Blob→Cosmos sync
router.post('/flush', async (_req, res) => {
  logger.info('[PinAudit] Flush + re-sync requested');
  try {
    if (cosmos.isAvailable()) {
      await cosmos.deleteAll('audit');
      logger.info('[PinAudit] audit container cleared');
    }
    if (typeof syncJob.forceAuditSync === 'function') {
      syncJob.forceAuditSync()
        .then(() => logger.info('[PinAudit] Re-sync completed'))
        .catch(e  => logger.error('[PinAudit] Re-sync error', { error: e.message }));
    }
    return res.status(202).json({
      success: true,
      message: 'Audit container cleared. Fresh data is being loaded from source.',
    });
  } catch (err) {
    logger.error('[PinAudit] Flush error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Flush failed: ' + err.message });
  }
});

module.exports = router;
