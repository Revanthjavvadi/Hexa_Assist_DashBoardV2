'use strict';
/**
 * Fixes Controller — reads from the unified 'dashboard' Cosmos container (type='fix').
 * Sorts newest-first using rawTimestamp (ISO) if present, falling back to
 * parsing the IST display string.
 */
const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

/**
 * Parse a timestamp that may be:
 *   - ISO:  "2026-06-29T04:43:15Z"
 *   - IST:  "29 Jun 2026, 10:13:45 IST"
 * Returns ms-since-epoch for reliable numeric sorting, or 0 on failure.
 */
function parseTs(ts) {
  if (!ts || ts === '—') return 0;
  // ISO / UTC strings
  let d = new Date(ts);
  if (!isNaN(d.getTime())) return d.getTime();
  // IST display string: "29 Jun 2026, 10:13:45 IST"
  const cleaned = ts.replace(' IST', '').replace(',', '');
  d = new Date(cleaned);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

async function getFixes(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const docs = await cosmos.queryByType('fix');
    const data = docs.map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => d);

    // Sort newest-first: prefer rawTimestamp (ISO) stored by syncJob,
    // fall back to parsing the display timestamp string.
    data.sort((a, b) => {
      const ta = parseTs(a.rawTimestamp || a.timestamp);
      const tb = parseTs(b.rawTimestamp || b.timestamp);
      return tb - ta;   // descending — newest on top
    });

    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[fixesController] error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch fixes data' });
  }
}

module.exports = { getFixes };
