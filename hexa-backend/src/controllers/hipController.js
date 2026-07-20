'use strict';
/**
 * HIP Checks Controller — reads from unified 'dashboard' Cosmos container (type='hip').
 */
const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

async function getHipChecks(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const docs = await cosmos.queryByType('hip');
    const data = docs
      .map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => d)
      .sort((a, b) => (a.deviceName || '').localeCompare(b.deviceName || ''));
    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[hipController] error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch HIP check data' });
  }
}

module.exports = { getHipChecks };
