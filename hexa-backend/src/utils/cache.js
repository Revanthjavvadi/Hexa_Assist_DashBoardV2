'use strict';
/**
 * In-memory TTL cache with metadata.
 *
 * Prevents hammering Blob Storage on every request.
 * Default TTL = CACHE_TTL_SECONDS (300 s = 5 min).
 *
 * Each entry tracks:
 *   data       – the cached value
 *   expiresAt  – unix ms when the entry expires
 *   cachedAt   – unix ms when the entry was last written
 */
const config = require('../config/env');

/** @type {Map<string, { data: unknown, expiresAt: number, cachedAt: number }>} */
const store = new Map();

/** Return cached data or null if missing / expired */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.data;
}

/** Write data with an optional per-call TTL override (seconds) */
function set(key, data, ttlSeconds = config.cacheTtlSeconds) {
  const now = Date.now();
  store.set(key, {
    data,
    expiresAt: now + ttlSeconds * 1000,
    cachedAt:  now,
  });
}

/** Seconds since key was cached, or null if not present / expired */
function getAge(key) {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return Math.floor((Date.now() - entry.cachedAt) / 1000);
}

/** ISO timestamp of last write, or null */
function getCachedAt(key) {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return new Date(entry.cachedAt).toISOString();
}

/** Remove one key */
function invalidate(key) { store.delete(key); }

/** Remove all keys matching a prefix */
function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Wipe everything */
function clear() { store.clear(); }

/** All keys currently in cache (non-expired) */
function keys() {
  const now = Date.now();
  return [...store.entries()]
    .filter(([, v]) => v.expiresAt > now)
    .map(([k]) => k);
}

module.exports = { get, set, getAge, getCachedAt, invalidate, invalidatePrefix, clear, keys };
