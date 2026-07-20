'use strict';
/**
 * Auth Controller — users stored in 'admin' container (type='user').
 *
 * POST /api/auth/login        { username } → sets hexa_user cookie
 * POST /api/auth/logout       → clears cookie
 * GET  /api/auth/users        → list all users
 * POST /api/auth/users        → create user
 * PUT  /api/auth/users/:id    → update role / displayName
 * DELETE /api/auth/users/:id  → delete user
 * POST /api/auth/seed         → seed users.json → Cosmos if empty
 */

const cosmos = require('../services/cosmosService');
const logger  = require('../utils/logger');

const VALID_ROLES = ['admin', 'developer', 'global_reader', 'reader_pin', 'reader_tag'];

// ── POST /api/auth/login ──────────────────────────────────────────────────────
async function login(req, res) {
  const { username } = req.body ?? {};
  if (!username?.trim()) {
    return res.status(400).json({ success: false, error: 'Username is required.' });
  }
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }
  try {
    // Users live in admin container with type='user'
    const allUsers = await cosmos.queryAdminByType('user');
    const user = allUsers.find(u =>
      (u.username || '').toLowerCase() === username.trim().toLowerCase() ||
      (u.email    || '').toLowerCase() === username.trim().toLowerCase()
    );
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found. Please check your username.' });
    }
    const sessionUser = {
      id:          user.id,
      username:    user.username || user.email,
      displayName: user.displayName || user.username || user.email,
      role:        user.role || 'global_reader',
      email:       user.email || '',
    };
    res.cookie('hexa_user', JSON.stringify(sessionUser), {
      httpOnly: false,
      sameSite: 'lax',
      maxAge:   8 * 60 * 60 * 1000,
    });
    logger.info('[authController] Login', { username: sessionUser.username, role: sessionUser.role });
    return res.json({ success: true, user: sessionUser });
  } catch (err) {
    logger.error('[authController] login error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Login failed.' });
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
function logout(_req, res) {
  res.clearCookie('hexa_user');
  return res.json({ success: true });
}

// ── GET /api/auth/users ───────────────────────────────────────────────────────
async function listUsers(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }
  try {
    const docs = await cosmos.queryAdminByType('user');
    const data = docs.map(({ _rid, _self, _etag, _attachments, _ts, type, ...d }) => d);
    return res.json({ success: true, data });
  } catch (err) {
    logger.error('[authController] listUsers error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch users.' });
  }
}

// ── POST /api/auth/users ──────────────────────────────────────────────────────
async function createUser(req, res) {
  const { username, email, displayName, role } = req.body ?? {};
  if (!username && !email) {
    return res.status(400).json({ success: false, error: 'username or email is required.' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }
  try {
    const id  = (username || email).toLowerCase().replace(/[^a-z0-9]/g, '_');
    const doc = {
      id,
      type:        'user',
      username:    username || email,
      email:       email || '',
      displayName: displayName || username || email,
      role,
      createdAt:   new Date().toISOString(),
    };
    await cosmos.upsertOne('admin', doc);
    logger.info('[authController] User created', { id, role });
    const { _rid, _self, _etag, _attachments, _ts, type, ...clean } = doc;
    return res.json({ success: true, data: clean });
  } catch (err) {
    logger.error('[authController] createUser error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to create user.' });
  }
}

// ── PUT /api/auth/users/:id ───────────────────────────────────────────────────
async function updateUser(req, res) {
  const { id } = req.params;
  const { role, displayName } = req.body ?? {};
  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role.' });
  }
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }
  try {
    const existing = await cosmos.readOne('admin', id);
    if (!existing) return res.status(404).json({ success: false, error: 'User not found.' });
    const updated = { ...existing, ...(role && { role }), ...(displayName && { displayName }) };
    await cosmos.upsertOne('admin', updated);
    const { _rid, _self, _etag, _attachments, _ts, type, ...clean } = updated;
    logger.info('[authController] User updated', { id, role });
    return res.json({ success: true, data: clean });
  } catch (err) {
    logger.error('[authController] updateUser error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to update user.' });
  }
}

// ── DELETE /api/auth/users/:id ────────────────────────────────────────────────
async function deleteUser(req, res) {
  const { id } = req.params;
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable.' });
  }
  try {
    await cosmos.deleteOne('admin', id);
    logger.info('[authController] User deleted', { id });
    return res.json({ success: true });
  } catch (err) {
    logger.error('[authController] deleteUser error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to delete user.' });
  }
}

// ── POST /api/auth/seed ───────────────────────────────────────────────────────
async function seedUsers(_req, res) {
  if (!cosmos.isAvailable()) {
    return res.status(503).json({ success: false, error: 'Cosmos DB not configured.' });
  }
  try {
    const existing = await cosmos.queryAdminByType('user');
    if (existing.length > 0) {
      return res.json({ success: true, message: `Already seeded (${existing.length} users exist).`, count: existing.length });
    }
    const usersJson = require('../users.json');
    for (const u of usersJson) {
      await cosmos.upsertOne('admin', {
        id:          u.id,
        type:        'user',
        username:    u.username,
        email:       u.email || '',
        displayName: u.displayName,
        role:        u.role,
        createdAt:   new Date().toISOString(),
      });
    }
    logger.info('[authController] Users seeded', { count: usersJson.length });
    return res.json({ success: true, message: `Seeded ${usersJson.length} users.`, count: usersJson.length });
  } catch (err) {
    logger.error('[authController] seedUsers error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { login, logout, listUsers, createUser, updateUser, deleteUser, seedUsers };
