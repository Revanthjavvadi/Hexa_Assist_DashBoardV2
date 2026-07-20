import { useState, useMemo } from 'react';
import {
  Search, Download, Copy,
  ChevronUp, ChevronDown,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  RefreshCw, Wifi, WifiOff, Cpu, Monitor,
  ShieldCheck, User, Clock, Tag, X, Check
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import SidePanel from '../../components/SidePanel';
import DataStatusBanner from '../../components/DataStatusBanner';
import { useApi } from '../../hooks/useApi';
import { fetchSystemInfo, type SystemDevice } from '../../services/api';
import { exportCSV, copyToClipboard } from '../../utils/export';
import { useTagStore, type DeviceTag } from '../../hooks/useTagStore';
import { getSessionUser, ROLE_CAPS } from '../../hooks/useAuth';
import { useTempAccess } from '../../hooks/useTempAccess';
import styles from './SystemInfo.module.css';

type SortKey = keyof SystemDevice;
type SortDir = 'asc' | 'desc';
const PAGE_SIZE = 25;

const doFetch = () => fetchSystemInfo();

// Wi-Fi signal strength indicator
function WifiSignalBar({ signal, ssid }: { signal?: string; ssid?: string }) {
  const pct = parseInt(signal ?? '0', 10);
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  const icon  = pct > 0 ? <Wifi size={11} /> : <WifiOff size={11} />;
  if (!ssid || ssid === '—') return <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color }}>
      {icon}
      <span style={{ color: 'var(--text-secondary)' }}>{ssid}</span>
      <span style={{ fontWeight: 600 }}>{pct}%</span>
    </span>
  );
}

