'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Cache Store — Structured in-memory "tables"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the separate storage layer between Azure Blob Storage and the API.
 *
 * Azure Blob Storage  →  syncJob (every 30 min)  →  cacheStore  →  controllers
 *
 * Controllers NEVER read directly from Azure. They read from here.
 * Azure Blob Storage is never written to — it is the source of truth only.
 *
 * Each "table" holds:
 *   data       — the fully-transformed, ready-to-serve response object
 *   syncedAt   — ISO timestamp of last successful sync
 *   syncCount  — number of times this table has been synced
 *   live       — whether the last sync got real data (true) or is empty
 */

const store = {
  overview:  { data: null, syncedAt: null, syncCount: 0, live: false },
  fixes:     { data: null, syncedAt: null, syncCount: 0, live: false },
  hip:       { data: null, syncedAt: null, syncCount: 0, live: false },
  security:  { data: null, syncedAt: null, syncCount: 0, live: false },
  system:    { data: null, syncedAt: null, syncCount: 0, live: false },
  scripts:   { data: null, syncedAt: null, syncCount: 0, live: false },
  pins:      { data: null, syncedAt: null, syncCount: 0, live: false },
};

// ── Write a table ─────────────────────────────────────────────────────────────
function write(table, data, live = true) {
  if (!store[table]) throw new Error(`Unknown cache table: ${table}`);
  store[table].data      = data;
  store[table].syncedAt  = new Date().toISOString();
  store[table].syncCount += 1;
  store[table].live      = live;
}

// ── Read a table's data (returns null if not yet synced) ──────────────────────
function read(table) {
  const entry = store[table];
  if (!entry) throw new Error(`Unknown cache table: ${table}`);
  return entry.data;
}

// ── Check whether a table has been populated ──────────────────────────────────
function isReady(table) {
  return store[table]?.data !== null;
}

// ── Get table metadata (for /api/sync-status) ─────────────────────────────────
function getMeta(table) {
  const e = store[table];
  if (!e) return null;
  return {
    syncedAt:  e.syncedAt,
    syncCount: e.syncCount,
    live:      e.live,
    hasData:   e.data !== null,
  };
}

// ── Get all table metadata ────────────────────────────────────────────────────
function getAllMeta() {
  return Object.fromEntries(
    Object.keys(store).map(k => [k, getMeta(k)])
  );
}

// ── Clear one or all tables (for forced re-sync) ──────────────────────────────
function clear(table) {
  if (table) {
    if (store[table]) {
      store[table].data     = null;
      store[table].syncedAt = null;
    }
  } else {
    Object.keys(store).forEach(k => {
      store[k].data     = null;
      store[k].syncedAt = null;
    });
  }
}

module.exports = { write, read, isReady, getMeta, getAllMeta, clear };
