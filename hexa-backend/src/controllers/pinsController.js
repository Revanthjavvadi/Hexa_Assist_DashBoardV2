'use strict';
/**
 * Pins Controller
 *
 * Architecture (strict):
 *   Cosmos DB → Dashboard only. No Blob access, no audit writing from dashboard.
 *
 * Audit log flow:
 *   Azure Blob Storage (pin_audit/{hostname}/{user_id}/*.json)
 *     → syncJob (every 15 min) reads blob, syncs to Cosmos pin-audit
 *     → Dashboard reads Cosmos pin-audit only
 *
 * The dashboard NEVER creates audit records. Audit data is blob-only.
 *
 * GET  /api/pins            — list PINs (rawPin always masked)
 * GET  /api/pins/:id/reveal — return decoded PIN from Cosmos
 * POST /api/pins/purge      — immediately remove stale pins not in system_info
 */

const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

// ── GET /api/pins — list from Cosmos DB, filtered to active devices only ──────
async function getPins(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }
  try {
    const [pinDocs, sysDocs] = await Promise.all([
      cosmos.readAll('pins'),
      cosmos.queryByType('system'),
    ]);

    // Build active hostname set from system_info (source of truth for active devices)
    const activeHostnames = new Set(
      sysDocs.map(d => (d.hostname || '').toLowerCase().trim()).filter(Boolean)
    );

    const data = pinDocs
      .filter(d => {
        // If system docs exist, only show pins for active devices
        if (activeHostnames.size === 0) return true;
        return activeHostnames.has((d.hostname || '').toLowerCase().trim());
      })
      .map(({ _rid, _self, _etag, _attachments, _ts, rawPin, pin_token, ...d }) => ({
        ...d,
        pin: '● ● ● ●',
      }))
      .sort((a, b) => (a.hostname || '').localeCompare(b.hostname || ''));

    return res.json({ success: true, live: true, data });
  } catch (err) {
    logger.error('[pinsController] getPins error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Unable to retrieve PIN records.' });
  }
}

// ── POST /api/pins/purge — immediately purge stale pins ───────────────────────
// Removes any Cosmos pin records whose hostname is NOT in active system_info devices.
async function purgeStale(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }
  try {
    const [pinDocs, sysDocs] = await Promise.all([
      cosmos.readAll('pins'),
      cosmos.queryByType('system'),
    ]);

    const activeHostnames = new Set(
      sysDocs.map(d => (d.hostname || '').toLowerCase().trim()).filter(Boolean)
    );

    if (activeHostnames.size === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active system devices found — purge skipped to avoid removing all pins.',
        removed: 0,
      });
    }

    const stale = pinDocs.filter(d =>
      !activeHostnames.has((d.hostname || '').toLowerCase().trim())
    );

    if (stale.length === 0) {
      return res.json({ success: true, message: 'No stale pins found.', removed: 0 });
    }

    await Promise.all(stale.map(d => cosmos.deleteOne('pins', d.id)));
    logger.info('[pinsController] Purged stale pins', {
      removed: stale.length,
      hostnames: stale.map(d => d.hostname),
    });

    return res.json({
      success: true,
      message: `Removed ${stale.length} stale PIN record(s) not in active devices.`,
      removed: stale.length,
      removedHostnames: stale.map(d => d.hostname),
    });
  } catch (err) {
    logger.error('[pinsController] purgeStale error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Unable to purge stale pins.' });
  }
}

// ── GET /api/pins/:id/reveal — read decoded PIN from Cosmos only ──────────────
// Does NOT write any audit record. Audit data comes from Blob Storage only.
async function revealPin(req, res) {
  const { id } = req.params;

  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }

  try {
    // Direct point-read: the Cosmos document id IS the original hostname
    // (e.g. "LTCH-5CD44666CY"), which is exactly what the frontend passes.
    let doc = await cosmos.readOne('pins', String(id));

    // Fallback scan: handles any legacy pin-X documents still in Cosmos
    // that haven't been replaced by the next sync cycle yet.
    if (!doc) {
      const all = await cosmos.readAll('pins');
      doc = all.find(d =>
        String(d.id)    === String(id) ||
        String(d.seqId) === String(id)
      ) ?? null;
    }

    if (!doc) {
      logger.warn('[pinsController] PIN record not found', { id });
      return res.status(404).json({ success: false, error: 'PIN record not found.' });
    }

    const pin = doc.rawPin ? String(doc.rawPin).trim() : '';
    if (!pin) {
      logger.warn('[pinsController] rawPin empty for record', { id, hostname: doc.hostname });
      return res.status(404).json({ success: false, error: 'PIN not yet available for this device.' });
    }

    logger.info('[pinsController] PIN revealed from Cosmos DB', { hostname: doc.hostname });
    return res.json({ success: true, pin });

  } catch (err) {
    logger.error('[pinsController] revealPin error', { id, error: err.message });
    return res.status(500).json({ success: false, error: 'Unable to retrieve PIN.' });
  }
}

module.exports = { getPins, revealPin };
