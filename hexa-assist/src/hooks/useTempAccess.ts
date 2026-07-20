/**
 * useTempAccess — Temporary Access Context
 *
 * Fetches the current user's active temporary access grants from Cosmos DB
 * and makes them available to every page via React Context.
 *
 * Grants are re-fetched every 60 seconds so expiry is detected promptly
 * without requiring a page reload.
 *
 * Usage in any page:
 *   const { hasTempCap } = useTempAccess();
 *   const canTag = ROLE_CAPS.canEdit(role) || hasTempCap('system', 'manage');
 *   const canReveal = ROLE_CAPS.canRevealPin(role) || hasTempCap('pins', 'manage');
 *
 * Capability mapping:
 *   module='system',    permission='manage'  → canAssignTag in System Info
 *   module='executive', permission='manage'  → canDeleteTag in Executive Devices
 *   module='pins',      permission='manage'  → canRevealPin in PIN Management
 *   module='*',         permission='view'    → page access only (no extra actions)
 */

import { createContext, useContext, useState, useEffect, useCallback, createElement, type ReactNode } from 'react';
import { fetchUserTempAccess, type TempAccessGrant } from '../services/api';
import { getSessionUser } from './useAuth';

interface TempAccessContextValue {
  grants:      TempAccessGrant[];
  loading:     boolean;
  /** Returns true if the user has an active, non-expired temp grant for the given module + permission */
  hasTempCap:  (module: string, permission: 'view' | 'manage') => boolean;
  /** Returns true if the user has any active grant for the given module (any permission level) */
  hasTempPage: (module: string) => boolean;
  /** Force a refresh of grants from Cosmos */
  refresh:     () => void;
}

const TempAccessContext = createContext<TempAccessContextValue>({
  grants:      [],
  loading:     false,
  hasTempCap:  () => false,
  hasTempPage: () => false,
  refresh:     () => {},
});

export function TempAccessProvider({ children }: { children: ReactNode }) {
  const [grants,  setGrants]  = useState<TempAccessGrant[]>([]);
  const [loading, setLoading] = useState(false);

  const user = getSessionUser();

  const fetchGrants = useCallback(() => {
    if (!user?.id) return;
    setLoading(true);
    fetchUserTempAccess(user.id)
      .then(res => setGrants(res.data ?? []))
      .catch(() => setGrants([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  // Fetch on mount + refresh every 60 seconds for expiry detection
  useEffect(() => {
    fetchGrants();
    const interval = setInterval(fetchGrants, 60_000);
    return () => clearInterval(interval);
  }, [fetchGrants]);

  const now = new Date();

  const hasTempCap = useCallback((module: string, permission: 'view' | 'manage'): boolean => {
    return grants.some(g =>
      g.active &&
      g.module === module &&
      (g.permission === permission || (permission === 'view' && g.permission === 'manage')) &&
      new Date(g.expiresAt) > now
    );
  }, [grants]);

  const hasTempPage = useCallback((module: string): boolean => {
    return grants.some(g =>
      g.active &&
      g.module === module &&
      new Date(g.expiresAt) > now
    );
  }, [grants]);

  return createElement(
    TempAccessContext.Provider,
    { value: { grants, loading, hasTempCap, hasTempPage, refresh: fetchGrants } },
    children
  );
}

export function useTempAccess(): TempAccessContextValue {
  return useContext(TempAccessContext);
}
