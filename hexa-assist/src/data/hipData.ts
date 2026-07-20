// ─────────────────────────────────────────────────────────────────
// HIP / Compliance Check Data
// Replace with Azure Blob Storage API fetch in production
// ─────────────────────────────────────────────────────────────────

export interface ComplianceCheck {
  id: string;
  name: string;
  status: 'Pass' | 'Fail' | 'Warning';
  detail: string;
  category: 'Protection' | 'Encryption' | 'OS' | 'Certificate' | 'Management' | 'Identity';
}

export interface DeviceHIPRecord {
  id: string;
  timestamp: string;
  deviceName: string;
  serialNumber: string;
  loggedInUser: string;
  networkMode: 'Online' | 'Offline';
  appVersion: string;
  checks: ComplianceCheck[];
}

// Generate realistic HIP records for 20 devices
const buildChecks = (seed: number): ComplianceCheck[] => {
  const allPass = seed % 5 !== 0;
  const certFail = seed % 7 === 0;
  const osFail = seed % 11 === 0;
  const bitFail = seed % 13 === 0;

  return [
    {
      id: 'cortex-xdr',
      name: 'Cortex XDR Status',
      status: allPass ? 'Pass' : 'Fail',
      detail: allPass ? 'Endpoint protection active' : 'Endpoint protection inactive',
      category: 'Protection',
    },
    {
      id: 'bitlocker',
      name: 'BitLocker Encryption',
      status: bitFail ? 'Fail' : 'Pass',
      detail: bitFail ? 'Drive not encrypted' : 'Fully encrypted (AES 256-bit)',
      category: 'Encryption',
    },
    {
      id: 'windows-os',
      name: 'Windows OS Version',
      status: osFail ? 'Fail' : 'Pass',
      detail: osFail
        ? 'OS outdated – Build 19045.2965 (required: 22631+)'
        : 'OS up to date – Windows 11 Build 22631.3447',
      category: 'OS',
    },
    {
      id: 'hexa-cert',
      name: 'Hexaware Certificate',
      status: certFail ? 'Fail' : 'Pass',
      detail: certFail
        ? 'HexaCA root certificate invalid or expired'
        : 'HexaCA root certificate valid (expires 2027-01-15)',
      category: 'Certificate',
    },
    {
      id: 'device-mgmt',
      name: 'Device Management',
      status: 'Pass',
      detail: 'Managed by Microsoft Intune (MDM enrolled)',
      category: 'Management',
    },
    {
      id: 'domain',
      name: 'Domain Membership',
      status: 'Pass',
      detail: 'Joined to Hexaware Technologies domain (HEXAWARE.LOCAL)',
      category: 'Identity',
    },
    {
      id: 'cortex-update',
      name: 'Cortex XDR Version',
      status: allPass ? 'Pass' : 'Warning',
      detail: allPass
        ? 'Cortex XDR agent v7.18 – up to date'
        : 'Cortex XDR agent v7.15 – update recommended',
      category: 'Protection',
    },
  ];
};

const users = [
  'john.smith', 'priya.sharma', 'marcus.chen', 'sofia.martinez',
  'james.okafor', 'emma.williams', 'rahul.gupta', 'lisa.park',
  'david.brown', 'anjali.nair', 'carlos.diaz', 'fatima.malik',
  'lucas.white', 'meera.iyer', 'sam.taylor', 'nina.petrov',
  'kai.tanaka', 'aisha.khan', 'ravi.kumar', 'elena.russo',
];

export const hipRecords: DeviceHIPRecord[] = Array.from({ length: 20 }, (_, i) => {
  const checks = buildChecks(i);
  return {
    id: `hip-${i + 1}`,
    timestamp: `2026-06-09 ${String(8 + (i % 10)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')} UTC`,
    deviceName: `WIN-CORP-${String(10000 + i * 31).padStart(6, '0')}`,
    serialNumber: `SN-HEX-${String(200000 + i * 17).padStart(7, '0')}`,
    loggedInUser: users[i],
    networkMode: i % 6 === 0 ? 'Offline' : 'Online',
    appVersion: `HEXA-ASSIST v${2 + (i % 2)}.${i % 10}.${i % 5}`,
    checks,
  };
});

export function getOverallResult(checks: ComplianceCheck[]): 'COMPLIANT' | 'NON-COMPLIANT' {
  return checks.every(c => c.status !== 'Fail') ? 'COMPLIANT' : 'NON-COMPLIANT';
}

export function countChecks(checks: ComplianceCheck[]) {
  return {
    passed: checks.filter(c => c.status === 'Pass').length,
    failed: checks.filter(c => c.status === 'Fail').length,
    warnings: checks.filter(c => c.status === 'Warning').length,
    total: checks.length,
  };
}