export default function EucSystemInfo() {
  const { data, loading, error, live, lastUpdated, refresh } = useApi<SystemDevice[]>(doFetch);
  const { assign, remove: removeTag, getTagsForDevice, availableTags } = useTagStore();
  const _user  = getSessionUser();
  const { hasTempCap } = useTempAccess();
  // canTag: admin/developer/reader_tag by role OR temp 'manage' grant on 'system' module
  const canTag = _user ? ROLE_CAPS.canTag(_user.role) || hasTempCap('system', 'manage') : false;

  const systemDevices = data ?? [];

  const [search, setSearch]                     = useState('');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('All');
  const [osFilter, setOsFilter]                 = useState('All');
  const [patchFilter, setPatchFilter]           = useState('All');
  const [intuneFilter, setIntuneFilter]         = useState('All');
  const [diskTypeFilter, setDiskTypeFilter]     = useState('All');
  const [sortKey, setSortKey]                   = useState<SortKey>('sno');
  const [sortDir, setSortDir]                   = useState<SortDir>('asc');
  const [page, setPage]                         = useState(1);
  const [selected, setSelected]                 = useState<SystemDevice | null>(null);
  const [panelOpen, setPanelOpen]               = useState(false);

  // ── Tag assignment state ──
  const [selectedDevices, setSelectedDevices]     = useState<Set<string>>(new Set());
  const [tagModalOpen, setTagModalOpen]           = useState(false);
  const [tagSearch, setTagSearch]                 = useState('');

  const toggleDeviceSelection = (hostname: string) => {
    setSelectedDevices(prev => {
      const next = new Set(prev);
      if (next.has(hostname)) next.delete(hostname);
      else next.add(hostname);
      return next;
    });
  };

  const selectAllOnPage = () => {
    const allSelected = pageRows.every(r => selectedDevices.has(r.hostname));
    if (allSelected) {
      setSelectedDevices(prev => {
        const next = new Set(prev);
        pageRows.forEach(r => next.delete(r.hostname));
        return next;
      });
    } else {
      setSelectedDevices(prev => {
        const next = new Set(prev);
        pageRows.forEach(r => next.add(r.hostname));
        return next;
      });
    }
  };

  const handleAssignTag = (tag: DeviceTag) => {
    selectedDevices.forEach(hostname => assign(hostname, tag));
    setTagModalOpen(false);
    setSelectedDevices(new Set());
  };

  const filteredTags = availableTags.filter(t =>
    t.toLowerCase().includes(tagSearch.toLowerCase())
  );

  const deviceTypes = ['All', ...Array.from(new Set(systemDevices.map(d => d.deviceType).filter(Boolean))).sort()];
  const osOptions   = ['All', ...Array.from(new Set(systemDevices.map(d => d.os).filter(Boolean))).sort()];
  const diskTypes   = ['All', ...Array.from(new Set(systemDevices.map(d => d.diskType ?? '').filter(t => t && t !== '—'))).sort()];

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    let rows = systemDevices;
    if (term) rows = rows.filter(d =>
      d.hostname.toLowerCase().includes(term) ||
      d.username.toLowerCase().includes(term) ||
      d.os.toLowerCase().includes(term) ||
      (d.model ?? '').toLowerCase().includes(term) ||
      (d.serialNumber ?? '').toLowerCase().includes(term)
    );
    if (deviceTypeFilter !== 'All') rows = rows.filter(d => d.deviceType      === deviceTypeFilter);
    if (osFilter         !== 'All') rows = rows.filter(d => d.os              === osFilter);
    if (patchFilter      !== 'All') rows = rows.filter(d => d.patchCompliance === patchFilter);
    if (intuneFilter     !== 'All') rows = rows.filter(d => d.managedByIntune === intuneFilter);
    if (diskTypeFilter   !== 'All') rows = rows.filter(d => d.diskType        === diskTypeFilter);
    return [...rows].sort((a, b) => {
      const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [systemDevices, search, deviceTypeFilter, osFilter, patchFilter, intuneFilter, diskTypeFilter, sortKey, sortDir]);

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

  return (
    <div>
      <PageHeader
        title="System Information"
        subtitle={
          loading ? 'Loading…'
          : `${filtered.length.toLocaleString()} device${filtered.length !== 1 ? 's' : ''}` +
            (filtered.length !== systemDevices.length ? ` (filtered from ${systemDevices.length.toLocaleString()})` : '')
        }
        actions={
          <div className={styles.headerBtns}>
            {canTag && selectedDevices.size > 0 && (
              <button className={styles.tagBtn} onClick={() => setTagModalOpen(true)}>
                <Tag size={13} /> Assign Tag ({selectedDevices.size})
              </button>
            )}
            <button className={styles.ghostBtn} onClick={() => copyToClipboard(filtered as unknown as Record<string, unknown>[])}>
              <Copy size={13} /> Copy
            </button>
            <button className={styles.ghostBtn} onClick={() => {
              const exportRows = filtered.map(d => ({
                'S.No':              d.sno,
                'Hostname':          d.hostname,
                'Username':          d.username,
                'Device Type':       d.deviceType,
                'OS':                d.os,
                'Manufacturer':      d.manufacturer ?? '—',
                'Model':             d.model ?? '—',
                'Serial Number':     d.serialNumber ?? '—',
                'Disk Total':        d.diskTotal,
                'Disk Used':         d.diskUsed,
                'Disk Type':         d.diskType ?? '—',
                'RAM Total':         d.ramTotal,
                'RAM Used':          d.ramUsed,
                'Patch Compliance':  d.patchCompliance,
                'Patch Label':       d.patchLabel ?? '—',
                'Last Reboot':       d.lastReboot,
                'Domain':            d.domain,
                'Managed By Intune': d.managedByIntune,
                'Local Admin':       d.isLocalAdmin ?? '—',
                'Last Check-In':     d.lastCheckIn,
                'Status':            d.status,
                'WiFi SSID':         d.wifiSsid ?? '—',
                'WiFi Signal':       d.wifiSignal ?? '—',
                'Secure Boot':       d.secureBoot ?? '—',
                'Uptime':            d.uptime ?? '—',
                'Assigned Tags':     getTagsForDevice(d.hostname).join(', ') || '—',
              }));
              exportCSV(exportRows as unknown as Record<string, unknown>[], 'system-info');
            }}>
              <Download size={13} /> CSV
            </button>
            <button className={styles.ghostBtn} onClick={refresh}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      <DataStatusBanner loading={loading} error={error} live={live} lastUpdated={lastUpdated} onRefresh={refresh} />

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIco} />
          <input
            className={styles.searchInput}
            placeholder="Search hostname, user, OS, model, serial…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className={styles.filterSelect} value={deviceTypeFilter} onChange={e => { setDeviceTypeFilter(e.target.value); setPage(1); }}>
          {deviceTypes.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
        </select>
        <select className={styles.filterSelect} value={osFilter} onChange={e => { setOsFilter(e.target.value); setPage(1); }}>
          {osOptions.map(o => <option key={o} value={o}>{o === 'All' ? 'All OS' : o}</option>)}
        </select>
        <select className={styles.filterSelect} value={patchFilter} onChange={e => { setPatchFilter(e.target.value); setPage(1); }}>
          <option value="All">All Patch</option>
          <option value="Compliant">Compliant</option>
          <option value="Non-Compliant">Non-Compliant</option>
        </select>
        <select className={styles.filterSelect} value={intuneFilter} onChange={e => { setIntuneFilter(e.target.value); setPage(1); }}>
          <option value="All">All Intune</option>
          <option value="Yes">Managed</option>
          <option value="No">Not Managed</option>
        </select>
        {diskTypes.length > 1 && (
          <select className={styles.filterSelect} value={diskTypeFilter} onChange={e => { setDiskTypeFilter(e.target.value); setPage(1); }}>
            {diskTypes.map(d => <option key={d} value={d}>{d === 'All' ? 'All Disk Types' : d}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkTh}>
                  {canTag && (
                    <input
                      type="checkbox"
                      checked={pageRows.length > 0 && pageRows.every(r => selectedDevices.has(r.hostname))}
                      onChange={selectAllOnPage}
                      className={styles.checkbox}
                    />
                  )}
                </th>
                {([
                  ['sno',             'S.No'],
                  ['hostname',        'Hostname'],
                  ['username',        'Username'],
                  ['manufacturer',    'Manufacturer'],
                  ['model',           'Model'],
                  ['deviceType',      'Type'],
                  ['os',              'OS'],
                  ['ramTotal',        'RAM Total'],
                  ['ramUsed',         'RAM Used'],
                  ['diskTotal',       'Disk Total'],
                  ['diskUsed',        'Disk Used'],
                  ['diskType',        'Disk Type'],
                  ['patchLabel',      'Patch'],
                  ['wifiSsid',        'Wi-Fi'],
                  ['isLocalAdmin',    'Local Admin'],
                  ['lastReboot',      'Last Reboot'],
                  ['domain',          'Domain'],
                  ['managedByIntune', 'Intune'],
                  ['lastCheckIn',     'Last Check-In'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} onClick={() => handleSort(key)} className={styles.sortTh}>
                    {label} <SortIcon col={key} />
                  </th>
                ))}
                <th className={styles.tagColTh}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={21} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                    No data available.
                  </td>
                </tr>
              )}
              {pageRows.map(row => {
                const deviceTags = getTagsForDevice(row.hostname);
                return (
                <tr key={row.sno} className={styles.tableRow}
                  onClick={() => { setSelected(row); setPanelOpen(true); }}>
                  <td onClick={e => e.stopPropagation()}>
                    {canTag && (
                      <input
                        type="checkbox"
                        checked={selectedDevices.has(row.hostname)}
                        onChange={() => toggleDeviceSelection(row.hostname)}
                        className={styles.checkbox}
                      />
                    )}
                  </td>
                  <td className={styles.dimText}>{row.sno}</td>
                  <td className={styles.hostname}>{row.hostname}</td>
                  <td className={styles.dimText}>{row.username}</td>
                  <td className={styles.dimText}>{row.manufacturer ?? '—'}</td>
                  <td className={styles.dimText}>{row.model ?? '—'}</td>
                  <td>{row.deviceType}</td>
                  <td className={styles.dimText}>{row.os}</td>
                  <td>{row.ramTotal}</td>
                  <td className={styles.dimText}>{row.ramUsed}</td>
                  <td>{row.diskTotal}</td>
                  <td className={styles.dimText}>{row.diskUsed}</td>
                  <td>
                    {row.diskType && row.diskType !== '—'
                      ? <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>{row.diskType}</span>
                      : <span className={styles.dimText}>—</span>
                    }
                  </td>
                  <td>
                    <span className={row.patchCompliance === 'Compliant' ? styles.patchOk : styles.patchFail}
                      title={`Compliance: ${row.patchCompliance}`}>
                      {row.patchLabel ?? row.patchCompliance}
                    </span>
                  </td>
                  <td><WifiSignalBar signal={row.wifiSignal} ssid={row.wifiSsid} /></td>
                  <td>
                    <span style={{ fontSize: 11, color: row.isLocalAdmin === 'Yes' ? '#f59e0b' : 'var(--text-secondary)' }}>
                      {row.isLocalAdmin ?? '—'}
                    </span>
                  </td>
                  <td className={styles.dimText} style={{ fontSize: 11 }}>{row.lastReboot}</td>
                  <td className={styles.dimText}>{row.domain}</td>
                  <td>
                    <span className={row.managedByIntune === 'Yes' ? styles.intuneYes : styles.intuneNo}>
                      {row.managedByIntune === 'Yes' ? 'Managed' : 'Not Managed'}
                    </span>
                  </td>
                  <td className={styles.dimText} style={{ fontSize: 11 }}>{row.lastCheckIn}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {deviceTags.length > 0 ? (
                      <div className={styles.tagCellWrap}>
                        {deviceTags.map(tag => {
                          const isExecTag = tag.toLowerCase() === 'executive devices';
                          return (
                            <span key={tag} className={styles.tagPill} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              {tag}
                              {canTag && !isExecTag && (
                                <>
                                  <button
                                    style={{
                                      background: 'none', border: 'none', cursor: 'pointer',
                                      padding: '0 2px', color: 'var(--text-secondary)',
                                      fontSize: 10, lineHeight: 1, display: 'flex', alignItems: 'center',
                                    }}
                                    title={`Remove tag "${tag}"`}
                                    onClick={e => {
                                      e.stopPropagation();
                                      if (window.confirm(`Remove tag "${tag}" from ${row.hostname}?`)) {
                                        removeTag(row.hostname, tag as DeviceTag);
                                      }
                                    }}
                                  >
                                    ✕
                                  </button>
                                </>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className={styles.dimText} style={{ fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className={styles.pagination}>
          <span className={styles.pgInfo}>
            {filtered.length === 0 ? 'No records'
              : `Showing ${((page-1)*PAGE_SIZE+1).toLocaleString()}–${Math.min(page*PAGE_SIZE, filtered.length).toLocaleString()} of ${filtered.length.toLocaleString()}`
            }
          </span>
          <div className={styles.pgBtns}>
            <button onClick={() => setPage(1)} disabled={page === 1} className={styles.pgBtn} aria-label="First"><ChevronsLeft size={14} /></button>
            <button onClick={() => setPage(p => p-1)} disabled={page === 1} className={styles.pgBtn} aria-label="Prev"><ChevronLeft size={14} /></button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return <button key={pg} onClick={() => setPage(pg)} className={`${styles.pgBtn} ${pg === page ? styles.pgActive : ''}`}>{pg}</button>;
            })}
            <button onClick={() => setPage(p => p+1)} disabled={page >= totalPages} className={styles.pgBtn} aria-label="Next"><ChevronRight size={14} /></button>
            <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className={styles.pgBtn} aria-label="Last"><ChevronsRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* ── Device Detail Side Panel ── */}
      <SidePanel open={panelOpen} onClose={() => { setPanelOpen(false); setSelected(null); }}
        title={selected?.hostname ?? ''} subtitle="Device Snapshot" width={540}
        screenshotName={selected?.hostname}>
        {selected && (
          <div className={styles.detailBody}>

            {/* Hardware */}
            <section className={styles.detailSection}>
              <h4 className={styles.detailSectionTitle}><Monitor size={14} /> Hardware</h4>
              <div className={styles.detailGrid}>
                {[
                  ['Manufacturer',  selected.manufacturer ?? '—'],
                  ['Model',         selected.model        ?? '—'],
                  ['Serial No.',    selected.serialNumber ?? '—'],
                  ['Device Type',   selected.deviceType],
                  ['OS',            selected.os],
                  ['RAM Total',     selected.ramTotal],
                  ['RAM Used',      selected.ramUsed],
                  ['Disk Total',    selected.diskTotal],
                  ['Disk Used',     selected.diskUsed],
                  ['Disk Type',     selected.diskType     ?? '—'],
                  ['Uptime',        selected.uptime       ?? '—'],
                  ['Last Reboot',   selected.lastReboot],
                  ['Last Check-In', selected.lastCheckIn],
                ].map(([k, v]) => (
                  <div key={k} className={styles.detailRow}>
                    <span className={styles.detailKey}>{k}</span>
                    <span className={styles.detailVal}>{v}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Network */}
            <section className={styles.detailSection}>
              <h4 className={styles.detailSectionTitle}><Wifi size={14} /> Network</h4>
              <div className={styles.detailGrid}>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Wi-Fi SSID</span>
                  <span className={styles.detailVal}>{selected.wifiSsid ?? '—'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Signal Strength</span>
                  <span className={styles.detailVal}>
                    <WifiSignalBar signal={selected.wifiSignal} ssid={selected.wifiSsid} />
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Domain</span>
                  <span className={styles.detailVal}>{selected.domain}</span>
                </div>
              </div>
            </section>

            {/* Compliance & Management */}
            <section className={styles.detailSection}>
              <h4 className={styles.detailSectionTitle}><ShieldCheck size={14} /> Compliance & Management</h4>
              <div className={styles.detailGrid}>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Patch Compliance</span>
                  <span className={styles.detailVal}>
                    <StatusBadge status={selected.patchCompliance === 'Compliant' ? 'Healthy' : 'Critical'} />
                    {selected.patchLabel && selected.patchLabel !== '—' &&
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)' }}>({selected.patchLabel})</span>
                    }
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Secure Boot</span>
                  <span className={styles.detailVal} style={{ color: selected.secureBoot === 'Enabled' ? '#22c55e' : '#ef4444' }}>
                    {selected.secureBoot ?? '—'}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Managed by Intune</span>
                  <span className={selected.managedByIntune === 'Yes' ? styles.intuneYes : styles.intuneNo}>
                    {selected.managedByIntune === 'Yes' ? 'Managed' : 'Not Managed'}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Local Admin</span>
                  <span className={styles.detailVal} style={{ color: selected.isLocalAdmin === 'Yes' ? '#f59e0b' : 'inherit' }}>
                    {selected.isLocalAdmin ?? '—'}
                  </span>
                </div>
              </div>
            </section>

            {/* Tags section in panel */}
            <section className={styles.detailSection}>
              <h4 className={styles.detailSectionTitle}><Tag size={14} /> Tags</h4>
              <div className={styles.detailGrid}>
                {getTagsForDevice(selected.hostname).length > 0 ? (
                  <div className={styles.tagCellWrap}>
                    {getTagsForDevice(selected.hostname).map(tag => (
                      <span key={tag} className={styles.tagPill}>{tag}</span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.dimText}>No tags assigned</span>
                )}
              </div>
            </section>

            {/* User */}
            <section className={styles.detailSection}>
              <h4 className={styles.detailSectionTitle}><User size={14} /> User</h4>
              <div className={styles.detailGrid}>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Username</span>
                  <span className={styles.detailVal}>{selected.username}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Last Activity</span>
                  <span className={styles.detailVal}>{selected.lastActivity ?? '—'}</span>
                </div>
              </div>
            </section>

            {/* Installed Apps (if present) */}
            {selected.installedApps && selected.installedApps.length > 0 && (
              <section className={styles.detailSection}>
                <h4 className={styles.detailSectionTitle}><Cpu size={14} /> Installed Applications</h4>
                <div className={styles.appList}>
                  {selected.installedApps.map(app => (
                    <div key={app.name} className={styles.appRow}>
                      <span className={styles.appName}>{app.name}</span>
                      <span className={styles.appVer}>v{app.version}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Fix History (if present) */}
            {selected.recentFixes && selected.recentFixes.length > 0 && (
              <section className={styles.detailSection}>
                <h4 className={styles.detailSectionTitle}><Clock size={14} /> Recent Fix History</h4>
                <div className={styles.fixList}>
                  {selected.recentFixes.map((fix, i) => (
                    <div key={i} className={styles.fixHistRow}>
                      <div>
                        <div className={styles.fixHistName}>{fix.fix}</div>
                        <div className={styles.fixHistDate}>{fix.date} · {fix.duration}</div>
                      </div>
                      <StatusBadge status={fix.status} />
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </SidePanel>

      {/* ── Tag Assignment Modal ── */}
      {tagModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setTagModalOpen(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Tag size={16} /> Assign Tag
              </h3>
              <button className={styles.modalClose} onClick={() => setTagModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <p className={styles.modalSubtitle}>
              Assigning to <strong>{selectedDevices.size}</strong> selected device{selectedDevices.size !== 1 ? 's' : ''}
            </p>
            <div className={styles.modalSearch}>
              <Search size={14} className={styles.modalSearchIcon} />
              <input
                className={styles.modalSearchInput}
                placeholder="Search tags…"
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.tagList}>
              {filteredTags.map(tag => (
                <button
                  key={tag}
                  className={styles.tagOption}
                  onClick={() => handleAssignTag(tag)}
                >
                  <Tag size={14} className={styles.tagOptionIcon} />
                  <span>{tag}</span>
                  <Check size={14} className={styles.tagOptionCheck} />
                </button>
              ))}
              {filteredTags.length === 0 && (
                <div className={styles.tagEmpty}>No tags matching "{tagSearch}"</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
