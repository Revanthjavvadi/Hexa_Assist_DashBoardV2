/**
 * useApi — data-fetching hook wired to the global refresh bus.
 *
 * Behaviour:
 *  • Fetches immediately on mount.
 *  • Re-fetches every time the global refresh bus fires (5 min default).
 *  • Passes fresh=true to the fetcher on bus-triggered cycles so the
 *    backend bypasses its cache and re-reads from Blob Storage.
 *  • A manual refresh() call always sets fresh=true.
 *  • Deduplicates: if a fetch is already in-flight, the next trigger is
 *    queued (not dropped) but only one concurrent request runs at a time.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ApiResponse } from '../services/api';
import { useRefreshBus, markSynced } from './useRefreshBus';

export interface UseApiOptions {
  /** If false, the hook only fetches on mount and on manual refresh() calls. Default true. */
  busEnabled?: boolean;
  /** Fire immediately on mount. Default true. */
  immediate?: boolean;
}

export interface UseApiResult<T> {
  data:        T | null;
  loading:     boolean;
  error:       string | null;
  live:        boolean;
  lastUpdated: Date | null;
  refresh:     () => void;
}

/**
 * @param fetcher  Function that calls the API. Receives `fresh: boolean` —
 *                 pass it as `?fresh=1` in the URL when true so the backend
 *                 bypasses its in-memory cache.
 */
export function useApi<T>(
  fetcher: (fresh?: boolean) => Promise<ApiResponse<T>>,
  options: UseApiOptions = {},
): UseApiResult<T> {
  const { busEnabled = true, immediate = true } = options;

  const [data,        setData]        = useState<T | null>(null);
  const [loading,     setLoading]     = useState(immediate);
  const [error,       setError]       = useState<string | null>(null);
  const [live,        setLive]        = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const mountedRef   = useRef(true);
  const inFlightRef  = useRef(false);
  const pendingRef   = useRef(false);   // queued call while one is in flight

  // updateClock=true only for bus-triggered / manual refreshes, not initial mount fetches
  const run = useCallback(async (fresh = false, updateClock = false) => {
    if (inFlightRef.current) {
      pendingRef.current = true;  // mark that another fetch is needed after current
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetcher(fresh);
      if (!mountedRef.current) return;
      setData(res.data as T);
      setLive(res.live);
      setLastUpdated(new Date());
      setError(null);
      // Only reset the global "Last Synced" clock for bus/manual refreshes,
      // not for the initial page-mount fetch — otherwise navigating to a new
      // page always resets the countdown back to 5 minutes.
      if (updateClock) markSynced();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
      inFlightRef.current = false;
      // If a new refresh was requested while we were in-flight, run it now
      if (pendingRef.current && mountedRef.current) {
        pendingRef.current = false;
        run(true, true);
      }
    }
  }, [fetcher]);

  // Manual refresh — always bypasses backend cache and updates the clock
  const refresh = useCallback(() => run(true, true), [run]);

  // Mount + cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Wire into the global refresh bus — bus fires update the clock; mount fetch does not
  useRefreshBus(
    busEnabled
      ? () => run(true, true)   // bus fires → fresh=true, update global sync clock
      : () => {},
    busEnabled
      ? () => run(false, false) // initial mount fetch → no clock reset
      : undefined
  );

  // If busEnabled is false, do an immediate fetch on mount manually (no clock update)
  useEffect(() => {
    if (!busEnabled && immediate) run(false, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error, live, lastUpdated, refresh };
}
