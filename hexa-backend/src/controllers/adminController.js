'use strict';
/**
 * Admin Settings + Tag Management Controller
 *
 * All data lives in the 'admin' Cosmos container with type fields:
 *   type='admin-settings'  — sync interval settings  (id='__admin_settings__')
 *   type='tag-catalog'     — available tag names      (id='__tag_catalog__')
 *   type='tag-assignment'  — per-device tag lists     (id=hostname)
 */

const cosmos  = require('../services/cosmosService');
const syncJob = require('../services/syncJob');
const logger  = require('../utils/logger');

const SETTINGS_ID    = '__admin_settings__';
const TAG_CATALOG_ID = '__tag_catalog__';

// ── GET /api/admin/settings ───────────────────────────────────────────────────
async function getSettings(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const doc    = await cosmos.readOne('admin', SETTINGS_ID);
    const status = syncJob.getStatus();
    return res.json({
      success: true,
      data: {
        dashboardSyncMinutes: doc?.dashboardSyncMinutes ?? status.dashboard?.intervalMinutes ?? 15,
        pinSyncMinutes:       doc?.pinSyncMinutes       ?? status.pins?.intervalMinutes       ?? 5,
      },
    });
  } catch (err) {
    logger.error('[adminController] getSettings error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to read settings' });
  }
}

// ── PUT /api/admin/settings ───────────────────────────────────────────────────
async function saveSettings(req, res) {
  const { dashboardSyncMinutes, pinSyncMinutes } = req.body ?? {};
  const dashMin = parseInt(dashboardSyncMinutes, 10);
  const pinMin  = parseInt(pinSyncMinutes, 10);
  if (isNaN(dashMin) || dashMin < 1 || dashMin > 120)
    return res.status(400).json({ success: false, error: 'dashboardSyncMinutes must be 1–120.' });
  if (isNaN(pinMin) || pinMin < 1 || pinMin > 60)
    return res.status(400).json({ success: false, error: 'pinSyncMinutes must be 1–60.' });
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    await cosmos.upsertOne('admin', {
      id: SETTINGS_ID, type: 'admin-settings',
      dashboardSyncMinutes: dashMin, pinSyncMinutes: pinMin,
      updatedAt: new Date().toISOString(),
    });
    syncJob.updateIntervals({ dashboardSyncMinutes: dashMin, pinSyncMinutes: pinMin });
    logger.info('[adminController] Settings saved', { dashMin, pinMin });
    return res.json({ success: true, data: { dashboardSyncMinutes: dashMin, pinSyncMinutes: pinMin } });
  } catch (err) {
    logger.error('[adminController] saveSettings error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
}

// ── GET /api/admin/tags ───────────────────────────────────────────────────────
async function getTagCatalog(_req, res) {
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const doc   = await cosmos.readOne('admin', TAG_CATALOG_ID);
    const names = doc?.names ?? ['Executive Devices'];
    return res.json({ success: true, data: names });
  } catch (err) {
    logger.error('[adminController] getTagCatalog error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to read tag catalog' });
  }
}

// ── POST /api/admin/tags ──────────────────────────────────────────────────────
async function createTag(req, res) {
  const { name } = req.body ?? {};
  if (!name?.trim())
    return res.status(400).json({ success: false, error: 'Tag name is required.' });
  const tagName = name.trim();
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const doc   = await cosmos.readOne('admin', TAG_CATALOG_ID);
    const names = doc?.names ?? ['Executive Devices'];
    if (names.includes(tagName))
      return res.status(409).json({ success: false, error: 'Tag already exists.' });
    names.push(tagName);
    await cosmos.upsertOne('admin', { id: TAG_CATALOG_ID, type: 'tag-catalog', names });
    logger.info('[adminController] Tag created', { tagName });
    return res.json({ success: true, data: names });
  } catch (err) {
    logger.error('[adminController] createTag error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to create tag' });
  }
}

// ── PUT /api/admin/tags/:oldName ──────────────────────────────────────────────
async function renameTag(req, res) {
  const oldName    = decodeURIComponent(req.params.oldName || '').trim();
  const { newName } = req.body ?? {};
  if (!oldName || !newName?.trim())
    return res.status(400).json({ success: false, error: 'oldName and newName are required.' });
  const newTagName = newName.trim();
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const doc   = await cosmos.readOne('admin', TAG_CATALOG_ID);
    const names = doc?.names ?? ['Executive Devices'];
    const idx   = names.indexOf(oldName);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Tag not found.' });
    names[idx] = newTagName;
    await cosmos.upsertOne('admin', { id: TAG_CATALOG_ID, type: 'tag-catalog', names });

    // Update all tag-assignment docs that reference the old name
    const assignments = await cosmos.queryAdminByType('tag-assignment');
    const updates = assignments.filter(d => Array.isArray(d.tags) && d.tags.includes(oldName));
    for (const d of updates) {
      d.tags = d.tags.map(t => t === oldName ? newTagName : t);
      await cosmos.upsertOne('admin', d);
    }
    logger.info('[adminController] Tag renamed', { oldName, newTagName, devicesUpdated: updates.length });
    return res.json({ success: true, data: names });
  } catch (err) {
    logger.error('[adminController] renameTag error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to rename tag' });
  }
}

// ── DELETE /api/admin/tags/:name ──────────────────────────────────────────────
async function deleteTag(req, res) {
  const tagName = decodeURIComponent(req.params.name || '').trim();
  if (!tagName)
    return res.status(400).json({ success: false, error: 'Tag name is required.' });
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const doc      = await cosmos.readOne('admin', TAG_CATALOG_ID);
    const names    = doc?.names ?? ['Executive Devices'];
    const filtered = names.filter(n => n !== tagName);
    await cosmos.upsertOne('admin', { id: TAG_CATALOG_ID, type: 'tag-catalog', names: filtered });

    const assignments = await cosmos.queryAdminByType('tag-assignment');
    const toUpdate = assignments.filter(d => Array.isArray(d.tags) && d.tags.includes(tagName));
    for (const d of toUpdate) {
      d.tags = d.tags.filter(t => t !== tagName);
      if (d.tags.length === 0) await cosmos.deleteOne('admin', d.id);
      else                     await cosmos.upsertOne('admin', d);
    }
    logger.info('[adminController] Tag deleted', { tagName, devicesUpdated: toUpdate.length });
    return res.json({ success: true, data: filtered });
  } catch (err) {
    logger.error('[adminController] deleteTag error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to delete tag' });
  }
}

module.exports = { getSettings, saveSettings, getTagCatalog, createTag, renameTag, deleteTag };
