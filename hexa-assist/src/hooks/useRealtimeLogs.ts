/**
 * useRealtimeLogs — maintains a capped rolling log of fetch events.
 * Attach to the API service interceptors so every page emits logs automatically.
 */

import { useState, useCallback } from 'react';

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: LogLevel;
  message: string;
  source: string;
}

const MAX_LOGS = 200;
let _seq = 0;

// Singleton log bus — so any component can push logs
type Listener = (entry: LogEntry) => void;
const listeners = new Set<Listener>();

export function emitLog(level: LogLevel, source: string, message: string) {
  const entry: LogEntry = { id: ++_seq, timestamp: new Date(), level, source, message };
  listeners.forEach(fn => fn(entry));
}

export function useRealtimeLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const subscribe = useCallback(() => {
    const handler: Listener = (entry) => {
      setLogs(prev => [entry, ...prev].slice(0, MAX_LOGS));
    };
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  const clear = useCallback(() => setLogs([]), []);

  return { logs, subscribe, clear };
}
