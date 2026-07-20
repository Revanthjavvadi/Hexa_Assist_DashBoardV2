'use strict';
/**
 * Temporary Access Controller — stored in 'admin' container (type='temp-access').
 *
 * GET    /api/temp-access               — list all active grants
 * POST   /api/temp-access               — create a new grant
 * DELETE /api/temp-access/:id           — revoke a grant
 * GET    /api/temp-access/user/:userId  — active grants for a user
 */

const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');
const { randomUUID } = require('crypto');

// ── GET /api/temp-access ──────────────────────────────────────────────────────
async function listGrants(_req, res) {
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const docs = await cosmos.queryAdminByType('temp-access');
    const now  = new Date();
    // Lazy expiry: deactivate expired grants
    const toDeactivate = docs.filter(d => d.active && new Date(d.expiresAt) <= now);
    await Promise.all(toDeactivate.map(d => cosmos.upsertOne('admin', { ...d, active: false })));

    const active = docs
      .filter(d => d.active && new Date(d.expiresAt) > now)
      .map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => d)
      .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));

    return res.json({ success: true, data: active });
  } catch (err) {
    logger.error('[tempAccessController] listGrants error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch grants.' });
  }
}

// ── POST /api/temp-access ─────────────────────────────────────────────────────
async function createGrant(req, res) {
  const { userId, username, displayName, module, permission, grantedBy, grantedByDisplayName, expiresAt } = req.body ?? {};
  if (!userId || !module || !permission || !grantedBy || !expiresAt)
    return res.status(400).json({ success: false, error: 'userId, module, permission, grantedBy, expiresAt are required.' });
  const expiry = new Date(expiresAt);
  if (isNaN(expiry.getTime()) || expiry <= new Date())
    return res.status(400).json({ success: false, error: 'expiresAt must be a valid future date/time.' });
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const doc = {
      id:                   randomUUID(),
      type:                 'temp-access',
      userId,
      username:             username || userId,
      displayName:          displayName || username || userId,
      module,
      permission,
      grantedBy,
      grantedByDisplayName: grantedByDisplayName || grantedBy,
      startTime:            new Date().toISOString(),
      expiresAt:            expiry.toISOString(),
      active:               true,
    };
    await cosmos.upsertOne('admin', doc);
    logger.info('[tempAccessController] Grant created', { userId, module, permission });
    return res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('[tempAccessController] createGrant error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to create grant.' });
  }
}

// ── DELETE /api/temp-access/:id ───────────────────────────────────────────────
async function revokeGrant(req, res) {
  const { id } = req.params;
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  try {
    const existing = await cosmos.readOne('admin', id);
    if (!existing) return res.status(404).json({ success: false, error: 'Grant not found.' });
    await cosmos.upsertOne('admin', { ...existing, active: false });
    logger.info('[tempAccessController] Grant revoked', { id });
    return res.json({ success: true });
  } catch (err) {
    logger.error('[tempAccessController] revokeGrant error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to revoke grant.' });
  }
}

// ── GET /api/temp-access/user/:userId ─────────────────────────────────────────
async function getUserGrants(req, res) {
  const { userId } = req.params;
  if (!cosmos.isAvailable())
    return res.status(503).json({ success: false, data: [] });
  try {
    const now  = new Date();
    const docs = await cosmos.query(
      'admin',
      'SELECT * FROM c WHERE c.type = @type AND c.userId = @uid AND c.active = true',
      [{ name: '@type', value: 'temp-access' }, { name: '@uid', value: userId }]
    );
    const active = docs
      .filter(d => new Date(d.expiresAt) > now)
      .map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => d);
    return res.json({ success: true, data: active });
  } catch (err) {
    logger.error('[tempAccessController] getUserGrants error', { error: err.message });
    return res.status(500).json({ success: false, data: [] });
  }
}

module.exports = { listGrants, createGrant, revokeGrant, getUserGrants };
