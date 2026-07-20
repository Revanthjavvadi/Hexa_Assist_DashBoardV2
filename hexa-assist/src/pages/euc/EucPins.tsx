import { useState, useMemo, useEffect } from 'react';
import {
  Eye, EyeOff, Copy, Check, Search,
  KeyRound, Clock, RefreshCw, ShieldCheck, AlertCircle,
  ClipboardList, ArrowLeft, X, CheckCircle2, XCircle
} from 'lucide-react';
import PageHeader        from '../../components/PageHeader';
import DataStatusBanner  from '../../components/DataStatusBanner';
import { useApi }        from '../../hooks/useApi';
import {
  fetchEucPins, revealPin,
  fetchPinAuditLog, fetchPinAttempts,
  type PinRecord, type PinAuditRow, type PinAttemptDetail,
} from '../../services/api';
import { toIST } from '../../utils/time';
import { getSessionUser, ROLE_CAPS } from '../../hooks/useAuth';
import { useTempAccess } from '../../hooks/useTempAccess';
import styles from './EucPins.module.css';

const doFetch      = () => fetchEucPins();
const doAuditFetch = () => fetchPinAuditLog();

// ── Attempt Details Modal ─────────────────────────────────────────────────────
interface ModalProps {
  hostname: string;
  outcome:  'SUCCESS' | 'FAILED';
  onClose:  () => void;
}

