import { useState, useMemo } from 'react';
import {
  Monitor, User, Wifi, WifiOff,
  Search, Download, ChevronRight, Package, Clock,
  Activity, Globe, Lock, Shield, CheckCircle2, XCircle, RefreshCw, X
} from 'lucide-react';
import {
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, type PieSectorDataItem,
} from 'recharts';
import PageHeader       from '../../components/PageHeader';
import SidePanel        from '../../components/SidePanel';
import DataStatusBanner from '../../components/DataStatusBanner';
import { exportCSV }    from '../../utils/export';
import { useApi }       from '../../hooks/useApi';
import { fetchSecurity, type SecurityRecord } from '../../services/api';
import styles from './Security.module.css';

/* ── Status badge components (unchanged) ─────────────────────── */
function CortexBadge({ status }: { status: SecurityRecord['cortexStatus'] }) {
  return <span className={`${styles.badge} ${status === 'Running' ? styles.badgeGreen : styles.badgeRed}`}><Activity size={11} /> {status}</span>;
}
function GPBadge({ status }: { status: SecurityRecord['gpStatus'] }) {
  return <span className={`${styles.badge} ${status === 'Connected' ? styles.badgeGreen : styles.badgeRed}`}><Globe size={11} /> {status}</span>;
}
function BitLockerBadge({ status }: { status: SecurityRecord['bitLockerStatus'] }) {
  if (status === 'N/A') {
    return (
      <span
        className={`${styles.badge} ${styles.badgeNa}`}
        title="BitLocker is not applicable for desktop devices"
      >
        <Lock size={11} /> N/A
      </span>
    );
  }
  return <span className={`${styles.badge} ${status === 'Compliant' ? styles.badgeGreen : styles.badgeRed}`}><Lock size={11} /> {status}</span>;
}
function SecureBootBadge({ status }: { status: SecurityRecord['secureBootStatus'] }) {
  return <span className={`${styles.badge} ${status === 'Enabled' ? styles.badgeGreen : styles.badgeRed}`}><Shield size={11} /> {status}</span>;
}

const doFetch = () => fetchSecurity();

/* ── Drill-down state type ────────────────────────────────────── */
interface DrillState {
  title:       string;
  accentColor: string;
  records:     SecurityRecord[];
}

