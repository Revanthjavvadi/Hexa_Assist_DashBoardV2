import { useState, useMemo } from 'react';
import {
  ShieldCheck, ShieldX, Monitor,
  User, Wifi, WifiOff,
  Search, ChevronRight, CheckCircle2, XCircle, AlertTriangle,
  Download, RefreshCw, Package, Clock, Filter, X
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, type PieSectorDataItem,
} from 'recharts';
import PageHeader from '../../components/PageHeader';
import SidePanel from '../../components/SidePanel';
import DataStatusBanner from '../../components/DataStatusBanner';
import { exportCSV } from '../../utils/export';
import { useApi } from '../../hooks/useApi';
import { fetchHipChecks, type HipRecord } from '../../services/api';
import styles from './HipChecks.module.css';

type CheckStatus = 'Pass' | 'Fail' | 'Warning';
interface Check { id: string; category: string; name: string; status: CheckStatus; detail: string; }

const CATEGORY_ICON: Record<string, string> = {
  Protection: '🛡️', Encryption: '🔒', OS: '💻',
  Certificate: '📜', Management: '⚙️', Identity: '🏢',
};

function getOverallResult(checks: Check[], deviceType?: string) {
  const isDesktop = (deviceType || '').toLowerCase() === 'desktop';
  const relevantChecks = isDesktop
    // Exclude BitLocker checks for desktops — not applicable
    ? checks.filter(c => !c.name.toLowerCase().includes('bitlocker'))
    : checks;
  return relevantChecks.some(c => c.status === 'Fail') ? 'NON-COMPLIANT' : 'COMPLIANT';
}
function countChecks(checks: Check[]) {
  return {
    passed:   checks.filter(c => c.status === 'Pass').length,
    failed:   checks.filter(c => c.status === 'Fail').length,
    warnings: checks.filter(c => c.status === 'Warning').length,
    total:    checks.length,
  };
}

/** For desktops, exclude BitLocker from counts so the summary shows 6✓ 0✗ /6 */
function countChecksForDevice(checks: Check[], deviceType?: string) {
  const isDesktop = (deviceType || '').toLowerCase() === 'desktop';
  const relevant  = isDesktop
    ? checks.filter(c => !c.name.toLowerCase().includes('bitlocker'))
    : checks;
  return {
    passed:   relevant.filter(c => c.status === 'Pass').length,
    failed:   relevant.filter(c => c.status === 'Fail').length,
    warnings: relevant.filter(c => c.status === 'Warning').length,
    total:    relevant.length,
  };
}

function CheckStatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'Pass')  return <CheckCircle2 size={16} className={styles.iconPass} />;
  if (status === 'Fail')  return <XCircle      size={16} className={styles.iconFail} />;
  return                         <AlertTriangle size={16} className={styles.iconWarn} />;
}
function CheckBadge({ status }: { status: CheckStatus }) {
  const cls = status === 'Pass' ? styles.badgePass : status === 'Fail' ? styles.badgeFail : styles.badgeWarn;
  return <span className={`${styles.badge} ${cls}`}>{status}</span>;
}

const doFetch = () => fetchHipChecks();

