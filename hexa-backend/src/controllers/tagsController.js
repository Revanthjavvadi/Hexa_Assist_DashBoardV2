'use strict';
/**
 * Tags Controller — device tag assignments stored in 'admin' container.
 * type='tag-assignment' for device docs, type='tag-catalog' for the catalog.
 *
 * GET  /api/tags          → all tag assignments
 * PUT  /api/tags          → replace full tag assignment list
 * POST /api/tags/assign   → add tag to device
 * POST /api/tags/remove   → remove tag from device
 */

const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

const TAG_CATALOG_ID = '__tag_catalog__';

// ── GET /api/tags ─────────────────────────────────────────────────────────────
async function getTags(_req, res) {
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const docs = await cosmos.queryAdminByType('tag-assignment');
    const data = docs.map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => d);
    return res.json({ success: true, data, live: true });
  } catch (err) {
    logger.error('[tagsController] getTags error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to read tag assignments' });
  }
}

// ── PUT /api/tags — replace full list ─────────────────────────────────────────
async function putTags(req, res) {
  const entries = req.body;
  if (!Array.isArray(entries))
    return res.status(400).json({ success: false, error: 'Body must be a JSON array of tag entries' });
  for (const e of entries) {
    if (typeof e.hostname !== 'string' || !Array.isArray(e.tags))
      return res.status(400).json({ success: false, error: 'Each entry must have { hostname: string, tags: string[] }' });
  }
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    // Delete only tag-assignment docs (preserves catalog, settings, users, etc.)
    await cosmos.deleteAdminByType('tag-assignment');
    const docs = entries.map(e => ({ ...e, id: e.hostname, type: 'tag-assignment' }));
    if (docs.length > 0) await cosmos.upsertBulk('admin', docs);
    logger.info('[tagsController] putTags — replaced full list', { count: docs.length });
    return res.json({ success: true, count: docs.length });
  } catch (err) {
    logger.error('[tagsController] putTags error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /api/tags/assign ─────────────────────────────────────────────────────
async function assignTag(req, res) {
  const { hostname, tag } = req.body ?? {};
  if (!hostname || !tag)
    return res.status(400).json({ success: false, error: 'hostname and tag are required' });
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const existing = await cosmos.readOne('admin', hostname);
    const now      = new Date().toISOString();
    let doc;
    if (existing && existing.type === 'tag-assignment') {
      const tags = Array.isArray(existing.tags) ? existing.tags : [];
      if (!tags.includes(tag)) tags.push(tag);
      doc = { ...existing, tags, assignedAt: now };
    } else {
      doc = { id: hostname, type: 'tag-assignment', hostname, tags: [tag], assignedAt: now };
    }
    await cosmos.upsertOne('admin', doc);
    logger.info('[tagsController] assignTag', { hostname, tag });
    const { _rid, _self, _etag, _attachments, _ts, type, ...clean } = doc;
    return res.json({ success: true, data: clean });
  } catch (err) {
    logger.error('[tagsController] assignTag error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /api/tags/remove ─────────────────────────────────────────────────────
async function removeTag(req, res) {
  const { hostname, tag } = req.body ?? {};
  if (!hostname || !tag)
    return res.status(400).json({ success: false, error: 'hostname and tag are required' });
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const existing = await cosmos.readOne('admin', hostname);
    if (existing && existing.type === 'tag-assignment') {
      const tags = (existing.tags || []).filter(t => t !== tag);
      if (tags.length === 0) await cosmos.deleteOne('admin', hostname);
      else                   await cosmos.upsertOne('admin', { ...existing, tags });
    }
    logger.info('[tagsController] removeTag', { hostname, tag });
    return res.json({ success: true });
  } catch (err) {
    logger.error('[tagsController] removeTag error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getTags, putTags, assignTag, removeTag };
