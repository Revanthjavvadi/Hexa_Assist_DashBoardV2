'use strict';
/**
 * System Info Controller — reads from unified 'dashboard' Cosmos container (type='system').
 */
const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

async function getSystemInfo(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const docs = await cosmos.queryByType('system');
    const data = docs
      .map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => d)
      .sort((a, b) => (a.hostname || '').localeCompare(b.hostname || ''));
    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[systemController] error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch system info data' });
  }
}

module.exports = { getSystemInfo };
