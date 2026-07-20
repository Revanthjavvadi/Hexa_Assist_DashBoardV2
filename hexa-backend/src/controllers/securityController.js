'use strict';
/**
 * Security Controller — reads from unified 'dashboard' Cosmos container (type='security').
 */
const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

async function getSecurity(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const docs = await cosmos.queryByType('security');
    const data = docs
      .map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => d)
      .sort((a, b) => (a.deviceName || '').localeCompare(b.deviceName || ''));
    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[securityController] error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch security data' });
  }
}

module.exports = { getSecurity };
