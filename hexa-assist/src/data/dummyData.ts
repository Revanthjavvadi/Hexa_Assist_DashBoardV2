// ─────────────────────────────────────────────
// HEXA ASSIST – Realistic enterprise dummy data
// Replace this layer with Azure Blob Storage APIs
// ─────────────────────────────────────────────

export const kpiOverview = {
  totalDevices: 31_420,
  activeDevices: 28_945,
  inactiveDevices: 2_475,
  devicesCheckedToday: 24_310,
  totalFixesToday: 4_872,
  successfulFixes: 4_510,
  failedFixes: 247,
  pendingFixes: 115,
  securityCompliance: 94.3,
  avgFixExecutionTime: '2.1 min',
  lastCheckIn: '2026-06-09 14:52:33 UTC',
};

export const fixStatusPie = [
  { name: 'Success', value: 4510, color: '#22c55e' },
  { name: 'Failed', value: 247, color: '#ef4444' },
  { name: 'Pending', value: 115, color: '#f59e0b' },
];

export const dailyFixTrend = [
  { date: 'Jun 3', fixes: 3820 },
  { date: 'Jun 4', fixes: 4100 },
  { date: 'Jun 5', fixes: 3650 },
  { date: 'Jun 6', fixes: 4430 },
  { date: 'Jun 7', fixes: 3980 },
  { date: 'Jun 8', fixes: 4250 },
  { date: 'Jun 9', fixes: 4872 },
];

export const deviceHealthDist = [
  { status: 'Healthy', count: 25340 },
  { status: 'Warning', count: 4820 },
  { status: 'Critical', count: 1260 },
];

export const complianceTrend = [
  { date: 'Jan', pct: 87.2 },
  { date: 'Feb', pct: 88.9 },
  { date: 'Mar', pct: 90.1 },
  { date: 'Apr', pct: 91.7 },
  { date: 'May', pct: 93.0 },
  { date: 'Jun', pct: 94.3 },
];

// ── Actions & Fixes ───────────────────────────
export const fixBreakdown = [
  { fix: 'Teams Fix', runs: 1200, success: 1150, failed: 50, avgDuration: '2.3 min' },
  { fix: 'Outlook Fix', runs: 800, success: 760, failed: 40, avgDuration: '1.8 min' },
  { fix: 'SSO Fix', runs: 500, success: 450, failed: 50, avgDuration: '3.2 min' },
  { fix: 'VPN Reset', runs: 430, success: 410, failed: 20, avgDuration: '1.5 min' },
  { fix: 'Print Spooler', runs: 380, success: 355, failed: 25, avgDuration: '2.7 min' },
  { fix: 'Disk Cleanup', runs: 620, success: 600, failed: 20, avgDuration: '4.1 min' },
  { fix: 'Windows Update', runs: 290, success: 260, failed: 30, avgDuration: '8.3 min' },
  { fix: 'AV Scan', runs: 340, success: 330, failed: 10, avgDuration: '5.2 min' },
  { fix: 'OneDrive Sync', runs: 310, success: 295, failed: 15, avgDuration: '2.0 min' },
];

export const engineers = [
  { name: 'Alex Johnson', fixesExecuted: 842, avgTime: '2.1 min' },
  { name: 'Priya Sharma', fixesExecuted: 791, avgTime: '1.9 min' },
  { name: 'Marcus Chen', fixesExecuted: 674, avgTime: '2.4 min' },
  { name: 'Sofia Martinez', fixesExecuted: 723, avgTime: '2.2 min' },
  { name: 'James Okafor', fixesExecuted: 615, avgTime: '2.6 min' },
  { name: 'Emma Williams', fixesExecuted: 889, avgTime: '1.8 min' },
];

export const successVsFailTrend = [
  { date: 'Jun 3', success: 3620, failed: 200 },
  { date: 'Jun 4', success: 3890, failed: 210 },
  { date: 'Jun 5', success: 3440, failed: 210 },
  { date: 'Jun 6', success: 4200, failed: 230 },
  { date: 'Jun 7', success: 3760, failed: 220 },
  { date: 'Jun 8', success: 4030, failed: 220 },
  { date: 'Jun 9', success: 4510, failed: 247 },
];

export const fixDuration = [
  { fix: 'Windows Update', duration: 8.3 },
  { fix: 'AV Scan', duration: 5.2 },
  { fix: 'Disk Cleanup', duration: 4.1 },
  { fix: 'SSO Fix', duration: 3.2 },
  { fix: 'Print Spooler', duration: 2.7 },
  { fix: 'Teams Fix', duration: 2.3 },
  { fix: 'Sofia Fix', duration: 2.2 },
  { fix: 'OneDrive Sync', duration: 2.0 },
  { fix: 'Outlook Fix', duration: 1.8 },
  { fix: 'VPN Reset', duration: 1.5 },
];

