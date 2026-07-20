import { useState, useMemo } from 'react';
import { Wrench, Wifi, WifiOff, Clock, Search, Download, Filter } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import DataStatusBanner from '../../components/DataStatusBanner';
import { exportCSV } from '../../utils/export';
import { useApi }    from '../../hooks/useApi';
import { fetchFixes, type FixRecord } from '../../services/api';
import styles from './Fixes.module.css';

const doFetch = () => fetchFixes();

type DateRange = 'All' | 'Today' | 'Yesterday' | 'Last7' | 'Last1M' | 'Last2M' | 'Last3M';

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  All:       'All Time',
  Today:     'Today',
  Yesterday: 'Yesterday',
  Last7:     'Last 7 Days',
  Last1M:    'Last 1 Month',
  Last2M:    'Last 2 Months',
  Last3M:    'Last 3 Months',
};

function getDateRangeCutoff(range: DateRange): { from: Date | null; to: Date | null } {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'All')       return { from: null, to: null };
  if (range === 'Today')     return { from: today, to: null };
  if (range === 'Yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: y, to: today };
  }
  if (range === 'Last7')  { const d = new Date(today); d.setDate(d.getDate() - 7);  return { from: d, to: null }; }
  if (range === 'Last1M') { const d = new Date(today); d.setMonth(d.getMonth() - 1); return { from: d, to: null }; }
  if (range === 'Last2M') { const d = new Date(today); d.setMonth(d.getMonth() - 2); return { from: d, to: null }; }
  if (range === 'Last3M') { const d = new Date(today); d.setMonth(d.getMonth() - 3); return { from: d, to: null }; }
  return { from: null, to: null };
}

/** Parse a timestamp string that may be ISO, UTC, or IST-formatted */
function parseTimestamp(ts: string): Date | null {
  if (!ts || ts === '—') return null;

  // 1. ISO / UTC: "2026-06-29T04:43:15Z" or "2026-06-29T04:43:15.000Z"
  if (/^\d{4}-\d{2}-\d{2}T/.test(ts)) {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2. IST display format: "29 Jun 2026, 10:13:15 IST"
  //    Remove " IST", remove comma, then parse as local date string
  if (ts.includes('IST')) {
    const cleaned = ts.replace(' IST', '').replace(',', '').trim();
    // cleaned → "29 Jun 2026 10:13:15"
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      // The stored IST time is already UTC+5:30 offset baked into the string.
      // Subtract 5h30m to get actual UTC time for correct comparison.
      return new Date(d.getTime() - (5 * 60 + 30) * 60 * 1000);
    }
    return null;
  }

  // 3. Fallback: try native parse
  const d = new Date(ts.replace(' UTC', 'Z').replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

export default function EucFixes() {
  const { data, loading, error, live, lastUpdated, refresh } = useApi<FixRecord[]>(doFetch);

  const fixEvents = data ?? [];

  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('All');
  const [networkFilter, setNetworkFilter] = useState('All');
  const [fixNameFilter, setFixNameFilter] = useState('All');
  const [dateRange, setDateRange]         = useState<DateRange>('All');

  const fixNames = ['All', ...Array.from(new Set(fixEvents.map(e => e.fixName))).sort()];

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const { from, to } = getDateRangeCutoff(dateRange);
    return fixEvents.filter(e => {
      const matchSearch  = !term ||
        e.deviceName.toLowerCase().includes(term)   ||
        e.loggedInUser.toLowerCase().includes(term) ||
        e.serialNumber.toLowerCase().includes(term) ||
        e.fixName.toLowerCase().includes(term)      ||
        e.details.toLowerCase().includes(term);
      const matchStatus  = statusFilter  === 'All' || e.status      === statusFilter;
      const matchNetwork = networkFilter === 'All' || e.networkMode === networkFilter;
      const matchFix     = fixNameFilter === 'All' || e.fixName     === fixNameFilter;
      let   matchDate    = true;
      if (from || to) {
        // Prefer rawTimestamp (ISO) for accurate date comparison; fall back to display timestamp
        const ts = parseTimestamp(e.rawTimestamp || e.timestamp);
        if (!ts) {
          // Unparseable timestamp — exclude from date-filtered results
          matchDate = false;
        } else {
          if (from && ts < from) matchDate = false;
          if (to   && ts >= to)  matchDate = false;
        }
      }
      return matchSearch && matchStatus && matchNetwork && matchFix && matchDate;
    });
  }, [fixEvents, search, statusFilter, networkFilter, fixNameFilter, dateRange]);

  return (
    <div>
      <PageHeader
        title="Fixes"
        subtitle="fix_initiated events — user-triggered remediation actions"
        actions={
          <button
            className={styles.exportBtn}
            onClick={() => exportCSV(filtered as unknown as Record<string, unknown>[], 'fix-events')}
          >
            <Download size={13} /> Export CSV
          </button>
        }
      />

      <DataStatusBanner
        loading={loading}
        error={error}
        live={live}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIco} />
          <input
            className={styles.searchInput}
            placeholder="Search device, user, fix name, details…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="All">All Statuses</option>
          <option value="Success">Success</option>
          <option value="Failed">Failed</option>
        </select>
        <select className={styles.filterSelect} value={networkFilter} onChange={e => setNetworkFilter(e.target.value)}>
          <option value="All">Mode of Networks</option>
          <option value="Online">Online</option>
          <option value="Offline">Offline</option>
        </select>
        <select className={styles.filterSelect} value={fixNameFilter} onChange={e => setFixNameFilter(e.target.value)}>
          {fixNames.map(f => <option key={f} value={f}>{f === 'All' ? 'All Fix Types' : f}</option>)}
        </select>
        {/* Date range filter */}
        <div className={styles.dateRangeWrap}>
          <Filter size={13} className={styles.filterIco} />
          <select
            className={styles.filterSelect}
            value={dateRange}
            onChange={e => setDateRange(e.target.value as DateRange)}
            title="Filter by date range"
          >
            {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(k => (
              <option key={k} value={k}>{DATE_RANGE_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <span className={styles.countLabel}>{filtered.length} events</span>
      </div>

      {/* Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Device Name</th>
                <th>Serial Number</th>
                <th>Logged-in User</th>
                <th>Mode of FIX run</th>
                <th>Action</th>
                <th>Fix Name</th>
                <th>Status</th>
                <th>Duration</th>
                <th>FIX category</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ev => (
                <tr key={ev.id} className={styles.tableRow}>
                  <td className={styles.tsCell}>
                    <Clock size={11} style={{ marginRight: 5, opacity: 0.45 }} />
                    {ev.timestamp}
                  </td>
                  <td className={styles.deviceCell}>{ev.deviceName}</td>
                  <td className={styles.dimCell}>{ev.serialNumber}</td>
                  <td className={styles.dimCell}>{ev.loggedInUser}</td>
                  <td>
                    <span className={`${styles.netBadge} ${ev.networkMode === 'Online' ? styles.netOnline : styles.netOffline}`}>
                      {ev.networkMode === 'Online' ? <Wifi size={11} /> : <WifiOff size={11} />}
                      {ev.networkMode}
                    </span>
                  </td>
                  <td>
                    <span className={styles.actionTag}>
                      <Wrench size={11} /> {ev.action}
                    </span>
                  </td>
                  <td className={styles.fixNameCell}>{ev.fixName}</td>
                  <td><StatusBadge status={ev.status} /></td>
                  <td className={styles.dimCell}>{ev.duration}</td>
                  <td className={styles.detailCell}>
                    <span title={ev.details} className={styles.detailText}>{ev.details}</span>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className={styles.emptyRow}>No events match your filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
