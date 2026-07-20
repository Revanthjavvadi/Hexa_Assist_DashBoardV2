'use strict';
/**
 * Scripts Controller — reads from unified 'dashboard' Cosmos container (type='script').
 * Scripts are read-only; write operations remain disabled.
 */
const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

function mapCategory(cat) {
  const c = (cat || '').toLowerCase();
  if (c === 'security' || c === 'compliance') return 'Compliance';
  if (c === 'network' || c === 'global protect') return 'Diagnostic';
  if (c === 'windows update' || c === 'device') return 'Utility';
  return 'Fix';
}

// GET /api/scripts
async function listScripts(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const docs = await cosmos.queryByType('script');
    const data = docs.map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => ({
      ...d,
      container:    'dashboard',
      size:         d.size         || '—',
      lastModified: d.lastModified || '—',
      category:     mapCategory(d.category),
    }));
    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[scriptsController] listScripts error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to list scripts' });
  }
}

// GET /api/scripts/:id
async function getScript(req, res) {
  const { id } = req.params;
  if (!id || !/^[\w\-. ]+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid script id' });
  }
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    // Try direct read first (fast path — id lookup in dashboard container)
    const doc = await cosmos.readOne('dashboard', id);
    if (doc && doc.type === 'script') {
      const { _rid, _self, _etag, _attachments, _ts, type, ...data } = doc;
      return res.json({ success: true, data });
    }
    // Fallback: query by type + id match (for scripts where id may not be partition key)
    const docs = await cosmos.queryByType('script');
    const match = docs.find(d => d.id === id);
    if (!match) return res.status(404).json({ success: false, error: 'Script not found' });
    const { _rid, _self, _etag, _attachments, _ts, type, ...data } = match;
    return res.json({ success: true, data });
  } catch (err) {
    logger.error('[scriptsController] getScript error', { id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch script' });
  }
}

async function saveScript(_req, res) {
  res.status(403).json({ success: false, error: 'Scripts are read-only in this environment.' });
}

async function deleteScript(_req, res) {
  res.status(403).json({ success: false, error: 'Scripts are read-only in this environment.' });
}

module.exports = { listScripts, getScript, saveScript, deleteScript };
