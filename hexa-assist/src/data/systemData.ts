// ─────────────────────────────────────────────────────────────────
// System Information Data
// Replace with Azure Blob Storage API fetch in production
// ─────────────────────────────────────────────────────────────────

export interface SystemDevice {
  sno:              number;
  hostname:         string;
  username:         string;
  deviceType:       string;
  os:               string;
  diskTotal:        string;
  diskUsed:         string;
  ramTotal:         string;
  ramUsed:          string;
  patchCompliance:  'Compliant' | 'Non-Compliant';
  lastReboot:       string;
  domain:           string;
  managedByIntune:  'Yes' | 'No';
  isLocalAdmin:     'Yes' | 'No';
  lastCheckIn:      string;
  status:           'Healthy' | 'Warning' | 'Critical' | 'Offline';
}

// OS options updated to Windows 11 25H2
const osOptions = [
  'Windows 11 25H2 Pro',
  'Windows 11 25H2 Enterprise',
  'Windows 11 25H2 Pro',
  'Windows 11 25H2 Education',
];

const deviceTypes  = ['Laptop', 'Desktop', 'Workstation', 'Virtual Machine'];
const statusOptions: SystemDevice['status'][] = ['Healthy', 'Warning', 'Critical', 'Offline'];
const diskTotals   = ['256 GB', '512 GB', '1 TB', '2 TB'];
const ramTotals    = ['8 GB', '16 GB', '32 GB', '64 GB'];

// Spread check-ins across the last 6 months for meaningful Patch Status pie data
const checkInMonths = [
  '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01',
];

export const systemDevices: SystemDevice[] = Array.from({ length: 500 }, (_, i) => {
  const ramTotalGB  = [8, 16, 32, 64][i % 4];
  const ramUsedPct  = 20 + (i * 13) % 70;
  const diskTotalGB = [256, 512, 1024, 2048][i % 4];
  const diskUsedPct = 15 + (i * 17) % 75;

  // Spread devices across 6 months (~83 devices per month)
  const monthIdx = Math.floor(i / Math.ceil(500 / checkInMonths.length)) % checkInMonths.length;
  const month    = checkInMonths[monthIdx];
  const day      = String(1 + (i % 28)).padStart(2, '0');
  const hour     = String(6 + (i % 10)).padStart(2, '0');
  const min      = String((i * 7) % 60).padStart(2, '0');

  return {
    sno:             i + 1,
    hostname:        `WIN-CORP-${String(10000 + i).padStart(6, '0')}`,
    username:        `user.${String(1000 + i).padStart(5, '0')}@corp.hexaassist.com`,
    deviceType:      deviceTypes[i % 4],
    os:              osOptions[i % 4],
    diskTotal:       diskTotals[i % 4],
    diskUsed:        `${Math.round(diskTotalGB * diskUsedPct / 100)} GB`,
    ramTotal:        ramTotals[i % 4],
    ramUsed:         `${Math.round(ramTotalGB  * ramUsedPct  / 100)} GB`,
    patchCompliance: i % 9 === 0 ? 'Non-Compliant' : 'Compliant',
    lastReboot:      `2026-06-${String(1 + (i % 9)).padStart(2,'0')} ${String(2 + (i % 8)).padStart(2,'0')}:${String((i*7)%60).padStart(2,'0')} UTC`,
    domain:          'HEXAWARE.LOCAL',
    managedByIntune: i % 12 === 0 ? 'No' : 'Yes',
    isLocalAdmin:    i % 5 === 0 ? 'Yes' : 'No',
    lastCheckIn:     `${month}-${day} ${hour}:${min} UTC`,
    status:          statusOptions[i % 10 === 0 ? 2 : i % 7 === 0 ? 1 : i % 20 === 0 ? 3 : 0],
  };
});

export const getSystemDeviceDetail = (hostname: string) => {
  const base = systemDevices.find(d => d.hostname === hostname) ?? systemDevices[0];
  return {
    ...base,
    manufacturer: 'Dell Technologies',
    model:        'Latitude 5540',
    serialNumber: `SN-${hostname.slice(-6)}`,
    bios:         'Dell BIOS v1.14.0',
    cpu:          'Intel Core i7-1365U @ 1.80GHz',
    gpu:          'Intel Iris Xe Graphics',
    location:     'HQ - Floor 4',
    installedApps: [
      { name: 'Microsoft Teams',      version: '24.5.1' },
      { name: 'Microsoft Office 365', version: '16.0.17628' },
      { name: 'Google Chrome',        version: '125.0.6422' },
      { name: 'Cisco AnyConnect',     version: '4.10.07061' },
      { name: 'CrowdStrike Falcon',   version: '7.18.17106' },
    ],
    recentFixes: [
      { date: '2026-06-09', fix: 'Teams Fix',      status: 'Success', duration: '2.1 min' },
      { date: '2026-06-07', fix: 'Windows Update', status: 'Success', duration: '8.3 min' },
      { date: '2026-06-05', fix: 'Outlook Fix',    status: 'Failed',  duration: '1.8 min' },
    ],
    lastActivity: '2026-06-09 14:52 UTC',
  };
};
