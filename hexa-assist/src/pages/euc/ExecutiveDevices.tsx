import { useState, useMemo, useEffect } from 'react';
import {
  Search, Download, Copy, RefreshCw, Tag, Trash2,
  ChevronUp, ChevronDown,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  Monitor, Crown, Cpu, Shield,
  CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import SidePanel from '../../components/SidePanel';
import DataStatusBanner from '../../components/DataStatusBanner';
import { useApi } from '../../hooks/useApi';
import { fetchSystemInfo, fetchHipChecks, fetchSecurity, fetchFixes, type SystemDevice, type HipRecord, type SecurityRecord, type FixRecord } from '../../services/api';
import { useTagStore } from '../../hooks/useTagStore';
import { getSessionUser, ROLE_CAPS } from '../../hooks/useAuth';
import { useTempAccess } from '../../hooks/useTempAccess';
import { exportCSV, copyToClipboard } from '../../utils/export';
import styles from './ExecutiveDevices.module.css';

type SortKey = 'hostname' | 'username' | 'deviceType' | 'os' | 'lastCheckIn';
type SortDir = 'asc' | 'desc';
const PAGE_SIZE = 25;

const doFetch         = () => fetchSystemInfo();
const doFetchHip      = () => fetchHipChecks();
const doFetchSecurity = () => fetchSecurity();
const doFetchFixes    = () => fetchFixes();

export default function ExecutiveDevices() {
  const { data, loading, error, live, lastUpdated, refresh } = useApi<SystemDevice[]>(doFetch);
  const { data: hipData }      = useApi<HipRecord[]>(doFetchHip);
  const { data: securityData } = useApi<SecurityRecord[]>(doFetchSecurity);
  const { data: fixesData }    = useApi<FixRecord[]>(doFetchFixes);
  const { remove, refreshFromAzure, getAllTagEntries, tagEntries } = useTagStore();
  const _execUser = getSessionUser();
  const { hasTempCap } = useTempAccess();
  // canEdit: admin/developer/reader_tag by role OR temp 'manage' grant on 'executive' module
  const canEdit = _execUser ? ROLE_CAPS.canTag(_execUser.role) || hasTempCap('executive', 'manage') : false;

  // Force re-fetch tags from Cosmos on mount
  useEffect(() => { refreshFromAzure(); }, [refreshFromAzure]);

  const allDevices = data ?? [];

  // tagEntries is reactive (new array reference on every store tick) so
  // this useMemo correctly recomputes whenever the tag store updates
  const executiveDevices = useMemo(() => {
    const execHostnames = new Set(
      tagEntries
        .filter(e => Array.isArray(e.tags) && e.tags.some(t =>
          String(t).toLowerCase() === 'executive devices'
        ))
        .map(e => e.hostname)
    );
    return allDevices.filter(d => execHostnames.has(d.hostname));
  }, [allDevices, tagEntries]);

  const [search, setSearch]       = useState('');
  const [sortKey, setSortKey]     = useState<SortKey>('hostname');
  const [sortDir, setSortDir]     = useState<SortDir>('asc');
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<SystemDevice | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    let rows = executiveDevices;
    if (term) rows = rows.filter(d =>
      d.hostname.toLowerCase().includes(term) ||
      d.username.toLowerCase().includes(term) ||
      d.os.toLowerCase().includes(term)
    );
    return [...rows].sort((a, b) => {
      const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [executiveDevices, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className={styles.sortIcon}><ChevronUp size={10} /><ChevronDown size={10} /></span>;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className={styles.sortActive} />
      : <ChevronDown size={12} className={styles.sortActive} />;
  };

  const handleRemoveTag = (hostname: string) => {
    const entry = getAllTagEntries().find(e => e.hostname === hostname);
    const execTag = entry?.tags.find(t => String(t).toLowerCase() === 'executive devices');
    if (execTag) remove(hostname, execTag);
    if (selected?.hostname === hostname) { setPanelOpen(false); setSelected(null); }
  };

  const openDevicePanel = (device: SystemDevice) => {
    setSelected(device);
    setPanelOpen(true);
  };

  // Get related data for selected device
  const deviceHip = useMemo(() => {
    if (!selected || !hipData) return null;
    return hipData.find(r => r.deviceName === selected.hostname) ?? null;
  }, [selected, hipData]);

  const deviceSecurity = useMemo(() => {
    if (!selected || !securityData) return null;
    return securityData.find(r => r.deviceName === selected.hostname) ?? null;
  }, [selected, securityData]);

  const deviceFixes = useMemo(() => {
    if (!selected || !fixesData) return [];
    return fixesData.filter(r => r.deviceName === selected.hostname);
  }, [selected, fixesData]);

  return (
    <div>
      <PageHeader
        title="Executive Devices"
        subtitle={
          loading ? 'Loading…'
          : `${filtered.length.toLocaleString()} executive device${filtered.length !== 1 ? 's' : ''} tagged`
        }
        actions={
          <div className={styles.headerBtns}>
            <button className={styles.ghostBtn} onClick={() => copyToClipboard(filtered as unknown as Record<string, unknown>[])}>
              <Copy size={13} /> Copy
            </button>
            <button className={styles.ghostBtn} onClick={() => exportCSV(filtered as unknown as Record<string, unknown>[], 'executive-devices')}>
              <Download size={13} /> CSV
            </button>
            <button className={styles.ghostBtn} onClick={refresh}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      <DataStatusBanner loading={loading} error={error} live={live} lastUpdated={lastUpdated} onRefresh={refresh} />

      <div className={styles.infoBanner}>
        <Crown size={16} className={styles.infoIcon} />
        <span>
          Devices tagged from <strong>System Info</strong> appear here.
          Click any device to view complete details including system info, compliance, and fix history.
        </span>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIco} />
          <input
            className={styles.searchInput}
            placeholder="Search hostname, user, OS…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {executiveDevices.length === 0 && !loading ? (
        <div className={styles.emptyState}>
          <Tag size={48} className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>No Executive Devices Tagged</h3>
          <p className={styles.emptyDesc}>
            Go to <strong>System Info</strong>, select devices, and use <strong>"Assign Tag"</strong> to tag
            them. Tagged devices will appear here in real time.
          </p>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {([
                    ['hostname',    'Hostname'],
                    ['username',    'Username'],
                    ['deviceType',  'Type'],
                    ['os',          'OS'],
                    ['lastCheckIn', 'Last Check-In'],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th key={key} onClick={() => handleSort(key)} className={styles.sortTh}>
                      {label} <SortIcon col={key} />
                    </th>
                  ))}
                  <th className={styles.actionTh}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                      No matching executive devices found.
                    </td>
                  </tr>
                )}
                {pageRows.map(row => (
                  <tr key={row.hostname} className={styles.tableRow} onClick={() => openDevicePanel(row)} style={{ cursor: 'pointer' }}>
                    <td className={styles.hostname}>
                      <Monitor size={13} style={{ marginRight: 6 }} />
                      {row.hostname}
                    </td>
                    <td className={styles.dimText}>{row.username}</td>
                    <td>{row.deviceType}</td>
                    <td className={styles.dimText}>{row.os}</td>
                    <td className={styles.dimText} style={{ fontSize: 11 }}>{row.lastCheckIn}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <button
                          className={styles.removeBtn}
                          onClick={(e) => { e.stopPropagation(); handleRemoveTag(row.hostname); }}
                          title="Remove Executive tag"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.pgInfo}>
              {filtered.length === 0 ? 'No records'
                : `Showing ${((page-1)*PAGE_SIZE+1).toLocaleString()}–${Math.min(page*PAGE_SIZE, filtered.length).toLocaleString()} of ${filtered.length.toLocaleString()}`
              }
            </span>
            <div className={styles.pgBtns}>
              <button onClick={() => setPage(1)} disabled={page === 1} className={styles.pgBtn}><ChevronsLeft size={14} /></button>
              <button onClick={() => setPage(p => p-1)} disabled={page === 1} className={styles.pgBtn}><ChevronLeft size={14} /></button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                return <button key={pg} onClick={() => setPage(pg)} className={`${styles.pgBtn} ${pg === page ? styles.pgActive : ''}`}>{pg}</button>;
              })}
              <button onClick={() => setPage(p => p+1)} disabled={page >= totalPages} className={styles.pgBtn}><ChevronRight size={14} /></button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className={styles.pgBtn}><ChevronsRight size={14} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Device Detail Panel */}
      <SidePanel
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setSelected(null); }}
        title={selected?.hostname ?? ''}
        subtitle="Executive Device — Full Details"
        width={560}
      >
        {selected && (
          <div className={styles.panelBody}>
            {/* System Information */}
            <section className={styles.panelSection}>
              <h4 className={styles.sectionTitle}><Monitor size={14} /> System Information</h4>
              <div className={styles.infoGrid}>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Hostname</span><span className={styles.infoVal}>{selected.hostname}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Username</span><span className={styles.infoVal}>{selected.username}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Device Type</span><span className={styles.infoVal}>{selected.deviceType}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>OS</span><span className={styles.infoVal}>{selected.os}</span></div>
                {selected.manufacturer && <div className={styles.infoRow}><span className={styles.infoLabel}>Manufacturer</span><span className={styles.infoVal}>{selected.manufacturer}</span></div>}
                {selected.model && <div className={styles.infoRow}><span className={styles.infoLabel}>Model</span><span className={styles.infoVal}>{selected.model}</span></div>}
                {selected.serialNumber && <div className={styles.infoRow}><span className={styles.infoLabel}>Serial Number</span><span className={styles.infoVal}>{selected.serialNumber}</span></div>}
                {selected.cpu && <div className={styles.infoRow}><span className={styles.infoLabel}>CPU</span><span className={styles.infoVal}>{selected.cpu}</span></div>}
                <div className={styles.infoRow}><span className={styles.infoLabel}>RAM</span><span className={styles.infoVal}>{selected.ramUsed} / {selected.ramTotal}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Disk</span><span className={styles.infoVal}>{selected.diskUsed} / {selected.diskTotal}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Domain</span><span className={styles.infoVal}>{selected.domain}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Managed by Intune</span><span className={styles.infoVal}>{selected.managedByIntune}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Patch Compliance</span><span className={`${styles.infoVal} ${selected.patchCompliance === 'Compliant' ? styles.valGreen : styles.valRed}`}>{selected.patchCompliance}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Last Reboot</span><span className={styles.infoVal}>{selected.lastReboot}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Last Check-In</span><span className={styles.infoVal}>{selected.lastCheckIn}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>Status</span><span className={`${styles.statusBadge} ${styles[`status${selected.status}`]}`}>{selected.status}</span></div>
              </div>
            </section>

            {/* Security & Compliance */}
            <section className={styles.panelSection}>
              <h4 className={styles.sectionTitle}><Shield size={14} /> Security & Compliance</h4>
              {deviceSecurity ? (
                <div className={styles.checkGrid}>
                  <div className={`${styles.checkItem} ${deviceSecurity.cortexStatus === 'Running' ? styles.checkPass : styles.checkFail}`}>
                    <span className={styles.checkLabel}>Cortex XDR</span>
                    <span className={styles.checkVal}>{deviceSecurity.cortexStatus}</span>
                  </div>
                  <div className={`${styles.checkItem} ${deviceSecurity.gpStatus === 'Connected' ? styles.checkPass : styles.checkFail}`}>
                    <span className={styles.checkLabel}>GlobalProtect</span>
                    <span className={styles.checkVal}>{deviceSecurity.gpStatus}</span>
                  </div>
                  <div className={`${styles.checkItem} ${deviceSecurity.bitLockerStatus === 'Compliant' ? styles.checkPass : styles.checkFail}`}>
                    <span className={styles.checkLabel}>BitLocker</span>
                    <span className={styles.checkVal}>{deviceSecurity.bitLockerStatus}</span>
                  </div>
                  <div className={`${styles.checkItem} ${deviceSecurity.secureBootStatus === 'Enabled' ? styles.checkPass : styles.checkFail}`}>
                    <span className={styles.checkLabel}>Secure Boot</span>
                    <span className={styles.checkVal}>{deviceSecurity.secureBootStatus}</span>
                  </div>
                </div>
              ) : (
                <p className={styles.noData}>No security data found for this device.</p>
              )}
            </section>

            {/* HIP Compliance */}
            <section className={styles.panelSection}>
              <h4 className={styles.sectionTitle}><CheckCircle2 size={14} /> HIP Compliance</h4>
              {deviceHip ? (
                <div className={styles.hipChecks}>
                  {deviceHip.checks.map(check => (
                    <div key={check.id} className={`${styles.hipRow} ${check.status === 'Fail' ? styles.hipFail : check.status === 'Warning' ? styles.hipWarn : ''}`}>
                      <div className={styles.hipLeft}>
                        {check.status === 'Pass' ? <CheckCircle2 size={14} className={styles.iconPass} /> :
                         check.status === 'Fail' ? <XCircle size={14} className={styles.iconFail} /> :
                         <AlertTriangle size={14} className={styles.iconWarn} />}
                        <div>
                          <span className={styles.hipName}>{check.name}</span>
                          <span className={styles.hipDetail}>{check.detail}</span>
                        </div>
                      </div>
                      <span className={`${styles.hipBadge} ${check.status === 'Pass' ? styles.hipBadgePass : check.status === 'Fail' ? styles.hipBadgeFail : styles.hipBadgeWarn}`}>
                        {check.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.noData}>No HIP compliance data found for this device.</p>
              )}
            </section>

            {/* Recent Fixes */}
            <section className={styles.panelSection}>
              <h4 className={styles.sectionTitle}><Cpu size={14} /> Fix History</h4>
              {deviceFixes.length > 0 ? (
                <div className={styles.fixList}>
                  {deviceFixes.map(fix => (
                    <div key={fix.id} className={styles.fixRow}>
                      <div className={styles.fixInfo}>
                        <span className={styles.fixName}>{fix.fixName}</span>
                        <span className={styles.fixTs}>{fix.timestamp}</span>
                      </div>
                      <div className={styles.fixRight}>
                        <span className={`${styles.fixStatus} ${fix.status === 'Success' ? styles.fixSuccess : fix.status === 'Failed' ? styles.fixFailed : styles.fixPending}`}>
                          {fix.status}
                        </span>
                        <span className={styles.fixDuration}>{fix.duration}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.noData}>No fix history found for this device.</p>
              )}
            </section>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