function AttemptModal({ hostname, outcome, onClose }: ModalProps) {
  const [rows,    setRows]    = useState<PinAttemptDetail[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows(null);
    fetchPinAttempts(hostname, outcome)
      .then(res => { if (!cancelled) { setRows(res.data ?? []); setLoading(false); } })
      .catch(e  => { if (!cancelled) { setError(e.message || 'Unable to load records.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [hostname, outcome]);

  const label    = outcome === 'SUCCESS' ? 'Successful' : 'Failed';
  const BadgeCls = outcome === 'SUCCESS' ? styles.modalBadgeSuccess : styles.modalBadgeFailed;

  return (
    <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>
              {outcome === 'SUCCESS'
                ? <CheckCircle2 size={15} color="#22c55e" />
                : <XCircle      size={15} color="#ef4444" />}
              {label} PIN Attempts — {hostname}
            </div>
            <div className={styles.modalSubtitle}>Script Name &amp; Timestamp for each attempt</div>
          </div>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className={styles.modalBody}>
          {loading && (
            <div className={styles.modalEmpty}>
              <RefreshCw size={16} className={styles.spin} style={{ marginBottom: 8 }} />
              <br />Loading records…
            </div>
          )}
          {!loading && error && (
            <div className={styles.modalEmpty} style={{ color: 'var(--red)' }}>
              Unable to load records. Please try again.
            </div>
          )}
          {!loading && !error && (!rows || rows.length === 0) && (
            <div className={styles.modalEmpty}>No records found.</div>
          )}
          {!loading && !error && rows && rows.length > 0 && (
            <table className={styles.modalTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Script Name</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className={styles.dimCell} style={{ width: 36 }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{r.scriptName || 'PIN Reveal'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {r.timestamp && r.timestamp !== '—'
                        ? r.timestamp.includes('IST') ? r.timestamp : toIST(r.timestamp)
                        : '—'}
                    </td>
                    <td><span className={BadgeCls}>{r.outcome}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Audit Log View ────────────────────────────────────────────────────────────
function AuditLogView({ onBack }: { onBack: () => void }) {
  const { data, loading, error, live, lastUpdated, refresh } = useApi<PinAuditRow[]>(doAuditFetch);
  const rows = data ?? [];

  const [search, setSearch] = useState('');
  const [modal,  setModal]  = useState<{ hostname: string; outcome: 'SUCCESS' | 'FAILED' } | null>(null);

  const _auditUser    = getSessionUser();
  const { hasTempCap } = useTempAccess();
  const canViewDetails = _auditUser
    ? ROLE_CAPS.canRevealPin(_auditUser.role) || ROLE_CAPS.canEdit(_auditUser.role) || hasTempCap('pins', 'manage')
    : false;

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    return !t ? rows : rows.filter(r =>
      r.hostname.toLowerCase().includes(t) || r.userId.toLowerCase().includes(t)
    );
  }, [rows, search]);

  return (
    <div>
      <PageHeader
        title="PIN Audit Log"
        subtitle="PIN reveal activity history for all devices."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.auditBackBtn} onClick={onBack}>
              <ArrowLeft size={13} /> Back to PIN Management
            </button>
            <button className={styles.ghostBtn} onClick={refresh} disabled={loading}>
              <RefreshCw size={13} className={loading ? styles.spin : ''} /> Refresh
            </button>
          </div>
        }
      />

      <DataStatusBanner loading={loading} error={error} live={live} lastUpdated={lastUpdated} onRefresh={refresh} />

      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIco} />
          <input
            className={styles.searchInput}
            placeholder="Search device or user…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className={styles.countLabel}>
          {filtered.length} device{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Device Name</th>
                <th>User ID</th>
                <th>Successful PIN Attempts</th>
                <th>Failed PIN Attempts</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                    <RefreshCw size={14} className={styles.spin} style={{ marginRight: 6 }} />
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                    {rows.length === 0 ? 'No audit history available.' : 'No records match your search.'}
                  </td>
                </tr>
              )}
              {!loading && filtered.map((r, i) => (
                <tr key={i} className={styles.tableRow}>
                  <td className={styles.hostnameCell}>{r.hostname}</td>
                  <td className={styles.dimCell}>{r.userId}</td>
                  <td>
                    <button
                      className={`${styles.auditCountBtn} ${styles.auditCountSuccess}`}
                      onClick={() => canViewDetails && r.successCount > 0 && setModal({ hostname: r.hostname, outcome: 'SUCCESS' })}
                      disabled={r.successCount === 0}
                      title={!canViewDetails ? 'View-only access' : r.successCount > 0 ? 'Click to view details' : 'No successful attempts'}
                      style={{ cursor: canViewDetails ? 'pointer' : 'default' }}
                    >
                      {r.successCount}
                    </button>
                  </td>
                  <td>
                    <button
                      className={`${styles.auditCountBtn} ${styles.auditCountFailed}`}
                      onClick={() => canViewDetails && r.failedCount > 0 && setModal({ hostname: r.hostname, outcome: 'FAILED' })}
                      disabled={r.failedCount === 0}
                      title={!canViewDetails ? 'View-only access' : r.failedCount > 0 ? 'Click to view details' : 'No failed attempts'}
                      style={{ cursor: canViewDetails ? 'pointer' : 'default' }}
                    >
                      {r.failedCount}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <AttemptModal
          hostname={modal.hostname}
          outcome={modal.outcome}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Single PIN row ────────────────────────────────────────────────────────────
function PinRow({ row, seqNo, onReveal }: { row: PinRecord; seqNo: number; onReveal: (id: string) => Promise<string> }) {
  const [visible,     setVisible]     = useState(false);
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const _pinUser  = getSessionUser();
  const { hasTempCap } = useTempAccess();
  const canReveal = _pinUser
    ? ROLE_CAPS.canRevealPin(_pinUser.role) || hasTempCap('pins', 'manage')
    : false;

  const handleReveal = async () => {
    if (!canReveal) {
      // Toggle the message — show on first click, hide on second click
      setError(prev => prev ? null : 'You don\'t have access to reveal PIN.');
      return;
    }
    if (visible && revealedPin) { setVisible(false); return; }
    if (revealedPin)            { setVisible(true);  return; }
    setLoading(true);
    setError(null);
    try {
      const pin = await onReveal(row.id);
      setRevealedPin(pin);
      setVisible(true);
    } catch (e: unknown) {
      setError((e as Error).message || 'Unable to reveal PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!canReveal) {
      setError('You don\'t have access to reveal PIN.');
      return;
    }
    let pin = revealedPin;
    if (!pin) {
      try { pin = await onReveal(row.id); setRevealedPin(pin); } catch { return; }
    }
    await navigator.clipboard.writeText(pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired    = row.expiresAt ? new Date(row.expiresAt) < new Date() : false;
  const expiresLabel = toIST(row.expiresAt);
  const createdLabel = toIST(row.createdAt);

  return (
    <tr className={styles.tableRow}>
      <td className={styles.dimCell}>{seqNo}</td>
      <td className={styles.hostnameCell}>{row.hostname || 'Unknown Host'}</td>
      <td className={styles.dimCell}>{row.username}</td>
      <td className={styles.dimCell}>{row.period || '—'}</td>
      <td className={styles.dimCell} style={{ fontSize: 11 }}>{createdLabel}</td>
      <td>
        <span className={`${styles.expiryBadge} ${isExpired ? styles.expired : styles.active}`}>
          {isExpired ? <AlertCircle size={11} /> : <ShieldCheck size={11} />}
          {expiresLabel}
        </span>
      </td>
      <td>
        <div className={styles.pinCell}>
          <span className={`${styles.pinValue} ${visible ? styles.pinVisible : ''}`}>
            {visible && revealedPin ? revealedPin : '● ● ● ●'}
          </span>
          {error && <span className={styles.pinError}>{error}</span>}
          <button
            className={styles.iconBtn}
            onClick={handleReveal}
            disabled={loading}
            aria-label={visible ? 'Hide PIN' : 'Show PIN'}
            title={visible ? 'Hide PIN' : 'Reveal PIN'}
          >
            {loading
              ? <RefreshCw size={13} className={styles.spin} />
              : visible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            className={`${styles.iconBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
            aria-label="Copy PIN"
            title="Copy PIN"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EucPins() {
  const [showAudit, setShowAudit] = useState(false);
  if (showAudit) return <AuditLogView onBack={() => setShowAudit(false)} />;
  return <PinManagementView onAudit={() => setShowAudit(true)} />;
}

function PinManagementView({ onAudit }: { onAudit: () => void }) {
  const { data, loading, error, live, lastUpdated, refresh } = useApi<PinRecord[]>(doFetch);
  const pins = data ?? [];
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return pins.filter(r =>
      !term ||
      r.hostname.toLowerCase().includes(term) ||
      r.username.toLowerCase().includes(term)
    );
  }, [pins, search]);

  const handleReveal = async (id: string): Promise<string> => {
    const result = await revealPin(id);
    if (!result.success) throw new Error('Unable to retrieve PIN. Please try again.');
    return result.pin;
  };

  return (
    <div>
      <PageHeader
        title="PIN Management"
        subtitle="View and securely reveal device PINs."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.auditBtn} onClick={onAudit}>
              <ClipboardList size={13} /> Audit Log
            </button>
            <button className={styles.ghostBtn} onClick={refresh} disabled={loading}>
              <RefreshCw size={13} className={loading ? styles.spin : ''} /> Refresh
            </button>
          </div>
        }
      />

      <DataStatusBanner loading={loading} error={error} live={live} lastUpdated={lastUpdated} onRefresh={refresh} />

      <div className={styles.infoBanner}>
        <Eye size={14} />
        <span>
          PINs are <strong>4 digits</strong> and masked by default. Click{' '}
          <strong><Eye size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Reveal</strong> to view the PIN,
          or <strong><Copy size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Copy</strong> to copy it
          without displaying. PINs rotate every 24 hours.
        </span>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIco} />
          <input
            className={styles.searchInput}
            placeholder="Search device or username…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className={styles.countLabel}>
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Device Name</th>
                <th>User</th>
                <th><Clock size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Period</th>
                <th>Created At</th>
                <th>Expires At</th>
                <th><KeyRound size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />PIN</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                    {pins.length === 0 ? 'No PIN records available.' : 'No records match your search.'}
                  </td>
                </tr>
              )}
              {filtered.map((row, idx) => (
                <PinRow key={row.id} row={row} seqNo={idx + 1} onReveal={handleReveal} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