/* ── Security donut card (now drill-aware) ────────────────────── */
function SecurityPieCard({
  title, passLabel, failLabel, passCount, failCount, icon, onDrill,
}: {
  title:      string;
  passLabel:  string;
  failLabel:  string;
  passCount:  number;
  failCount:  number;
  icon:       React.ReactNode;
  onDrill:    (label: string, color: string) => void;
}) {
  const pieData = [
    { name: passLabel, value: passCount, fill: '#22c55e' },
    { name: failLabel, value: failCount, fill: '#ef4444' },
  ];
  const total = passCount + failCount;
  const pct   = total > 0 ? Math.round((passCount / total) * 100) : 0;

  return (
    <div className={styles.secPieCard}>
      <div className={styles.secPieHeader}>
        <span className={styles.secPieIcon}>{icon}</span>
        <span className={styles.secPieTitle}>{title}</span>
      </div>

      <div className={styles.secPieWrap}>
        <ResponsiveContainer width="100%" height={130}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%" cy="50%"
              innerRadius={38} outerRadius={58}
              dataKey="value"
              paddingAngle={3}
              startAngle={90} endAngle={-270}
              strokeWidth={0}
              style={{ cursor: 'pointer' }}
              onClick={(entry: PieSectorDataItem) =>
                onDrill(entry.name ?? '', entry.fill as string)
              }
            >
              {pieData.map(d => <Cell key={d.name} fill={d.fill} />)}
            </Pie>
            <Tooltip
              formatter={(v) => [v as number, 'Devices']}
              contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.secPieCentre}>
          <span className={styles.secPiePct}>{pct}%</span>
        </div>
      </div>

      {/* Clickable legend rows */}
      <div className={styles.secPieLegend}>
        <button
          className={styles.secPieLegendBtn}
          onClick={() => onDrill(passLabel, '#22c55e')}
          title={`Show ${passLabel} devices`}
        >
          <span className={styles.secPieDot} style={{ background: '#22c55e' }} />
          <span className={styles.secPieLegendCount}>{passCount}</span>
          <span className={styles.secPieLegendLabel}>{passLabel}</span>
        </button>
        <button
          className={styles.secPieLegendBtn}
          onClick={() => onDrill(failLabel, '#ef4444')}
          title={`Show ${failLabel} devices`}
        >
          <span className={styles.secPieDot} style={{ background: '#ef4444' }} />
          <span className={styles.secPieLegendCount}>{failCount}</span>
          <span className={styles.secPieLegendLabel}>{failLabel}</span>
        </button>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────── */
export default function EucSecurity() {
  const { data, loading, error, live, lastUpdated, refresh } = useApi<SecurityRecord[]>(doFetch);

  const securityRecords = data ?? [];

  const [search, setSearch]                     = useState('');
  const [cortexFilter, setCortexFilter]         = useState('All');
  const [gpFilter, setGpFilter]                 = useState('All');
  const [bitFilter, setBitFilter]               = useState('All');
  const [secureBootFilter, setSecureBootFilter] = useState('All');
  const [networkFilter, setNetworkFilter]       = useState('All');
  const [selected, setSelected]                 = useState<SecurityRecord | null>(null);
  const [panelOpen, setPanelOpen]               = useState(false);

  /* Unified drill-down modal state */
  const [drill, setDrill] = useState<DrillState | null>(null);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return securityRecords
      .filter(r => {
        const matchSearch     = !term || r.deviceName.toLowerCase().includes(term) || r.loggedUser.toLowerCase().includes(term) || r.serialNumber.toLowerCase().includes(term);
        const matchCortex     = cortexFilter     === 'All' || r.cortexStatus     === cortexFilter;
        const matchGP         = gpFilter         === 'All' || r.gpStatus         === gpFilter;
        const matchBit        = bitFilter        === 'All' || r.bitLockerStatus  === bitFilter;
        const matchSecureBoot = secureBootFilter === 'All' || r.secureBootStatus === secureBootFilter;
        const matchNetwork    = networkFilter    === 'All' || r.networkMode      === networkFilter;
        return matchSearch && matchCortex && matchGP && matchBit && matchSecureBoot && matchNetwork;
      })
      // Sort newest-first using rawTimestamp (ISO) for accurate date ordering
      .sort((a, b) => (b.rawTimestamp ?? '').localeCompare(a.rawTimestamp ?? ''));
  }, [securityRecords, search, cortexFilter, gpFilter, bitFilter, secureBootFilter, networkFilter]);

  /* ── Summary counts ───────────────────────────────────────────── */
  const total          = securityRecords.length;
  const cortexRunning  = securityRecords.filter(r => r.cortexStatus     === 'Running').length;
  const gpConnected    = securityRecords.filter(r => r.gpStatus         === 'Connected').length;
  const bitLockerOk    = securityRecords.filter(r => r.bitLockerStatus  === 'Compliant').length;
  const bitLockerNa    = securityRecords.filter(r => r.bitLockerStatus  === 'N/A').length;
  const secureBootOk   = securityRecords.filter(r => r.secureBootStatus === 'Enabled').length;

  /* ── Drill resolvers ──────────────────────────────────────────── */
  const openPieDrill = (
    controlField: keyof SecurityRecord,
    statusValue: string,
    label: string,
    color: string,
  ) => {
    const records = securityRecords.filter(r => r[controlField] === statusValue);
    setDrill({ title: label, accentColor: color, records });
  };

  /* ── Export drill records ─────────────────────────────────────── */
  const handleExportDrill = () => {
    if (!drill) return;
    exportCSV(drill.records as unknown as Record<string, unknown>[], `security-drill-${drill.title.replace(/\s+/g, '-').toLowerCase()}`);
  };

  /* ── Row panel open ───────────────────────────────────────────── */
  const openPanel = (r: SecurityRecord) => { setSelected(r); setPanelOpen(true); };

  return (
    <div>
      <PageHeader
        title="Security & Compliance"
        subtitle="Device security posture — Cortex XDR, GlobalProtect, BitLocker, Secure Boot"
        actions={
          <div className={styles.headerBtns}>
            <button className={styles.ghostBtn} onClick={() => exportCSV(filtered as unknown as Record<string, unknown>[], 'security-compliance')}><Download size={13} /> Export CSV</button>
            <button className={styles.ghostBtn} onClick={refresh}><RefreshCw size={13} /> Refresh</button>
          </div>
        }
      />

      <DataStatusBanner loading={loading} error={error} live={live} lastUpdated={lastUpdated} onRefresh={refresh} />

      {/* ── Four security control pie charts ── */}
      <div className={styles.secPieGrid}>
        <SecurityPieCard
          title="Cortex XDR"
          passLabel="Running" failLabel="Not Running"
          passCount={cortexRunning} failCount={total - cortexRunning}
          icon={<Activity size={14} />}
          onDrill={(label, color) =>
            openPieDrill('cortexStatus', label === 'Running' ? 'Running' : 'Not Running', `Cortex XDR — ${label}`, color)
          }
        />
        <SecurityPieCard
          title="GlobalProtect"
          passLabel="Connected" failLabel="Not Connected"
          passCount={gpConnected} failCount={total - gpConnected}
          icon={<Globe size={14} />}
          onDrill={(label, color) =>
            openPieDrill('gpStatus', label === 'Connected' ? 'Connected' : 'Not Connected', `GlobalProtect — ${label}`, color)
          }
        />
        <SecurityPieCard
          title="BitLocker"
          passLabel="Compliant" failLabel="Non-Compliant"
          passCount={bitLockerOk} failCount={total - bitLockerOk - bitLockerNa}
          icon={<Lock size={14} />}
          onDrill={(label, color) =>
            openPieDrill('bitLockerStatus', label === 'Compliant' ? 'Compliant' : 'Non-Compliant', `BitLocker — ${label}`, color)
          }
        />
        <SecurityPieCard
          title="Secure Boot"
          passLabel="Enabled" failLabel="Disabled"
          passCount={secureBootOk} failCount={total - secureBootOk}
          icon={<Shield size={14} />}
          onDrill={(label, color) =>
            openPieDrill('secureBootStatus', label === 'Enabled' ? 'Enabled' : 'Disabled', `Secure Boot — ${label}`, color)
          }
        />
      </div>

      {/* ── Filters ── */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIco} />
          <input className={styles.searchInput} placeholder="Search device, user, serial…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={styles.filterSelect} value={cortexFilter}     onChange={e => setCortexFilter(e.target.value)}>
          <option value="All">All Cortex</option><option value="Running">Running</option><option value="Not Running">Not Running</option>
        </select>
        <select className={styles.filterSelect} value={gpFilter}         onChange={e => setGpFilter(e.target.value)}>
          <option value="All">All GP</option><option value="Connected">Connected</option><option value="Not Connected">Not Connected</option>
        </select>
        <select className={styles.filterSelect} value={bitFilter}        onChange={e => setBitFilter(e.target.value)}>
          <option value="All">All BitLocker</option><option value="Compliant">Compliant</option><option value="Non-Compliant">Non-Compliant</option><option value="N/A">N/A (Desktop)</option>
        </select>
        <select className={styles.filterSelect} value={secureBootFilter} onChange={e => setSecureBootFilter(e.target.value)}>
          <option value="All">All Secure Boot</option><option value="Enabled">Enabled</option><option value="Disabled">Disabled</option>
        </select>
        <select className={styles.filterSelect} value={networkFilter}    onChange={e => setNetworkFilter(e.target.value)}>
          <option value="All">All Networks</option><option value="Online">Online</option><option value="Offline">Offline</option>
        </select>
        <span className={styles.countLabel}>{filtered.length} records</span>
      </div>

      {/* ── Table ── */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th><th>Device Name</th><th>Serial Number</th>
                <th>Logged User</th><th>Mode of FIX run</th><th>App Version</th>
                <th>Cortex XDR</th><th>GlobalProtect</th><th>BitLocker</th><th>Secure Boot</th><th></th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={11} className={styles.emptyRow}>No data available.</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} className={styles.tableRow} onClick={() => openPanel(r)}>
                  <td className={styles.tsCell}><Clock size={11} style={{ marginRight: 5, opacity: 0.45 }} />{r.timestamp}</td>
                  <td className={styles.deviceCell}>{r.deviceName}</td>
                  <td className={styles.dimCell}>{r.serialNumber}</td>
                  <td className={styles.dimCell}>{r.loggedUser}</td>
                  <td><span className={`${styles.netBadge} ${r.networkMode === 'Online' ? styles.netOnline : styles.netOffline}`}>{r.networkMode === 'Online' ? <Wifi size={11} /> : <WifiOff size={11} />}{r.networkMode}</span></td>
                  <td className={styles.dimCell}>{r.appVersion}</td>
                  <td><CortexBadge    status={r.cortexStatus} /></td>
                  <td><GPBadge        status={r.gpStatus} /></td>
                  <td><BitLockerBadge status={r.bitLockerStatus} /></td>
                  <td><SecureBootBadge status={r.secureBootStatus} /></td>
                  <td className={styles.arrowCell}><ChevronRight size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Drill-down modal ── */}
      {drill && (
        <>
          <div className={styles.drillBackdrop} onClick={() => setDrill(null)} />
          <div className={styles.drillModal} role="dialog" aria-modal="true" aria-label={drill.title}>
            <div className={styles.drillHeader}>
              <div className={styles.drillHeaderLeft}>
                <span className={styles.drillDot} style={{ background: drill.accentColor }} />
                <div>
                  <h3 className={styles.drillTitle}>{drill.title}</h3>
                  <p className={styles.drillSubtitle}>
                    {drill.records.length} device{drill.records.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className={styles.drillActions}>
                {drill.records.length > 0 && (
                  <button className={styles.drillExportBtn} onClick={handleExportDrill}>
                    <Download size={13} /> Export CSV
                  </button>
                )}
                <button className={styles.drillCloseBtn} onClick={() => setDrill(null)} aria-label="Close">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className={styles.drillTableWrap}>
              {drill.records.length === 0 ? (
                <div className={styles.drillEmpty}>No devices found for this selection.</div>
              ) : (
                <table className={styles.drillTable}>
                  <thead>
                    <tr>
                      <th>Device Name</th>
                      <th>Serial</th>
                      <th>User</th>
                      <th>Network</th>
                      <th>Cortex XDR</th>
                      <th>GlobalProtect</th>
                      <th>BitLocker</th>
                      <th>Secure Boot</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.records.map(r => (
                      <tr
                        key={r.id}
                        className={styles.drillRow}
                        onClick={() => { setDrill(null); openPanel(r); }}
                        title="Click to view full details"
                      >
                        <td className={styles.drillDevice}>{r.deviceName}</td>
                        <td className={styles.drillDim}>{r.serialNumber}</td>
                        <td className={styles.drillDim}>{r.loggedUser}</td>
                        <td>
                          <span className={`${styles.netBadge} ${r.networkMode === 'Online' ? styles.netOnline : styles.netOffline}`}>
                            {r.networkMode === 'Online' ? <Wifi size={11} /> : <WifiOff size={11} />}{r.networkMode}
                          </span>
                        </td>
                        <td><CortexBadge    status={r.cortexStatus} /></td>
                        <td><GPBadge        status={r.gpStatus} /></td>
                        <td><BitLockerBadge status={r.bitLockerStatus} /></td>
                        <td><SecureBootBadge status={r.secureBootStatus} /></td>
                        <td className={styles.drillDim} style={{ fontSize: 11 }}>{r.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Device detail panel (row click) ── */}
      <SidePanel open={panelOpen} onClose={() => { setPanelOpen(false); setSelected(null); }}
        title={selected?.deviceName ?? ''} subtitle="Security & Compliance Detail" width={500}
        screenshotName={selected?.deviceName}>
        {selected && (
          <div className={styles.panelBody}>
            <section className={styles.panelSection}>
              <h4 className={styles.panelSectionTitle}>Device Information</h4>
              <div className={styles.infoGrid}>
                {([
                  ['Timestamp',       selected.timestamp,   <Clock size={13} />],
                  ['Device Name',     selected.deviceName,  <Monitor size={13} />],
                  ['Serial Number',   selected.serialNumber,<Package size={13} />],
                  ['Logged User',     selected.loggedUser,  <User size={13} />],
                  ['Mode of FIX run', selected.networkMode, selected.networkMode === 'Online' ? <Wifi size={13} /> : <WifiOff size={13} />],
                  ['App Version',     selected.appVersion,  <Package size={13} />],
                ] as [string, string, React.ReactNode][]).map(([label, value, icon]) => (
                  <div key={label} className={styles.infoRow}>
                    <span className={styles.infoIcon}>{icon}</span>
                    <span className={styles.infoLabel}>{label}</span>
                    <span className={styles.infoValue}>{value}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className={styles.panelSection}>
              <h4 className={styles.panelSectionTitle}>Security Status</h4>
              <div className={styles.checksList}>
                {[
                  { icon: <Activity size={16} />, name: 'Cortex XDR',        ok: selected.cortexStatus     === 'Running',   badge: <CortexBadge    status={selected.cortexStatus} />,      detail: selected.cortexStatus     === 'Running'   ? 'Endpoint protection active and monitoring'       : 'Endpoint protection inactive — action required' },
                  { icon: <Globe    size={16} />, name: 'GlobalProtect VPN', ok: selected.gpStatus         === 'Connected', badge: <GPBadge        status={selected.gpStatus} />,          detail: selected.gpStatus         === 'Connected' ? 'GlobalProtect tunnel established'               : 'GlobalProtect not connected — check network policy' },
                  { icon: <Lock     size={16} />, name: 'BitLocker',         ok: selected.bitLockerStatus  === 'Compliant' || selected.bitLockerStatus === 'N/A', badge: <BitLockerBadge status={selected.bitLockerStatus} />,   detail: selected.bitLockerStatus === 'Compliant' ? 'Drive fully encrypted (AES 256-bit XTS)' : selected.bitLockerStatus === 'N/A' ? 'BitLocker is not applicable for desktop devices' : 'Drive not encrypted — non-compliant with policy' },
                  { icon: <Shield   size={16} />, name: 'Secure Boot',       ok: selected.secureBootStatus === 'Enabled',  badge: <SecureBootBadge status={selected.secureBootStatus} />, detail: selected.secureBootStatus === 'Enabled'   ? 'Secure Boot is enabled — firmware integrity OK' : 'Secure Boot is disabled — policy violation' },
                ].map(c => (
                  <div key={c.name} className={`${styles.checkRow} ${!c.ok ? styles.checkRowFail : ''}`}>
                    <div className={styles.checkLeft}>
                      <span className={c.ok ? styles.iconPass : styles.iconFail}>{c.icon}</span>
                      <div className={styles.checkInfo}>
                        <span className={styles.checkName}>{c.name}</span>
                        <span className={styles.checkDetail}>{c.detail}</span>
                      </div>
                    </div>
                    {c.badge}
                  </div>
                ))}
              </div>
            </section>
            {(() => {
              const allOk = selected.cortexStatus === 'Running' &&
                (selected.bitLockerStatus === 'Compliant' || selected.bitLockerStatus === 'N/A');
              return (
                <div className={`${styles.overallBox} ${allOk ? styles.overallGreen : styles.overallRed}`}>
                  {allOk
                    ? <><CheckCircle2 size={18} /><span>Device is Fully Compliant</span></>
                    : <><XCircle size={18} /><span>Device has Compliance Issues</span></>}
                </div>
              );
            })()}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
