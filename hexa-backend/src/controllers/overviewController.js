'use strict';
/**
 * Overview Controller — reads from the unified 'dashboard' Cosmos container.
 * Fetches the single doc where type='overview' and id='latest'.
 */
const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

async function getOverview(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured. Add COSMOS_ENDPOINT and COSMOS_KEY to .env.' });
  }
  try {
    const docs = await cosmos.queryByType('overview');
    const doc  = docs.find(d => d.id === 'latest') ?? docs[0] ?? null;
    if (!doc) return res.json({ success: true, live: true, data: null });
    const { _rid, _self, _etag, _attachments, _ts, type, ...data } = doc;
    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[overviewController] error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch overview data' });
  }
}

module.exports = { getOverview };
