/**
 * useTagStore — Device tagging for the Executive Devices feature.
 *
 * PRIMARY STORAGE: Azure Cosmos DB (device-tags container) via backend API.
 *   - Tag assignments:  GET/POST /api/tags
 *   - Tag catalog:      GET /api/admin/tags
 *
 * localStorage is used ONLY as a same-session render cache so the UI doesn't
 * flash empty while the Cosmos round-trip completes on mount.  It is NEVER
 * used as the source of truth — every write goes to Cosmos first.
 *
 * On every mount the hook re-fetches both assignments and catalog from Cosmos,
 * so changes made by other users / sessions are always reflected.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchTags, apiAssignTag, apiRemoveTag, fetchAdminTags } from '../services/api';

export type DeviceTag = string;

// ── Render cache keys (localStorage) ─────────────────────────────────────────
const LS_TAGS_KEY    = 'hexa-device-tags-cache';
const LS_CATALOG_KEY = 'hexa-tag-catalog-cache';

function lsLoadTagMap(): Map<string, TagEntry> {
  try {
    const raw = localStorage.getItem(LS_TAGS_KEY);
    if (!raw) return new Map();
    const arr: TagEntry[] = JSON.parse(raw);
    return new Map(arr.map(e => [e.hostname, e]));
  } catch { return new Map(); }
}

function lsSaveTagMap(map: Map<string, TagEntry>): void {
  try { localStorage.setItem(LS_TAGS_KEY, JSON.stringify(Array.from(map.values()))); } catch {}
}

function lsLoadCatalog(): string[] {
  try {
    const raw = localStorage.getItem(LS_CATALOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function lsSaveCatalog(names: string[]): void {
  try { localStorage.setItem(LS_CATALOG_KEY, JSON.stringify(names)); } catch {}
}

export interface TagEntry {
  hostname:   string;
  tags:       DeviceTag[];
  assignedAt: string;
}

// ── Singleton in-memory store (initialised from cache for fast first render) ──
type Listener = () => void;
const listeners = new Set<Listener>();

let _tagMap:  Map<string, TagEntry> = lsLoadTagMap();
let _catalog: string[]              = lsLoadCatalog();

// Keep compatibility alias
export let AVAILABLE_TAGS: DeviceTag[] = _catalog;

function notifyAll() { listeners.forEach(fn => fn()); }

function hydrateTagMap(entries: TagEntry[]) {
  _tagMap = new Map(entries.map(e => [e.hostname, e]));
  lsSaveTagMap(_tagMap);
  notifyAll();
}

/** Update the catalog and notify all listeners. Called by AdminSettings after tag CRUD. */
export function setCatalog(names: string[]) {
  _catalog = names;
  AVAILABLE_TAGS = names;
  lsSaveCatalog(names);
  notifyAll();
}

/** Public getter — used outside React components */
export function getAvailableTags(): string[] { return _catalog; }

// ── Read helpers ──────────────────────────────────────────────────────────────
export function getDeviceTags(hostname: string): DeviceTag[] {
  return _tagMap.get(hostname)?.tags ?? [];
}

export function getDevicesWithTag(tag: DeviceTag): TagEntry[] {
  return Array.from(_tagMap.values()).filter(e => e.tags.includes(tag));
}

export function getAllTagEntries(): TagEntry[] {
  return Array.from(_tagMap.values());
}

// ── Optimistic mutations — write to Cosmos, revert on failure ─────────────────
export function assignTag(hostname: string, tag: DeviceTag) {
  // Optimistic update in memory
  const existing = _tagMap.get(hostname);
  if (existing) {
    if (!existing.tags.includes(tag)) {
      existing.tags = [...existing.tags, tag];
      existing.assignedAt = new Date().toISOString();
    }
  } else {
    _tagMap.set(hostname, { hostname, tags: [tag], assignedAt: new Date().toISOString() });
  }
  lsSaveTagMap(_tagMap);
  notifyAll();

  // Persist to Cosmos
  apiAssignTag(hostname, tag).catch(err => {
    console.error('[useTagStore] assignTag API error — reverting', err);
    // Revert: re-fetch from Cosmos
    fetchTags().then(entries => hydrateTagMap(entries)).catch(() => {});
  });
}

export function removeTag(hostname: string, tag: DeviceTag) {
  // Optimistic update in memory
  const existing = _tagMap.get(hostname);
  if (existing) {
    existing.tags = existing.tags.filter(t => t !== tag);
    if (existing.tags.length === 0) {
      _tagMap.delete(hostname);
    } else {
      _tagMap.set(hostname, { ...existing });
    }
    lsSaveTagMap(_tagMap);
    notifyAll();
  }

  // Persist to Cosmos
  apiRemoveTag(hostname, tag).catch(err => {
    console.error('[useTagStore] removeTag API error — reverting', err);
    fetchTags().then(entries => hydrateTagMap(entries)).catch(() => {});
  });
}

// ── React Hook ────────────────────────────────────────────────────────────────
export function useTagStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    listeners.add(listener);

    // Always re-fetch from Cosmos on mount — localStorage is just a render cache
    fetchTags()
      .then(entries => hydrateTagMap(entries))
      .catch(err => console.error('[useTagStore] fetchTags error', err));

    // Always re-fetch tag catalog from Cosmos on mount
    fetchAdminTags()
      .then(names => { if (names && names.length > 0) setCatalog(names); })
      .catch(() => {});

    // Cross-tab sync (other tabs writing to localStorage cache)
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_TAGS_KEY) {
        _tagMap = lsLoadTagMap();
        setTick(t => t + 1);
      }
      if (e.key === LS_CATALOG_KEY) {
        _catalog = lsLoadCatalog();
        AVAILABLE_TAGS = _catalog;
        setTick(t => t + 1);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const assign = useCallback((hostname: string, tag: DeviceTag) => {
    assignTag(hostname, tag);
  }, []);

  const remove = useCallback((hostname: string, tag: DeviceTag) => {
    removeTag(hostname, tag);
  }, []);

  const getTagsForDevice  = useCallback((hostname: string) => getDeviceTags(hostname), []);
  const getExecutiveDevices = useCallback(() => getDevicesWithTag('Executive Devices'), []);

  const refreshFromAzure = useCallback(() => {
    fetchTags()
      .then(entries => hydrateTagMap(entries))
      .catch(err => console.error('[useTagStore] refreshFromAzure error', err));
  }, []);

  return {
    assign,
    remove,
    getTagsForDevice,
    getExecutiveDevices,
    getAllTagEntries,
    refreshFromAzure,
    availableTags: _catalog,
    tagEntries:    Array.from(_tagMap.values()),
  };
}
