'use strict';
/**
 * PIN Audit Controller — reads from the 'audit' Cosmos container.
 * Each doc: { id, hostname, userId, outcome, timestamp, scriptName, dataSource }
 */

const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

function toIST(iso) {
  if (!iso || iso === '—') return '—';
  try {
    if (String(iso).includes('IST')) return iso;
    return new Date(iso).toLocaleString('en-IN', {
      timeZone:  'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }) + ' IST';
  } catch { return iso; }
}

// ── GET /api/pins/audit ───────────────────────────────────────────────────────
async function getAuditLog(_req, res) {
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  try {
    const docs = await cosmos.readAll('audit');
    logger.info('[pinAuditController] audit docs loaded', { count: docs.length });

    const map = {};
    for (const d of docs) {
      const hostname = (d.hostname || d.device_name || '').trim();
      const userId   = (d.userId   || d.logged_user || '').trim();
      const outcome  = (d.outcome  || d.result      || '').toUpperCase();

      if (d.dataSource === 'Dashboard') continue;
      if (!hostname || hostname === '—') continue;

      if (!map[hostname]) {
        map[hostname] = { hostname, userId: userId || '—', successCount: 0, failedCount: 0 };
      }
      if (outcome === 'SUCCESS')     map[hostname].successCount++;
      else if (outcome === 'FAILED') map[hostname].failedCount++;
      if (userId && userId !== '—')  map[hostname].userId = userId;
    }

    const data = Object.values(map).sort((a, b) => a.hostname.localeCompare(b.hostname));
    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[pinAuditController] getAuditLog error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Unable to retrieve audit records.' });
  }
}

// ── GET /api/pins/audit/:hostname/attempts ────────────────────────────────────
async function getAttempts(req, res) {
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });

  const hostname = decodeURIComponent(req.params.hostname || '').trim();
  const outcome  = (req.query.outcome || '').toUpperCase();
  if (!hostname)
    return res.status(400).json({ success: false, error: 'Device name is required.' });

  try {
    const docs = await cosmos.readAll('audit');
    let filtered = docs.filter(d => (d.hostname || d.device_name || '').trim() === hostname);
    if (outcome === 'SUCCESS' || outcome === 'FAILED') {
      filtered = filtered.filter(d => (d.outcome || d.result || '').toUpperCase() === outcome);
    }
    filtered.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    const data = filtered.map(({ _rid, _self, _etag, _attachments, _ts, ...d }) => ({
      scriptName: d.scriptName || d.script_url || '—',
      timestamp:  toIST(d.timestamp),
      outcome:    (d.outcome || d.result || '—').toUpperCase(),
      details:    d.details || '',
    }));
    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[pinAuditController] getAttempts error', { hostname, error: err.message });
    return res.status(500).json({ success: false, error: 'Unable to retrieve attempt records.' });
  }
}

module.exports = { getAuditLog, getAttempts };