export default function EucHipChecks() {
  const { data, loading, error, live, lastUpdated, refresh } = useApi<HipRecord[]>(doFetch);

  const hipRecords = data ?? [];

  const [search, setSearch]               = useState('');
  const [networkFilter, setNetworkFilter] = useState<'All' | 'Online' | 'Offline'>('All');
  const [resultFilter, setResultFilter]   = useState<'All' | 'COMPLIANT' | 'NON-COMPLIANT'>('All');
  const [selected, setSelected]           = useState<HipRecord | null>(null);
  const [panelOpen, setPanelOpen]         = useState(false);

  // Drill-down modal state
  const [drillTitle,   setDrillTitle]   = useState('');
  const [drillColor,   setDrillColor]   = useState('#22c55e');
  const [drillRecords, setDrillRecords] = useState<HipRecord[]>([]);
  const [drillOpen,    setDrillOpen]    = useState(false);

  const openDrill = (status: 'COMPLIANT' | 'NON-COMPLIANT') => {
    const records = hipRecords.filter(r => getOverallResult(r.checks as Check[], r.deviceType) === status);
    setDrillTitle(status === 'COMPLIANT' ? 'Compliant Devices' : 'Non-Compliant Devices');
    setDrillColor(status === 'COMPLIANT' ? '#22c55e' : '#ef4444');
    setDrillRecords(records);
    setDrillOpen(true);
  };

  const filtered = useMemo(() => {
    return hipRecords.filter(r => {
      const term        = search.toLowerCase();
      const matchSearch = !term ||
        r.deviceName.toLowerCase().includes(term)   ||
        r.loggedInUser.toLowerCase().includes(term) ||
        r.serialNumber.toLowerCase().includes(term);
      const matchNet    = networkFilter === 'All' || r.networkMode === networkFilter;
      const matchResult = resultFilter  === 'All' || getOverallResult(r.checks as Check[], r.deviceType) === resultFilter;
      return matchSearch && matchNet && matchResult;
    // Sort newest-first by rawTimestamp (ISO) so the order is always consistent
    }).sort((a, b) => (b.rawTimestamp ?? '').localeCompare(a.rawTimestamp ?? ''));
  }, [hipRecords, search, networkFilter, resultFilter]);

  const openPanel = (record: HipRecord) => { setSelected(record); setPanelOpen(true); };

  const totalCompliant    = hipRecords.filter(r => getOverallResult(r.checks as Check[], r.deviceType) === 'COMPLIANT').length;
  const totalNonCompliant = hipRecords.length - totalCompliant;

  // Chart data for compliance overview
  const compliancePieData = useMemo(() => [
    { name: 'Compliant',     value: totalCompliant,    fill: '#22c55e' },
    { name: 'Non-Compliant', value: totalNonCompliant, fill: '#ef4444' },
  ], [totalCompliant, totalNonCompliant]);

  // Per-check-category pass/fail counts — one count per DEVICE per category (not per check item)
  const checkCategoryData = useMemo(() => {
    const cats: Record<string, { pass: number; fail: number; warn: number }> = {};
    hipRecords.forEach(r => {
      // Group checks by category for this device, take worst status per category
      const deviceCats: Record<string, string> = {};
      (r.checks as { category: string; status: string }[]).forEach(c => {
        const existing = deviceCats[c.category];
        // Fail > Warning > Pass precedence
        if (!existing || c.status === 'Fail' || (c.status === 'Warning' && existing === 'Pass')) {
          deviceCats[c.category] = c.status;
        }
      });
      // Count one per device per category
      Object.entries(deviceCats).forEach(([cat, status]) => {
        if (!cats[cat]) cats[cat] = { pass: 0, fail: 0, warn: 0 };
        if (status === 'Pass')    cats[cat].pass++;
        else if (status === 'Fail')   cats[cat].fail++;
        else                           cats[cat].warn++;
      });
    });
    return Object.entries(cats).map(([name, v]) => ({ name, ...v }));
  }, [hipRecords]);

  const exportData = filtered.map(r => {
    const counts = countChecksForDevice(r.checks as Check[], r.deviceType);
    return {
      timestamp: r.timestamp, deviceName: r.deviceName,
      serialNumber: r.serialNumber, loggedInUser: r.loggedInUser,
      networkMode: r.networkMode, appVersion: r.appVersion,
      passedChecks: counts.passed, failedChecks: counts.failed,
      totalChecks: counts.total, overallResult: getOverallResult(r.checks as Check[], r.deviceType),
    };
  });

  return (
    <div>
      <PageHeader
        title="HIP Compliance"
        subtitle="Device health inspection and security compliance status"
        actions={
          <div className={styles.headerBtns}>
            <button className={styles.ghostBtn}
              onClick={() => exportCSV(exportData as unknown as Record<string, unknown>[], 'hip-checks')}>
              <Download size={13} /> Export CSV
            </button>
            <button className={styles.ghostBtn} onClick={refresh}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      <DataStatusBanner loading={loading} error={error} live={live} lastUpdated={lastUpdated} onRefresh={refresh} />

      {/* Status / Count graphs — replaces summary cards */}
      <div className={styles.hipChartGrid}>
        {/* Compliant vs Non-Compliant donut — with visible counts + drill-down */}
        <div className={styles.hipChartCard}>
          <div className={styles.hipChartTitle}>Overall Compliance</div>
          <div className={styles.complianceDonutWrap}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={compliancePieData}
                  cx="50%" cy="50%"
                  innerRadius={52} outerRadius={72}
                  dataKey="value"
                  paddingAngle={3}
                  startAngle={90}
                  endAngle={-270}
                  strokeWidth={0}
                  style={{ cursor: 'pointer' }}
                  onClick={(entry: PieSectorDataItem) =>
                    openDrill(entry.name === 'Compliant' ? 'COMPLIANT' : 'NON-COMPLIANT')
                  }
                >
                  {compliancePieData.map(d => <Cell key={d.name} fill={d.fill} />)}
                </Pie>
                <Tooltip
                  formatter={(v) => [`${v as number} devices`, '']}
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.donutCentre}>
              <span className={styles.donutPct}>
                {hipRecords.length > 0
                  ? `${Math.round((totalCompliant / hipRecords.length) * 100)}%`
                  : '—'}
              </span>
              <span className={styles.donutLabel}>Compliant</span>
            </div>
          </div>

          {/* Clickable count legend below the donut */}
        </div>

        {/* Per-category pass/fail bar chart */}
        <div className={`${styles.hipChartCard} ${styles.hipChartCardWide}`}>
          <div className={styles.hipChartTitle}>Check Results by Category</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={checkCategoryData} barCategoryGap="28%" barGap={3} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="pass" name="Pass"    fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="fail" name="Fail"    fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="warn" name="Warning" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIco} />
          <input
            className={styles.searchInput}
            placeholder="Search by device, user, serial…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Network filter — dropdown */}
        <div className={styles.filterDropWrap}>
          <Filter size={12} className={styles.filterDropIcon} />
          <select
            className={styles.filterDropdown}
            value={networkFilter}
            onChange={e => setNetworkFilter(e.target.value as typeof networkFilter)}
            aria-label="Filter by network"
          >
            <option value="All">All Networks</option>
            <option value="Online">Online</option>
            <option value="Offline">Offline</option>
          </select>
        </div>

        {/* Result filter — dropdown */}
        <div className={styles.filterDropWrap}>
          <Filter size={12} className={styles.filterDropIcon} />
          <select
            className={styles.filterDropdown}
            value={resultFilter}
            onChange={e => setResultFilter(e.target.value as typeof resultFilter)}
            aria-label="Filter by compliance result"
          >
            <option value="All">All Results</option>
            <option value="COMPLIANT">Compliant</option>
            <option value="NON-COMPLIANT">Non-Compliant</option>
          </select>
        </div>

        <span className={styles.countLabel}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th><th>Device Name</th><th>Serial Number</th>
                <th>Logged-in User</th><th>Mode of FIX run</th><th>App Version</th>
                <th>Checks</th><th>Result</th><th></th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className={styles.emptyRow}>No data available.</td></tr>
              )}
              {filtered.map(record => {
                const checks   = record.checks as Check[];
                const counts   = countChecksForDevice(checks, record.deviceType);
                const result   = getOverallResult(checks, record.deviceType);
                const isOnline = record.networkMode === 'Online';
                return (
                  <tr key={record.id} className={styles.tableRow} onClick={() => openPanel(record)}>
                    <td className={styles.tsCell}><Clock size={11} style={{ marginRight: 5, opacity: 0.5 }} />{record.timestamp}</td>
                    <td className={styles.deviceCell}>{record.deviceName}</td>
                    <td className={styles.dimCell}>{record.serialNumber}</td>
                    <td>
                      <span className={styles.dimCell}>{record.loggedInUser}</span>
                    </td>
                    <td>
                      <span className={`${styles.netBadge} ${isOnline ? styles.netOnline : styles.netOffline}`}>
                        {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}{record.networkMode}
                      </span>
                    </td>
                    <td className={styles.dimCell}>{record.appVersion}</td>
                    <td>
                      <div className={styles.checkSummary}>
                        <span className={styles.passCount}>{counts.passed}✓</span>
                        {counts.failed   > 0 && <span className={styles.failCount}>{counts.failed}✗</span>}
                        {counts.warnings > 0 && <span className={styles.warnCount}>{counts.warnings}⚠</span>}
                        <span className={styles.totalCount}>/{counts.total}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.resultBadge} ${result === 'COMPLIANT' ? styles.resultCompliant : styles.resultNonCompliant}`}>
                        {result === 'COMPLIANT' ? <ShieldCheck size={12} /> : <ShieldX size={12} />}{result}
                      </span>
                    </td>
                    <td className={styles.arrowCell}><ChevronRight size={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Drill-down modal ── */}
      {drillOpen && (
        <>
          <div className={styles.drillBackdrop} onClick={() => setDrillOpen(false)} />
          <div className={styles.drillModal} role="dialog" aria-modal="true">
            <div className={styles.drillHeader}>
              <div className={styles.drillHeaderLeft}>
                <span className={styles.drillDot} style={{ background: drillColor }} />
                <div>
                  <h3 className={styles.drillTitle}>{drillTitle}</h3>
                  <p className={styles.drillSubtitle}>
                    {drillRecords.length} device{drillRecords.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className={styles.drillActions}>
                {drillRecords.length > 0 && (
                  <button
                    className={styles.drillExportBtn}
                    onClick={() => exportCSV(
                      drillRecords.map(r => {
                        const c = countChecks(r.checks as Check[]);
                        return { deviceName: r.deviceName, serialNumber: r.serialNumber, loggedInUser: r.loggedInUser, networkMode: r.networkMode, passedChecks: c.passed, failedChecks: c.failed, total: c.total };
                      }) as unknown as Record<string, unknown>[],
                      `hip-${drillTitle.toLowerCase().replace(/\s+/g, '-')}`
                    )}
                  >
                    <Download size={13} /> Export CSV
                  </button>
                )}
                <button className={styles.drillCloseBtn} onClick={() => setDrillOpen(false)} aria-label="Close">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className={styles.drillTableWrap}>
              {drillRecords.length === 0 ? (
                <div className={styles.drillEmpty}>No devices in this category.</div>
              ) : (
                <table className={styles.drillTable}>
                  <thead>
                    <tr>
                      <th>Device Name</th>
                      <th>Serial</th>
                      <th>Logged User</th>
                      <th>Network</th>
                      <th>Checks</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillRecords.map(r => {
                      const checks = r.checks as Check[];
                      const counts = countChecksForDevice(checks, r.deviceType);
                      const result = getOverallResult(checks, r.deviceType);
                      return (
                        <tr
                          key={r.id}
                          className={styles.drillRow}
                          onClick={() => { setDrillOpen(false); openPanel(r); }}
                          title="Click to view full HIP report"
                        >
                          <td className={styles.drillDevice}>{r.deviceName}</td>
                          <td className={styles.drillDim}>{r.serialNumber}</td>
                          <td className={styles.drillDim}>{r.loggedInUser}</td>
                          <td>
                            <span className={`${styles.netBadge} ${r.networkMode === 'Online' ? styles.netOnline : styles.netOffline}`}>
                              {r.networkMode === 'Online' ? <Wifi size={11} /> : <WifiOff size={11} />}
                              {r.networkMode}
                            </span>
                          </td>
                          <td>
                            <div className={styles.checkSummary}>
                              <span className={styles.passCount}>{counts.passed}✓</span>
                              {counts.failed > 0 && <span className={styles.failCount}>{counts.failed}✗</span>}
                              <span className={styles.totalCount}>/{counts.total}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.resultBadge} ${result === 'COMPLIANT' ? styles.resultCompliant : styles.resultNonCompliant}`}>
                              {result === 'COMPLIANT' ? <ShieldCheck size={11} /> : <ShieldX size={11} />}
                              {result}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Detail panel */}
      <SidePanel open={panelOpen} onClose={() => { setPanelOpen(false); setSelected(null); }}
        title={selected?.deviceName ?? ''} subtitle="HIP Compliance Report" width={540}
        screenshotName={selected?.deviceName}>
        {selected && (() => {
          const checks    = selected.checks as Check[];
          const isDesktop = (selected.deviceType || '').toLowerCase() === 'desktop';
          const counts    = countChecksForDevice(checks, selected.deviceType);
          const result    = getOverallResult(checks, selected.deviceType);
          return (
            <div className={styles.panelBody}>
              <section className={styles.panelSection}>
                <h4 className={styles.panelSectionTitle}>Device Information</h4>
                <div className={styles.infoGrid}>
                  {([
                    ['Timestamp',      selected.timestamp,    <Clock size={13} />],
                    ['Device Name',    selected.deviceName,   <Monitor size={13} />],
                    ['Serial Number',  selected.serialNumber, <Package size={13} />],
                    ['Logged-in User', selected.loggedInUser, <User size={13} />],
                    ['Mode of FIX run',   selected.networkMode,  selected.networkMode === 'Online' ? <Wifi size={13} /> : <WifiOff size={13} />],
                    ['App Version',    selected.appVersion,   <Package size={13} />],
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
                <h4 className={styles.panelSectionTitle}>Compliance / Security Checks</h4>
                <div className={styles.checksList}>
                  {checks.map(check => {
                    const isBitlockerOnDesktop =
                      isDesktop && check.name.toLowerCase().includes('bitlocker');

                    if (isBitlockerOnDesktop) {
                      // Render BitLocker as Not Applicable for desktops
                      return (
                        <div key={check.id} className={`${styles.checkRow} ${styles.checkRowNa}`}>
                          <div className={styles.checkLeft}>
                            <span className={styles.checkCategoryIcon}>{CATEGORY_ICON[check.category] ?? '🔍'}</span>
                            <div className={styles.checkInfo}>
                              <span className={styles.checkName}>{check.name}</span>
                              <span className={styles.checkDetail} style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                BitLocker is not applicable for desktop devices
                              </span>
                            </div>
                          </div>
                          <div className={styles.checkRight}>
                            <span className={`${styles.badge} ${styles.badgeNa}`}>N/A</span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={check.id}
                        className={`${styles.checkRow}
                          ${check.status === 'Fail' ? styles.checkRowFail : ''}
                          ${check.status === 'Warning' ? styles.checkRowWarn : ''}`}>
                        <div className={styles.checkLeft}>
                          <span className={styles.checkCategoryIcon}>{CATEGORY_ICON[check.category] ?? '🔍'}</span>
                          <div className={styles.checkInfo}>
                            <span className={styles.checkName}>{check.name}</span>
                            <span className={styles.checkDetail}>{check.detail}</span>
                          </div>
                        </div>
                        <div className={styles.checkRight}>
                          <CheckStatusIcon status={check.status} />
                          <CheckBadge status={check.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>              </section>

              <section className={`${styles.panelSection} ${styles.summarySection}
                ${result === 'COMPLIANT' ? styles.summarySectionGreen : styles.summarySectionRed}`}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryItem}>Passed: <strong>{counts.passed}</strong></span>
                  <span className={styles.summaryItem}>Failed: <strong>{counts.failed}</strong></span>
                  {counts.warnings > 0 && <span className={styles.summaryItem}>Warnings: <strong>{counts.warnings}</strong></span>}
                  <span className={styles.summaryItem}>Total: <strong>{counts.total}</strong></span>
                </div>
                <div className={`${styles.overallResult} ${result === 'COMPLIANT' ? styles.overallCompliant : styles.overallNonCompliant}`}>
                  {result === 'COMPLIANT' ? <ShieldCheck size={20} /> : <ShieldX size={20} />}
                  <span>Overall Result: {result}</span>
                </div>
              </section>
            </div>
          );
        })()}
      </SidePanel>
    </div>
  );
}
