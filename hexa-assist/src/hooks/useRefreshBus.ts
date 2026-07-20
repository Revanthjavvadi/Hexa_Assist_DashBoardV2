/**
 * useRefreshBus — centralised refresh bus for the entire dashboard.
 *
 * ONE global timer fires every REFRESH_INTERVAL ms (default 5 min).
 * Every page subscribes via useRefreshBus(); when the timer fires, all
 * subscribed pages re-fetch simultaneously — no duplicate timers per page.
 *
 * Pages can also call triggerRefresh() to force an immediate cycle
 * (e.g. the "Refresh Now" button in the header).
 *
 * The bus also refreshes on visibilitychange so data is never stale when
 * the user switches back to this tab after being away.
 */

import { useEffect, useCallback, useRef } from 'react';

// ── Configuration ─────────────────────────────────────────────────────────────
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Singleton bus state ───────────────────────────────────────────────────────
type Listener = () => void;
const listeners        = new Set<Listener>();
let   _timerId: ReturnType<typeof setInterval> | null = null;
let   _lastFired: Date | null = null;
let   _isRefreshing = false;

function fireAll() {
  if (_isRefreshing) return;       // guard: don't double-fire if previous cycle is slow
  _isRefreshing = true;
  _lastFired    = new Date();
  listeners.forEach(fn => fn());
  // Reset guard after a short window so slow responses don't block next cycle
  setTimeout(() => { _isRefreshing = false; }, 10_000);
}

function startTimer() {
  if (_timerId !== null) return;
  _timerId = setInterval(fireAll, REFRESH_INTERVAL_MS);
}

function stopTimer() {
  if (_timerId === null) return;
  clearInterval(_timerId);
  _timerId = null;
}

/** Force an immediate full-dashboard refresh (clears guard too) */
export function triggerRefresh() {
  _isRefreshing = false;
  fireAll();
}

/** Manually mark a sync time (called when data loads successfully) */
export function markSynced() {
  _lastFired = new Date();
}

/** ISO string of last successful bus fire, or null */
export function getLastRefreshed(): Date | null { return _lastFired; }

// ── visibilitychange handler ──────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Refresh if it's been more than REFRESH_INTERVAL_MS since last fire
      const elapsed = _lastFired ? Date.now() - _lastFired.getTime() : Infinity;
      if (elapsed >= REFRESH_INTERVAL_MS) {
        _isRefreshing = false;
        fireAll();
      }
    }
  });
}

// ── React hook ────────────────────────────────────────────────────────────────
/**
 * Subscribe a callback to the global refresh bus.
 * The callback is called:
 *   1. Immediately on mount (initial fetch) — via onMount, separate from onRefresh
 *   2. Every REFRESH_INTERVAL_MS automatically — via onRefresh
 *   3. When triggerRefresh() is called — via onRefresh
 *   4. When the tab regains visibility after a long absence — via onRefresh
 *
 * Keeping mount and bus callbacks separate lets callers decide whether
 * a fetch should reset the global "Last Synced" clock (bus/manual) or not (mount).
 */
export function useRefreshBus(onRefresh: () => void, onMount?: () => void) {
  const cbRef      = useRef(onRefresh);
  const mountRef   = useRef(onMount);
  cbRef.current    = onRefresh;
  mountRef.current = onMount;

  const stable = useCallback(() => cbRef.current(), []);

  useEffect(() => {
    listeners.add(stable);
    startTimer();
    // Fire initial fetch via onMount if provided, otherwise fall back to onRefresh
    if (mountRef.current) {
      mountRef.current();
    } else {
      stable();
    }
    return () => {
      listeners.delete(stable);
      if (listeners.size === 0) stopTimer();
    };
  }, [stable]);
}
