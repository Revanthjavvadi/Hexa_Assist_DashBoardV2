/**
 * RealtimeLogs — floating/collapsible log panel that shows live API activity.
 * Mounts once in Layout so it persists across page navigation.
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal, ChevronDown, ChevronUp, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useRealtimeLogs, type LogEntry } from '../hooks/useRealtimeLogs';
import styles from './RealtimeLogs.module.css';

interface Props {
  blobReady: boolean;
}

export default function RealtimeLogs({ blobReady }: Props) {
  const { logs, subscribe, clear } = useRealtimeLogs();
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  // Subscribe to the log bus on mount
  useEffect(() => { subscribe(); }, [subscribe]);

  // Flash badge when new log arrives and panel is closed
  useEffect(() => {
    if (logs.length > prevCount.current && !open) setHasNew(true);
    prevCount.current = logs.length;
  }, [logs.length, open]);

  // Auto-scroll to top (newest first)
  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [logs, open]);

  const handleOpen = () => { setOpen(o => !o); setHasNew(false); };

  return (
    <div className={`${styles.panel} ${open ? styles.panelOpen : ''}`} role="complementary" aria-label="Real-time logs">
      {/* Header / toggle */}
      <button className={styles.header} onClick={handleOpen} aria-expanded={open}>
        <span className={styles.headerLeft}>
          <Terminal size={14} />
          <span>Real-time Logs</span>
          {hasNew && !open && <span className={styles.newBadge} aria-label="New log entries" />}
        </span>
        <span className={styles.headerRight}>
          <span className={`${styles.connDot} ${blobReady ? styles.connOnline : styles.connOffline}`} />
          <span className={styles.connLabel}>
            {blobReady
              ? <><Wifi size={11} /> Live</>
              : <><WifiOff size={11} /> Fallback</>
            }
          </span>
          <span className={styles.logCount}>{logs.length}</span>
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {/* Log body */}
      {open && (
        <div className={styles.body}>
          <div className={styles.toolbar}>
            <span className={styles.toolbarTitle}>
              {blobReady
                ? '● Connected to Azure Blob Storage'
                : '⚠ No SAS URL — showing fallback data'}
            </span>
            <button className={styles.clearBtn} onClick={clear} title="Clear logs">
              <Trash2 size={12} /> Clear
            </button>
          </div>
          <div className={styles.logList} ref={bodyRef}>
            {logs.length === 0 ? (
              <div className={styles.empty}>No log entries yet. Data refreshes every 30s.</div>
            ) : (
              logs.map(entry => <LogLine key={entry.id} entry={entry} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const ts = entry.timestamp.toLocaleTimeString('en-GB', { hour12: false });
  return (
    <div className={`${styles.logLine} ${styles[`log_${entry.level}`]}`}>
      <span className={styles.logTs}>{ts}</span>
      <span className={styles.logSrc}>[{entry.source}]</span>
      <span className={styles.logMsg}>{entry.message}</span>
    </div>
  );
}
