// ─────────────────────────────────────────────────────────────────
// Security & Compliance – Device Posture Data
// Replace with Azure Blob Storage API fetch in production
// ─────────────────────────────────────────────────────────────────

export type CortexStatus       = 'Running'   | 'Not Running';
export type GPStatus           = 'Connected' | 'Not Connected';
export type BitLockerStatus    = 'Compliant' | 'Non-Compliant';
export type SecureBootStatus   = 'Enabled'   | 'Disabled';
export type NetworkMode        = 'Online'    | 'Offline';

export interface DeviceSecurityRecord {
  id:               string;
  timestamp:        string;
  deviceName:       string;
  serialNumber:     string;
  loggedUser:       string;
  networkMode:      NetworkMode;
  appVersion:       string;
  cortexStatus:     CortexStatus;
  gpStatus:         GPStatus;
  bitLockerStatus:  BitLockerStatus;
  secureBootStatus: SecureBootStatus;
}

const users = [
  'john.smith',    'priya.sharma',  'marcus.chen',   'sofia.martinez',
  'james.okafor',  'emma.williams', 'rahul.gupta',   'lisa.park',
  'david.brown',   'anjali.nair',   'carlos.diaz',   'fatima.malik',
  'lucas.white',   'meera.iyer',    'sam.taylor',     'nina.petrov',
  'kai.tanaka',    'aisha.khan',    'ravi.kumar',     'elena.russo',
  'tom.harris',    'yuki.sato',     'ben.clark',      'sara.ali',
  'omar.hassan',   'amy.chen',      'jake.wilson',    'nadia.berg',
  'leo.costa',     'zara.malik',
];

export const securityRecords: DeviceSecurityRecord[] = Array.from({ length: 30 }, (_, i) => {
  const cortexRunning  = i % 7  !== 0;
  const gpConnected    = i % 9  !== 0;
  const bitLockerOk    = i % 11 !== 0;

  return {
    id:              `sec-${i + 1}`,
    timestamp:       `2026-06-09 ${String(6 + Math.floor(i / 3)).padStart(2,'0')}:${String((i * 11) % 60).padStart(2,'0')}:${String((i * 7) % 60).padStart(2,'0')} UTC`,
    deviceName:      `WIN-CORP-${String(10000 + i * 43).padStart(6,'0')}`,
    serialNumber:    `SN-HEX-${String(300000 + i * 19).padStart(7,'0')}`,
    loggedUser:      users[i % users.length],
    networkMode:     i % 6 === 0 ? 'Offline' : 'Online',
    appVersion:      `HEXA-ASSIST v${2 + (i % 2)}.${i % 10}.${i % 5}`,
    cortexStatus:    cortexRunning  ? 'Running'     : 'Not Running',
    gpStatus:        gpConnected    ? 'Connected'   : 'Not Connected',
    bitLockerStatus: bitLockerOk    ? 'Compliant'   : 'Non-Compliant',
    secureBootStatus: (i % 8 !== 0) ? 'Enabled'    : 'Disabled',
  };
});

// ── Summary helpers ────────────────────────────────────────────────
export function getSecuritySummary(records: DeviceSecurityRecord[]) {
  const total            = records.length;
  const cortexRunning    = records.filter(r => r.cortexStatus    === 'Running').length;
  const gpConnected      = records.filter(r => r.gpStatus        === 'Connected').length;
  const bitLockerOk      = records.filter(r => r.bitLockerStatus === 'Compliant').length;
  const online           = records.filter(r => r.networkMode     === 'Online').length;
  const secureBootOk = records.filter(r => r.secureBootStatus === 'Enabled').length;
  const fullyCompliant   = records.filter(r =>
    r.cortexStatus    === 'Running'   &&
    r.gpStatus        === 'Connected' &&
    r.bitLockerStatus === 'Compliant' &&
    r.secureBootStatus === 'Enabled'
  ).length;

  return { total, cortexRunning, gpConnected, bitLockerOk, secureBootOk, online, fullyCompliant };
}
