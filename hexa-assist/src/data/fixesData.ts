// ─────────────────────────────────────────────────────────────────
// Fix / Action Events Data
// Replace with Azure Blob Storage API fetch in production
// ─────────────────────────────────────────────────────────────────

export interface FixEvent {
  id: string;
  timestamp: string;
  deviceName: string;
  serialNumber: string;
  loggedInUser: string;
  networkMode: 'Online' | 'Offline';
  action: 'fix_initiated' | 'fix_completed' | 'fix_failed';
  fixName: string;
  status: 'Success' | 'Failed' | 'In Progress';
  details: string;
  duration: string;
}

const fixScenarios = [
  {
    fixName: 'Teams Fix',
    details: 'User initiated fix – Teams showing incorrect status, old messages, outdated version',
  },
  {
    fixName: 'Teams Fix',
    details: 'User initiated fix – Teams stuck on loading screen after Windows update',
  },
  {
    fixName: 'Outlook Fix',
    details: 'User initiated fix – Outlook not syncing emails, OST file corruption detected',
  },
  {
    fixName: 'SSO Fix',
    details: 'User initiated fix – Single sign-on failing, Azure AD token cache stale',
  },
  {
    fixName: 'VPN Reset',
    details: 'User initiated fix – Cisco AnyConnect VPN dropping connection intermittently',
  },
  {
    fixName: 'OneDrive Sync',
    details: 'User initiated fix – OneDrive not syncing, conflict files accumulating',
  },
  {
    fixName: 'Teams Fix',
    details: 'User initiated fix – Teams calls dropping, audio device not recognised',
  },
  {
    fixName: 'Disk Cleanup',
    details: 'User initiated fix – Low disk space warning, temp files exceeding 15 GB',
  },
  {
    fixName: 'Outlook Fix',
    details: 'User initiated fix – Outlook calendar not showing meeting invites from external users',
  },
  {
    fixName: 'AV Scan',
    details: 'User initiated fix – CrowdStrike Falcon reporting outdated threat definitions',
  },
];

const users = [
  'john.smith', 'priya.sharma', 'marcus.chen', 'sofia.martinez',
  'james.okafor', 'emma.williams', 'rahul.gupta', 'lisa.park',
  'david.brown', 'anjali.nair', 'carlos.diaz', 'fatima.malik',
  'lucas.white', 'meera.iyer', 'sam.taylor', 'nina.petrov',
];

const statuses: FixEvent['status'][] = ['Success', 'Success', 'Success', 'Failed', 'In Progress', 'Success', 'Success'];

export const fixEvents: FixEvent[] = Array.from({ length: 50 }, (_, i) => {
  const scenario = fixScenarios[i % fixScenarios.length];
  const status = statuses[i % statuses.length];
  return {
    id: `fix-evt-${i + 1}`,
    timestamp: `2026-06-09 ${String(6 + Math.floor(i / 4)).padStart(2, '0')}:${String((i * 9) % 60).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')} UTC`,
    deviceName: `WIN-CORP-${String(10000 + i * 23).padStart(6, '0')}`,
    serialNumber: `SN-HEX-${String(200000 + i * 11).padStart(7, '0')}`,
    loggedInUser: users[i % users.length],
    networkMode: i % 8 === 0 ? 'Offline' : 'Online',
    action: 'fix_initiated',
    fixName: scenario.fixName,
    status,
    details: scenario.details,
    duration: status === 'In Progress'
      ? '—'
      : `${(1.0 + (i % 8) * 0.4).toFixed(1)} min`,
  };
});
