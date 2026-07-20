import { useState, useMemo } from 'react';
import {
  Monitor, CheckCircle2, ShieldCheck, Wrench, AlertTriangle,
  Download, X
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, type PieSectorDataItem, type BarRectangleItem,
} from 'recharts';
import KpiCard          from '../../components/KpiCard';
import ChartCard        from '../../components/ChartCard';
import PageHeader       from '../../components/PageHeader';
import DataStatusBanner from '../../components/DataStatusBanner';
import { useApi }       from '../../hooks/useApi';
import {
  fetchOverview, fetchFixes, fetchHipChecks, fetchSystemInfo,
  type OverviewData, type FixRecord, type HipRecord, type SystemDevice,
} from '../../services/api';
import { fmtNum }    from '../../utils/chart';
import { exportCSV } from '../../utils/export';
import styles from './Overview.module.css';

/* ── colour palettes ──────────────────────────────────────────── */
const FIX_PIE_COLORS = ['#0ea5e9','#8b5cf6','#22c55e','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#6366f1'];
const DEVICE_COLORS  = ['#0ea5e9','#8b5cf6','#22c55e','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
const OS_COLORS      = ['#6366f1','#0ea5e9','#8b5cf6','#14b8a6'];
const DISK_COLORS    = ['#0ea5e9','#f59e0b','#22c55e','#8b5cf6'];
const MFR_COLORS     = ['#0ea5e9','#8b5cf6','#22c55e','#f59e0b','#ef4444','#ec4899'];

const doFetchOverview = () => fetchOverview();
const doFetchFixes    = () => fetchFixes();
const doFetchHip      = () => fetchHipChecks();
const doFetchSystem   = () => fetchSystemInfo();

function tally(arr: (string | undefined)[], colors: string[]) {
  const map: Record<string, number> = {};
  arr.forEach(v => { if (v) map[v] = (map[v] || 0) + 1; });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
}

/* ── drill-down modal types ───────────────────────────────────── */
type DrillSource = 'fix' | 'health' | 'system' | 'kpi';
interface DrillState {
  source:    DrillSource;
  title:     string;
  subtitle:  string;
  accentColor?: string;
  /* payload varies per source */
  fixName?:       string;
  healthStatus?:  string;
  sysField?:      keyof SystemDevice;
  sysValue?:      string;
  kpiKey?:        string;
}

export default function Overview() {
  const { data, loading, error, live, lastUpdated, refresh } = useApi<OverviewData>(doFetchOverview);
  const { data: fixesData }  = useApi<FixRecord[]>(doFetchFixes);
  const { data: hipData }    = useApi<HipRecord[]>(doFetchHip);
  const { data: systemData } = useApi<SystemDevice[]>(doFetchSystem);

  /* unified drill-down state */
  const [drill, setDrill] = useState<DrillState | null>(null);

  const kpi        = data;
  const dailyTrend = data?.dailyFixTrend    ?? [];
  const devices    = systemData ?? [];

  /* ── Fix pie ──────────────────────────────────────────────────── */
  const fixNamePie = useMemo(() => {
    if (!fixesData) return [];
    const counts: Record<string, number> = {};
    fixesData.forEach(f => { counts[f.fixName] = (counts[f.fixName] || 0) + 1; });
    return Object.entries(counts)
      .map(([name, value], i) => ({ name, value, color: FIX_PIE_COLORS[i % FIX_PIE_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [fixesData]);

  /* ── Exec time ────────────────────────────────────────────────── */
  const execTimeData = useMemo(() => {
    if (!fixesData) return [];
    const groups: Record<string, number[]> = {};

    fixesData.forEach(f => {
      const d = (f.duration ?? '').trim().toLowerCase();
      if (!d || d === '—') return;

      let secs: number | null = null;

      // Parse duration without regex to satisfy security scanners (ReDoS rule S5852).
      // Supported formats: "3.5s", "3s", "2.1 min", "2 min", "5m", "1.5 m"
      if (d.endsWith('s') && !d.endsWith('min')) {
        const numPart = d.slice(0, -1).trim();
        const parsed = Number(numPart);
        if (!isNaN(parsed)) {
          secs = parsed;
        }
      } else if (d.endsWith('min')) {
        const numPart = d.slice(0, -3).trim();
        const parsed = Number(numPart);
        if (!isNaN(parsed)) {
          secs = parsed * 60;
        }
      } else if (d.endsWith('m')) {
        const numPart = d.slice(0, -1).trim();
        const parsed = Number(numPart);
        if (!isNaN(parsed)) {
          secs = parsed * 60;
        }
      }

      if (secs === null || isNaN(secs) || secs <= 0) return;

      const name = f.fixName || '—';
      if (!groups[name]) groups[name] = [];
      groups[name].push(secs);
    });

    return Object.entries(groups)
      .map(([name, vals]) => ({
        name,
        // Shortened label for X-axis display (max 20 chars)
        label: name.length > 22 ? name.slice(0, 20) + '…' : name,
        min: Math.min(...vals),
        max: Math.max(...vals),
        avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [fixesData]);

  /* ── HIP KPI — uses same desktop BitLocker exemption as HIP Compliance page ── */
  const hipKpi = useMemo(() => {
    if (!hipData) return { total: 0, compliant: 0, nonCompliant: 0 };
    const compliant = hipData.filter(r => {
      const isDesktop  = (r.deviceType || '').toLowerCase() === 'desktop';
      const relevant   = isDesktop
        ? r.checks.filter(c => !c.name.toLowerCase().includes('bitlocker'))
        : r.checks;
      return !relevant.some(c => c.status === 'Fail');
    }).length;
    return { total: hipData.length, compliant, nonCompliant: hipData.length - compliant };
  }, [hipData]);

  /* ── System inventory tallies ─────────────────────────────────── */
  const deviceTypePie = useMemo(() => tally(devices.map(d => d.deviceType),            DEVICE_COLORS), [devices]);
  const osPie         = useMemo(() => tally(devices.map(d => d.os),                    OS_COLORS),    [devices]);
  const diskTypePie   = useMemo(() => tally(devices.map(d => d.diskType ?? 'Unknown'), DISK_COLORS),  [devices]);
  const mfrPie        = useMemo(() => tally(devices.map(d => d.manufacturer ?? 'Unknown'), MFR_COLORS), [devices]);

  // Patch Status pie — group by actual patch compliance status directly from device data.
  // Uses patchCompliance (Compliant/Non-Compliant) and patchLabel (raw value e.g. "Compliant - June 2026")
  // NOT based on lastCheckIn.
  const patchMonthPie = useMemo(() => {
    if (!devices.length) return [];
    const MONTH_COLORS = ['#22c55e','#0ea5e9','#8b5cf6','#f59e0b','#ec4899','#14b8a6'];
    const sliceMap: Record<string, number> = {};

    devices.forEach(d => {
      if (d.patchCompliance !== 'Compliant') return;

      // Try to extract a month label from patchLabel (e.g. "Compliant - June 2026" → "June 2026")
      // or fall back to just "Compliant"
      const raw = (d.patchLabel || '').trim();
      let label = 'Compliant';

      if (raw && raw !== '—') {
        // Remove known prefixes like "Compliant", "Compliant -", "Compliant –"
        const stripped = raw
          .replace(/^compliant\s*[-–]?\s*/i, '')
          .replace(/^non-compliant\s*[-–]?\s*/i, '')
          .trim();
        // Use stripped value if it contains a meaningful month/year substring
        if (stripped && stripped.toLowerCase() !== 'compliant' && stripped !== '') {
          label = stripped;
        }
      }

      sliceMap[label] = (sliceMap[label] || 0) + 1;
    });

    return Object.entries(sliceMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value], i) => ({ name, value, color: MONTH_COLORS[i % MONTH_COLORS.length] }));
  }, [devices]);

  // Local Admin: show Yes / No counts
  const localAdminData = useMemo(() => {
    if (!devices.length) return [];
    const yes = devices.filter(d => d.isLocalAdmin === 'Yes').length;
    const no  = devices.filter(d => d.isLocalAdmin === 'No').length;
    const unk = devices.length - yes - no;
    return [
      { name: 'Yes',     value: yes, color: '#ef4444' },
      { name: 'No',      value: no,  color: '#22c55e' },
      ...(unk > 0 ? [{ name: 'Unknown', value: unk, color: '#94a3b8' }] : []),
    ];
  }, [devices]);

  /* ── drill helpers ────────────────────────────────────────────── */
  const openFixDrill = (name: string, color?: string) => {
    if (!name) return;
    setDrill({ source: 'fix', title: name, subtitle: `Devices that ran "${name}"`, accentColor: color, fixName: name });
  };

  const openSysDrill = (sysField: keyof SystemDevice, sysValue: string, title: string, accentColor?: string) => {
    setDrill({ source: 'system', title, subtitle: `Devices — ${sysField}: ${sysValue}`, accentColor, sysField, sysValue });
  };

  /* ── drill data resolver ──────────────────────────────────────── */
  const drillRows = useMemo((): { columns: string[]; rows: Record<string, string>[] } => {
    if (!drill) return { columns: [], rows: [] };

    if (drill.source === 'fix' && drill.fixName && fixesData) {
      const rows = fixesData
        .filter(f => f.fixName === drill.fixName)
        .map(f => ({
          'Device Name':   f.deviceName,
          'User':          f.loggedInUser,
          'Timestamp':     f.timestamp,
          'Status':        f.status,
          'Duration':      f.duration,
          'Network':       f.networkMode,
          'Details':       f.details,
        }));
      return { columns: ['Device Name','User','Timestamp','Status','Duration','Network','Details'], rows };
    }

    if (drill.source === 'health' && drill.healthStatus && devices.length) {
      const rows = devices
        .filter(d => d.status === drill.healthStatus)
        .map(d => ({
          'Hostname':      d.hostname,
          'Username':      d.username,
          'Device Type':   d.deviceType,
          'OS':            d.os,
          'Patch':         d.patchCompliance,
          'Last Check-In': d.lastCheckIn,
        }));
      return { columns: ['Hostname','Username','Device Type','OS','Patch','Last Check-In'], rows };
    }

    if (drill.source === 'system' && drill.sysField && devices.length) {
      // Special case: __month__ prefix means filter by compliance + month of lastCheckIn
      if (drill.sysValue?.startsWith('__month__')) {
        const patchLabel = drill.sysValue.replace('__month__', '');
        const rows = devices
          .filter(d => {
            if (d.patchCompliance !== 'Compliant') return false;
            const raw = (d.patchLabel || '').trim();
            if (!raw || raw === '—') return patchLabel === 'Compliant';
            const stripped = raw
              .replace(/^compliant\s*[-–]?\s*/i, '')
              .replace(/^non-compliant\s*[-–]?\s*/i, '')
              .trim();
            const effectiveLabel = (stripped && stripped.toLowerCase() !== 'compliant') ? stripped : 'Compliant';
            return effectiveLabel === patchLabel;
          })
          .map(d => ({
            'Hostname':      d.hostname,
            'Username':      d.username,
            'Device Type':   d.deviceType,
            'OS':            d.os,
            'Patch':         d.patchCompliance,
            'Last Check-In': d.lastCheckIn,
          }));
        return { columns: ['Hostname','Username','Device Type','OS','Patch','Last Check-In'], rows };
      }

      const rows = devices
        .filter(d => {
          const raw = d[drill.sysField!];
          const val = (raw === undefined || raw === null) ? 'Unknown' : String(raw);
          return val === drill.sysValue;
        })
        .map(d => ({
          'Hostname':      d.hostname,
          'Username':      d.username,
          'Device Type':   d.deviceType,
          'OS':            d.os,
          'Disk Total':    d.diskTotal,
          'RAM Total':     d.ramTotal,
          'Patch':         d.patchCompliance,
          'Last Check-In': d.lastCheckIn,
        }));
      return { columns: ['Hostname','Username','Device Type','OS','Disk Total','RAM Total','Patch','Last Check-In'], rows };
    }

    if (drill.source === 'kpi' && drill.kpiKey) {
      if (drill.kpiKey === 'hipCompliant' || drill.kpiKey === 'hipNon') {
        const wantCompliant = drill.kpiKey === 'hipCompliant';
        const rows = (hipData ?? [])
          .filter(r => {
            const isDesktop = (r.deviceType || '').toLowerCase() === 'desktop';
            const relevant  = isDesktop
              ? r.checks.filter(c => !c.name.toLowerCase().includes('bitlocker'))
              : r.checks;
            const isComp = !relevant.some(c => c.status === 'Fail');
            return wantCompliant ? isComp : !isComp;
          })
          .map(r => ({
            'Device':        r.deviceName,
            'User':          r.loggedInUser,
            'Serial':        r.serialNumber,
            'Network':       r.networkMode,
            'App Version':   r.appVersion,
            'Timestamp':     r.timestamp,
          }));
        return { columns: ['Device','User','Serial','Network','App Version','Timestamp'], rows };
      }
      if (drill.kpiKey === 'devices') {
        const rows = devices.map(d => ({
          'Hostname':    d.hostname,
          'Device Type': d.deviceType,
          'OS':          d.os,
          'Status':      d.status,
          'Patch':       d.patchCompliance,
          'Last Check-In': d.lastCheckIn,
        }));
        return { columns: ['Hostname','Device Type','OS','Status','Patch','Last Check-In'], rows };
      }
      if (drill.kpiKey === 'fixesToday') {
        const rows = (fixesData ?? []).map(f => ({
          'Device Name': f.deviceName,
          'Fix Name':    f.fixName,
          'Status':      f.status,
          'Duration':    f.duration,
          'Network':     f.networkMode,
          'Timestamp':   f.timestamp,
        }));
        return { columns: ['Device Name','Fix Name','Status','Duration','Network','Timestamp'], rows };
      }
    }

    return { columns: [], rows: [] };
  }, [drill, fixesData, devices, hipData]);

  const handleExportDrill = () => {
    if (!drillRows.rows.length || !drill) return;
    exportCSV(drillRows.rows as unknown as Record<string, unknown>[], `drill-${drill.title.split(' ').join('-').toLowerCase()}`);
  };

  /* ── mini-pie renderer with drill-down ───────────────────────── */
  const renderMiniPie = (
    pieData: { name: string; value: number; color: string }[],
    sysField: keyof SystemDevice,
  ) => (
    <div className={styles.miniPieWrap}>
      <ResponsiveContainer width="55%" height={160}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%" cy="50%"
            innerRadius={38} outerRadius={62}
            dataKey="value"
            paddingAngle={3}
            style={{ cursor: 'pointer' }}
            onClick={(entry: PieSectorDataItem) =>
              openSysDrill(sysField, entry.name ?? '', `${String(sysField)}: ${entry.name ?? ''}`, entry.color as string)
            }
            label={({ value, cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
              if ((percent ?? 0) < 0.05) return null;
              const R = Math.PI / 180;
              const r = innerRadius + (outerRadius - innerRadius) * 0.5;
              const x = (cx as number) + r * Math.cos(-(midAngle ?? 0) * R);
              const y = (cy as number) + r * Math.sin(-(midAngle ?? 0) * R);
              return (
                <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
                  {value}
                </text>
              );
            }}
            labelLine={false}
          >
            {pieData.map(e => <Cell key={e.name} fill={e.color} />)}
          </Pie>
          <Tooltip formatter={(v) => [v as number, 'Devices']} contentStyle={{ borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className={styles.miniPieLegend}>
        {pieData.map(e => (
          <button
            key={e.name}
            className={styles.miniLegendRow}
            onClick={() => openSysDrill(sysField, e.name, `${String(sysField)}: ${e.name}`, e.color)}
            title={`Drill into ${e.name}`}
          >
            <span className={styles.miniLegendDot} style={{ background: e.color }} />
            <span className={styles.miniLegendName}>{e.name}</span>
            <span className={styles.miniLegendVal}>{e.value}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Enterprise Overview"
        subtitle={kpi ? `Hexa Assist Dashboard · Last check-in: ${kpi.lastCheckIn}` : 'Loading…'}
      />

      <DataStatusBanner loading={loading} error={error} live={live} lastUpdated={lastUpdated} onRefresh={refresh} />

      {/* ── KPI Cards (restored) ── */}
      <div className={styles.kpiGrid}>
        <KpiCard label="Total Devices"       value={loading ? '—' : (kpi?.totalDevices ?? 0)}           icon={Monitor}       accent="blue" />
        <KpiCard label="Fixes Today"         value={loading ? '—' : (kpi?.totalFixesToday ?? 0)}        icon={Wrench}        accent="blue" />
        <KpiCard label="Security Compliance" value={loading ? '—' : `${kpi?.securityCompliance ?? 0}%`} icon={ShieldCheck}   accent="green" />
        <KpiCard label="HIP Compliant"       value={loading ? '—' : hipKpi.compliant}                   icon={CheckCircle2}  accent="green" />
        <KpiCard label="HIP Non-Compliant"   value={loading ? '—' : hipKpi.nonCompliant}                icon={AlertTriangle} accent="red" />
      </div>

      {/* ── 2-column main chart grid ── */}
      <div className={styles.chartGrid}>

        {/* Fixes Executed by Type */}
        <ChartCard title="Fixes Executed by Type" subtitle="Click segment or legend to drill into devices">
          <div className={styles.pieWrapper}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={fixNamePie}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={95}
                  dataKey="value" nameKey="name"
                  paddingAngle={3}
                  style={{ cursor: 'pointer' }}
                  onClick={(entry: PieSectorDataItem) => openFixDrill(entry.name ?? '', entry.color as string)}
                  label={({ value, cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                    if ((percent ?? 0) < 0.04) return null;
                    const R = Math.PI / 180;
                    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                    const x = (cx as number) + r * Math.cos(-(midAngle ?? 0) * R);
                    const y = (cy as number) + r * Math.sin(-(midAngle ?? 0) * R);
                    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>{value}</text>;
                  }}
                  labelLine={false}
                >
                  {fixNamePie.map(e => (
                    <Cell key={e.name} fill={e.color}
                      stroke={drill?.fixName === e.name ? '#1e293b' : '#fff'}
                      strokeWidth={drill?.fixName === e.name ? 3 : 1}
                      opacity={drill?.fixName && drill.fixName !== e.name ? 0.35 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [(v as number).toLocaleString() + ' runs', 'Count']} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.pieLegend}>
              {fixNamePie.map(e => (
                <button key={e.name} className={`${styles.legendItem} ${drill?.fixName === e.name ? styles.legendActive : ''}`} onClick={() => openFixDrill(e.name, e.color)}>
                  <span className={styles.legendDot} style={{ background: e.color }} />
                  <span className={styles.legendLabel}>{e.name}</span>
                  <span className={styles.legendCount}>{e.value}</span>
                </button>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* Daily Fix Trend */}
        <ChartCard title="Daily Fix Trend" subtitle="Fixes executed per day (last 7 days)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dailyTrend} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
              <Tooltip formatter={fmtNum} />
              <Line type="monotone" dataKey="fixes" name="Fixes" stroke="var(--brand)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--brand)' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Script Execution Time */}
        <ChartCard title="Script Execution Time" subtitle="Min, avg &amp; max duration per fix type — click a bar to drill into devices" span={2}>
          {execTimeData.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No execution time data yet — run a fix to populate this chart.
            </div>
          ) : (
            <>
              {/* Horizontal bar chart — names on Y-axis, no rotation overlap */}
              <ResponsiveContainer width="100%" height={Math.max(180, execTimeData.length * 42)}>
                <BarChart
                  layout="vertical"
                  data={execTimeData}
                  barCategoryGap="30%"
                  barGap={2}
                  margin={{ top: 4, right: 40, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}s`}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                    axisLine={false} tickLine={false}
                    width={160}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      `${(v as number).toFixed(1)}s`,
                      name === 'min' ? 'Min Duration' : name === 'max' ? 'Max Duration' : 'Avg Duration',
                    ]}
                    labelFormatter={(label) => {
                      const entry = execTimeData.find(d => d.label === String(label));
                      return entry?.name ?? String(label);
                    }}
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                  <Bar dataKey="min" name="min" fill="#22c55e" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }}
                    onClick={(entry: BarRectangleItem) => openFixDrill(entry.name ?? '', '#22c55e')} />
                  <Bar dataKey="avg" name="avg" fill="#0ea5e9" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }}
                    onClick={(entry: BarRectangleItem) => openFixDrill(entry.name ?? '', '#0ea5e9')} />
                  <Bar dataKey="max" name="max" fill="#f59e0b" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }}
                    onClick={(entry: BarRectangleItem) => openFixDrill(entry.name ?? '', '#f59e0b')} />
                </BarChart>
              </ResponsiveContainer>
              {/* Separate legend below — no overlap */}
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                {[
                  { color: '#22c55e', label: 'Min Duration' },
                  { color: '#0ea5e9', label: 'Avg Duration' },
                  { color: '#f59e0b', label: 'Max Duration' },
                ].map(({ color, label }) => (
                  <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        {/* ── 6 Inventory charts — 3-column compact grid (span 2) ── */}
        <div className={`${styles.inventoryGrid} ${styles.span2}`}>

          <ChartCard title="Device Type" subtitle="Click to drill down">
            {renderMiniPie(deviceTypePie, 'deviceType')}
          </ChartCard>

          <ChartCard title="Manufacturer" subtitle="Click to drill down">
            {renderMiniPie(mfrPie, 'manufacturer')}
          </ChartCard>

          <ChartCard title="Operating System" subtitle="Click to drill down">
            {renderMiniPie(osPie, 'os')}
          </ChartCard>

          <ChartCard title="Disk Type" subtitle="Click to drill down">
            {renderMiniPie(diskTypePie, 'diskType')}
          </ChartCard>

          {/* Patch Status — month-based pie with correct drill-down */}
          <ChartCard title="Patch Status" subtitle="Compliant devices by month — click to drill down">
            <div className={styles.miniPieWrap}>
              <ResponsiveContainer width="55%" height={160}>
                <PieChart>
                  <Pie
                    data={patchMonthPie}
                    cx="50%" cy="50%"
                    innerRadius={38} outerRadius={62}
                    dataKey="value"
                    paddingAngle={3}
                    style={{ cursor: 'pointer' }}
                    onClick={(entry: PieSectorDataItem) =>
                      setDrill({
                        source: 'system',
                        title: `Patch Compliant — ${entry.name ?? ''}`,
                        subtitle: `Compliant devices checked in during ${entry.name ?? ''}`,
                        accentColor: entry.color as string,
                        sysField: 'patchCompliance',
                        sysValue: `__month__${entry.name ?? ''}`,
                      })
                    }
                    label={({ value, cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                      if ((percent ?? 0) < 0.05) return null;
                      const R = Math.PI / 180;
                      const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                      const x = (cx as number) + r * Math.cos(-(midAngle ?? 0) * R);
                      const y = (cy as number) + r * Math.sin(-(midAngle ?? 0) * R);
                      return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{value}</text>;
                    }}
                    labelLine={false}
                  >
                    {patchMonthPie.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [v as number, 'Devices']} contentStyle={{ borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.miniPieLegend}>
                {patchMonthPie.map(e => (
                  <button
                    key={e.name}
                    className={styles.miniLegendRow}
                    onClick={() =>
                      setDrill({
                        source: 'system',
                        title: `Patch Compliant — ${e.name}`,
                        subtitle: `Compliant devices checked in during ${e.name}`,
                        accentColor: e.color,
                        sysField: 'patchCompliance',
                        sysValue: `__month__${e.name}`,
                      })
                    }
                    title={`Show compliant devices for ${e.name}`}
                  >
                    <span className={styles.miniLegendDot} style={{ background: e.color }} />
                    <span className={styles.miniLegendName}>{e.name}</span>
                    <span className={styles.miniLegendVal}>{e.value}</span>
                  </button>
                ))}
              </div>
            </div>
          </ChartCard>

          {/* Local Administrator — Yes / No */}
          <ChartCard title="Local Administrator" subtitle="Click to drill down">
            {renderMiniPie(localAdminData, 'isLocalAdmin')}
          </ChartCard>

        </div>

      </div>

      {/* ── Unified drill-down modal ── */}
      {drill && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setDrill(null)} />
          <div className={styles.detailModal} role="dialog" aria-modal="true" aria-label={drill.title}>
            <div className={styles.detailHeader}>
              <div className={styles.detailHeaderLeft}>
                {drill.accentColor && <span className={styles.detailDot} style={{ background: drill.accentColor }} />}
                <div>
                  <h3 className={styles.detailTitle}>{drill.title}</h3>
                  <p className={styles.detailSubtitle}>{drillRows.rows.length} record{drillRows.rows.length !== 1 ? 's' : ''} · {drill.subtitle}</p>
                </div>
              </div>
              <div className={styles.detailActions}>
                {drillRows.rows.length > 0 && (
                  <button className={styles.exportBtn} onClick={handleExportDrill}><Download size={13} /> Export CSV</button>
                )}
                <button className={styles.closeBtn} onClick={() => setDrill(null)}><X size={14} /></button>
              </div>
            </div>
            <div className={styles.detailTableWrap}>
              {drillRows.rows.length === 0 ? (
                <div className={styles.emptyDrill}>No records found for this selection.</div>
              ) : (
                <table className={styles.detailTable}>
                  <thead><tr>{drillRows.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {drillRows.rows.map((row, i) => (
                      <tr key={i}>
                        {drillRows.columns.map(c => (
                          <td key={c} className={c === 'Device Name' || c === 'Hostname' || c === 'Device' ? styles.deviceName : undefined}>
                            {c === 'Status' || c === 'Patch' ? (
                              <span className={`${styles.statusBadge} ${
                                row[c] === 'Success' || row[c] === 'Compliant' || row[c] === 'Healthy' ? styles.statusSuccess
                                : row[c] === 'Failed' || row[c] === 'Non-Compliant' || row[c] === 'Critical' ? styles.statusFailed
                                : row[c] === 'Offline' ? styles.statusOffline
                                : styles.statusPending
                              }`}>{row[c]}</span>
                            ) : c === 'Network' ? (
                              <span className={`${styles.netBadge} ${row[c] === 'Online' ? styles.netOnline : styles.netOffline}`}>{row[c]}</span>
                            ) : row[c]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