// Drill-down rows for the side panel
export const fixDrilldown = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  hostname: `WIN-CORP-${String(1000 + i * 37).padStart(5, '0')}`,
  user: ['a.johnson', 'p.sharma', 'm.chen', 's.martinez', 'j.okafor', 'e.williams'][i % 6],
  timestamp: `2026-06-09 ${String(8 + Math.floor(i / 3)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')} UTC`,
  engineer: ['Alex Johnson', 'Priya Sharma', 'Marcus Chen', 'Sofia Martinez', 'James Okafor', 'Emma Williams'][i % 6],
  status: i % 7 === 0 ? 'Failed' : i % 11 === 0 ? 'Pending' : 'Success',
  duration: `${(1.2 + (i % 8) * 0.3).toFixed(1)} min`,
  logSummary: i % 7 === 0
    ? 'ERROR: Registry key locked. Fix aborted after 3 retries.'
    : 'Fix applied successfully. Service restarted. Health check passed.',
}));

// ── Security Compliance ───────────────────────
export const securityKpi = {
  overallCompliance: 94.3,
  totalCerts: 4_820,
  validCerts: 4_230,
  expiringCerts30: 380,
  expiredCerts: 210,
  renewalSuccessRate: 96.8,
  avCompliance: 97.2,
  diskEncryptionCompliance: 92.5,
  patchCompliance: 89.7,
  devicesAtRisk: 187,
};

export const certHealthPie = [
  { name: 'Valid', value: 4230, color: '#22c55e' },
  { name: 'Expiring Soon', value: 380, color: '#f59e0b' },
  { name: 'Expired', value: 210, color: '#ef4444' },
];

export const certExpiryBar = [
  { range: '7 Days', count: 65 },
  { range: '30 Days', count: 315 },
  { range: '60 Days', count: 480 },
  { range: '90 Days', count: 720 },
];

export const complianceDonut = [
  { name: 'Compliant', value: 29610, color: '#0ea5e9' },
  { name: 'Non-Compliant', value: 1810, color: '#f43f5e' },
];

export const securityComplianceTrend = complianceTrend;

export const securityAdditional = {
  renewedToday: 42,
  failedRenewals: 3,
  successfulRenewals: 39,
  avgRenewalTime: '4.7 min',
  devicesImpacted: 187,
};

// ── System Information / Device Inventory ─────
const osOptions = ['Windows 11 Pro', 'Windows 10 Pro', 'Windows 11 Enterprise', 'Windows 10 LTSC'];
const deviceTypes = ['Laptop', 'Desktop', 'Workstation', 'Virtual Machine'];
const statusOptions = ['Healthy', 'Warning', 'Critical', 'Offline'];

export const deviceInventory = Array.from({ length: 500 }, (_, i) => ({
  sno: i + 1,
  hostname: `WIN-CORP-${String(10000 + i).padStart(6, '0')}`,
  username: `user.${String(1000 + i).padStart(5, '0')}@corp.com`,
  deviceType: deviceTypes[i % 4],
  os: osOptions[i % 4],
  ram: `${[8, 16, 32, 64][i % 4]} GB`,
  diskSpace: `${[256, 512, 1024, 2048][i % 4]} GB`,
  cpuUsage: `${10 + (i * 17) % 80}%`,
  memoryUsage: `${20 + (i * 13) % 70}%`,
  lastCheckIn: `2026-06-09 ${String(6 + (i % 10)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')} UTC`,
  status: statusOptions[i % 10 === 0 ? 2 : i % 7 === 0 ? 1 : i % 20 === 0 ? 3 : 0],
}));

// Device detail panel
export const getDeviceDetail = (hostname: string) => ({
  hostname,
  manufacturer: 'Dell Technologies',
  model: 'Latitude 5540',
  serialNumber: `SN-${hostname.slice(-6)}`,
  bios: 'Dell BIOS v1.14.0',
  cpu: 'Intel Core i7-1365U @ 1.80GHz',
  totalRam: '16 GB DDR5',
  totalDisk: '512 GB NVMe SSD',
  gpu: 'Intel Iris Xe Graphics',
  location: 'HQ - Floor 4',
  domain: 'CORP.HEXAASSIST.COM',
  installedApps: [
    { name: 'Microsoft Teams', version: '24.5.1' },
    { name: 'Microsoft Office 365', version: '16.0.17628' },
    { name: 'Google Chrome', version: '125.0.6422' },
    { name: 'Cisco AnyConnect', version: '4.10.07061' },
    { name: 'CrowdStrike Falcon', version: '7.18.17106' },
  ],
  recentFixes: [
    { date: '2026-06-09', fix: 'Teams Fix', status: 'Success', duration: '2.1 min' },
    { date: '2026-06-07', fix: 'Windows Update', status: 'Success', duration: '8.3 min' },
    { date: '2026-06-05', fix: 'Outlook Fix', status: 'Failed', duration: '1.8 min' },
  ],
  complianceStatus: 'Compliant',
  lastActivity: '2026-06-09 14:52 UTC',
});

// ── Script & Log Management ───────────────────
// Removed – admin-only features no longer used
