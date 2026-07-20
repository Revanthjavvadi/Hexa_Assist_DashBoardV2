'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Sync Job  —  Azure Blob Storage  →  Azure Cosmos DB
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ONE-WAY ONLY: Blob → Cosmos. Cosmos is NEVER written back to Blob Storage.
 * The UI reads EXCLUSIVELY from Cosmos DB via the API controllers.
 *
 * Three independent sync cycles (all Blob → Cosmos only):
 *
 *   1. Dashboard sync  (every 15 min)
 *      overview, fixes, hip_checks, security_compliance, system_info, scripts
 *      Reads actual SUCCESS/FAILED status from Blob fix records.
 *
 *   2. PIN sync  (every 5 min)
 *      pins/{device}.json  →  Cosmos pins container
 *      JWT pin_token decoded on backend; only rawPin (4-digit) stored in Cosmos.
 *
 *   3. PIN Audit sync  (every 15 min — same cadence as dashboard)
 *      {timestamp}_pin_attempt_{SUCCESS|FAILED}_{uuid}.json
 *      →  Cosmos 'audit' container
 *
 * Blob structure (real device agent uploads):
 *   Log_Collection/{device_name}/{logged_user}/fixes/{timestamp}.json
 *   Log_Collection/{device_name}/{logged_user}/hip_checks/{timestamp}.json
 *   Log_Collection/{device_name}/{logged_user}/security_compliance/{timestamp}.json
 *   Log_Collection/{device_name}/{logged_user}/system_info/{timestamp}.json
 *   pins/{device_name}.json
 *   JSON/scripts.json
 */

const blob   = require('./blobService');
const cosmos = require('./cosmosService');
const logger = require('../utils/logger');
const config = require('../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format an ISO timestamp string to IST (UTC+5:30) for display */
function toIST(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }) + ' IST';
  } catch { return iso; }
}

function normFixStatus(raw) {
  const s = (raw || '').toUpperCase();
  if (s === 'SUCCESS' || s === 'PASS') return 'Success';
  if (s === 'FAILED'  || s === 'FAIL') return 'Failed';
  return 'In Progress';
}

function normHipStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s === 'pass') return 'Pass';
  if (s === 'fail') return 'Fail';
  return 'Warning';
}

function guessCat(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('cortex') || n.includes('crowdstrike')) return 'Protection';
  if (n.includes('bitlocker') || n.includes('encrypt'))  return 'Encryption';
  if (n.includes('windows') || n.includes('os'))         return 'OS';
  if (n.includes('cert'))                                 return 'Certificate';
  if (n.includes('intune') || n.includes('management'))  return 'Management';
  if (n.includes('domain') || n.includes('identity'))    return 'Identity';
  return 'OS';
}

function normChecks(checks) {
  return (checks || []).map((c, i) => ({
    id:       c.id || `check-${i + 1}`,
    category: c.category || guessCat(c.name),
    name:     c.name   || '—',
    status:   normHipStatus(c.status),
    detail:   c.detail || '—',
  }));
}

function buildOsString(s) {
  if (s.os && !s.windows_edition) return s.os;
  const ed = s.windows_edition || '';
  const v  = s.os_version || '';
  if (ed && v) return `Windows ${ed} (${v})`;
  if (ed) return `Windows ${ed}`;
  if (v)  return v;
  return '—';
}

function deriveDeviceStatus(s) {
  const ram  = parseFloat(s.ram_percent  || s.ram_used_percent  || 0);
  const disk = parseFloat(s.disk_percent || s.disk_used_percent || 0);
  const bootRaw = (s.secure_boot || s.secureboot || s.secure_boot_status || '').toLowerCase().trim();
  const bootEnabled = ['enabled', 'on', 'true', '1', 'yes'].includes(bootRaw);
  const bootKnown   = bootRaw !== '';
  if (ram > 90 || disk > 90) return 'Critical';
  if (ram > 75 || disk > 75 || (bootKnown && !bootEnabled)) return 'Warning';
  return 'Healthy';
}

function filterBySegment(allBlobs, folderSegment) {
  return allBlobs.filter(b =>
    b.name.endsWith('.json') &&
    b.name.includes(`/${folderSegment}/`)
  );
}

async function readBlobs(blobList, force) {
  const BATCH = 20;
  const results = [];
  for (let i = 0; i < blobList.length; i += BATCH) {
    const parsed = await Promise.all(
      blobList.slice(i, i + BATCH).map(b => blob.readJson(b.name, force))
    );
    results.push(...parsed.filter(Boolean));
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transforms
// ─────────────────────────────────────────────────────────────────────────────

function transformFixes(rawList, sysRaw) {
  // Build serial number lookup from system_info: device_name → serial_number
  const sysSerial = {};
  for (const s of (sysRaw || [])) {
    if (s.device_name && s.serial_number && s.serial_number !== '—') {
      sysSerial[s.device_name] = s.serial_number;
    }
  }

  const seen = new Set();
  const unique = rawList.filter(f => {
    const key = `${f.device_name}|${f.timestamp}|${f.fix_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Sort by raw ISO timestamp BEFORE converting to IST (IST strings don't sort correctly)
  unique.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return unique.map((f, idx) => {
    let duration = '—';
    if (f.duration_seconds != null) {
      duration = `${Number(f.duration_seconds).toFixed(1)}s`;
    } else if (f.duration) {
      duration = String(f.duration);
    }
    // Use serial from fix blob; fall back to system_info lookup by device name
    const serialNumber = (f.serial_number && f.serial_number !== '—' && f.serial_number !== 'Unknown')
      ? f.serial_number
      : (sysSerial[f.device_name] || '—');
    return {
      id:           `fix-${idx + 1}`,
      rawTimestamp: f.timestamp || null,   // ISO string kept for reliable sorting
      timestamp:    f.timestamp ? toIST(f.timestamp) : '—',
      deviceName:   f.device_name   || '—',
      serialNumber,
      loggedInUser: f.logged_user   || f.username || '—',
      networkMode:  (f.network_mode || '').toLowerCase() === 'offline' ? 'Offline' : 'Online',
      action:       f.action || 'fix_initiated',
      fixName:      f.fix_name  || f.script_name || '—',
      status:       normFixStatus(f.status || f.fix_status || f.result),
      details:      f.fix_category || f.fix_name || f.details || '—',
      duration,
    };
  });
}

function transformHip(rawList, sysRaw) {
  // Build lookup: device_name → deviceType and serial_number from system_info
  const sysDeviceType = {};
  const sysSerial = {};
  for (const s of (sysRaw || [])) {
    if (s.device_name) {
      sysDeviceType[s.device_name] = (s.chassis_type || s.device_type || '').trim();
      if (s.serial_number && s.serial_number !== '—') {
        sysSerial[s.device_name] = s.serial_number;
      }
    }
  }

  const latest = {};
  for (const h of rawList) {
    const key = h.device_name || '—';
    if (!latest[key] || h.timestamp > latest[key].timestamp) latest[key] = h;
  }
  return Object.values(latest).map((h, idx) => {
    const serialNumber = (h.serial_number && h.serial_number !== '—' && h.serial_number !== 'Unknown')
      ? h.serial_number
      : (sysSerial[h.device_name] || '—');
    return {
      id:           `hip-${idx + 1}`,
      rawTimestamp: h.timestamp || '',          // ISO string for reliable sort
      timestamp:    h.timestamp ? toIST(h.timestamp) : '—',
      deviceName:   h.device_name   || '—',
      deviceType:   sysDeviceType[h.device_name] || h.chassis_type || h.device_type || '',
      serialNumber,
      loggedInUser: h.logged_user   || h.username || '—',
      networkMode:  (h.network_mode || '').toLowerCase() === 'offline' ? 'Offline' : 'Online',
      appVersion:   h.app_version   || h.agent_version || '—',
      checks:       normChecks(h.checks || h.hip_checks),
    };
  // Sort newest-first by raw ISO timestamp
  }).sort((a, b) => (b.rawTimestamp || '').localeCompare(a.rawTimestamp || ''));
}

function transformSecurity(rawList, sysRaw) {
  // Build a lookup: device_name → latest system_info record
  // Used to fill in fields the security_compliance blob doesn't include (e.g. secure_boot).
  const sysLatest = {};
  for (const s of (sysRaw || [])) {
    const dev = s.device_name;
    if (dev && (!sysLatest[dev] || s.timestamp > sysLatest[dev].timestamp)) {
      sysLatest[dev] = s;
    }
  }

  const latest = {};
  for (const s of rawList) {
    const key = s.device_name || '—';
    if (!latest[key] || s.timestamp > latest[key].timestamp) latest[key] = s;
  }
  return Object.values(latest).map((s, idx) => {
    // Secure Boot: prefer security_compliance blob fields, fall back to system_info blob.
    // The security_compliance blob does not include secure_boot — system_info does.
    const sysRecord = sysLatest[s.device_name] || {};
    const rawVal = (
      s.secure_boot_status   ??
      s.secure_boot          ??
      s.secureboot           ??
      s.SecureBoot           ??
      s.secureBoot           ??
      s.is_secure_boot       ??
      s.secure_boot_enabled  ??
      // Fallback to system_info for the same device
      sysRecord.secure_boot  ??
      sysRecord.secureboot   ??
      sysRecord.secure_boot_status ??
      ''
    );
    const secureBootEnabled = ['enabled', 'on', 'true', '1', 'yes'].includes(
      String(rawVal).toLowerCase().trim()
    );

    // Determine device type from system_info lookup (sysRaw joined on device_name).
    // Desktop devices: BitLocker is Not Applicable — they don't use drive encryption.
    const deviceType  = (sysRecord.chassis_type || sysRecord.device_type || '').trim();
    const isDesktop   = deviceType.toLowerCase() === 'desktop';

    const bitLockerRaw = (s.bitlocker_status || s.bitlocker || '').toLowerCase();
    const bitLockerStatus = isDesktop
      ? 'N/A'   // BitLocker not applicable for desktops
      : ['compliant', 'encrypted', 'enabled'].includes(bitLockerRaw)
          ? 'Compliant' : 'Non-Compliant';

    return {
      id:               `sec-${idx + 1}`,
      rawTimestamp:     s.timestamp || '',          // ISO string — kept for reliable sort
      timestamp:        s.timestamp ? toIST(s.timestamp) : '—',
      deviceName:       s.device_name   || '—',
      deviceType:       deviceType      || '—',
      serialNumber:     (s.serial_number && s.serial_number !== '—' && s.serial_number !== 'Unknown')
                          ? s.serial_number
                          : (sysRecord.serial_number || '—'),
      loggedUser:       s.logged_user   || s.username || '—',
      networkMode:      (s.network_mode || '').toLowerCase() === 'offline' ? 'Offline' : 'Online',
      appVersion:       s.app_version   || s.agent_version || '—',
      cortexStatus:     ['running', 'active'].includes((s.cortex_status || s.cortex_xdr_status || '').toLowerCase())
                          ? 'Running' : 'Not Running',
      gpStatus:         ['connected', 'active'].includes((s.globalprotect_status || s.gp_status || '').toLowerCase())
                          ? 'Connected' : 'Not Connected',
      bitLockerStatus,
      secureBootStatus: secureBootEnabled ? 'Enabled' : 'Disabled',
    };
  // Sort newest-first by raw ISO timestamp so the table is in consistent date order
  }).sort((a, b) => (b.rawTimestamp || '').localeCompare(a.rawTimestamp || ''));
}

function transformSystem(rawList) {
  const latest = {};
  for (const s of rawList) {
    const dev = s.device_name;
    if (!dev) continue;
    if (!latest[dev] || s.timestamp > latest[dev].timestamp) latest[dev] = s;
  }
  return Object.values(latest).map((s, idx) => ({
    id:              `sys-${idx + 1}`,
    sno:             idx + 1,
    hostname:        s.device_name         || '—',
    username:        s.logged_user         || s.username || '—',
    deviceType:      s.chassis_type        || s.device_type || '—',
    os:              buildOsString(s),
    diskTotal:       s.disk_total          ? String(s.disk_total) : `${parseFloat(s.disk_total_gb || 0).toFixed(0)} GB`,
    diskUsed:        s.disk_used           ? String(s.disk_used)  : `${parseFloat(s.disk_used_gb  || 0).toFixed(0)} GB`,
    diskType:        s.disk_type           || '—',
    ramTotal:        s.ram_total           ? String(s.ram_total)  : `${parseFloat(s.ram_total_gb  || 0).toFixed(0)} GB`,
    ramUsed:         s.ram_used            ? String(s.ram_used)   : `${parseFloat(s.ram_used_gb   || 0).toFixed(0)} GB`,
    patchCompliance: (s.patch_compliance && !s.patch_compliance.toLowerCase().includes('fail'))
                       ? 'Compliant' : 'Non-Compliant',
    patchLabel:      s.patch_compliance    || '—',
    lastReboot:      s.last_reboot         || '—',
    domain:          s.windows_domain      || s.domain || '—',
    managedByIntune: s.managed_by_intune   ||
                     ((s.domain || '').toLowerCase().includes('intune') ? 'Yes' : 'No'),
    isLocalAdmin:    (s.is_local_admin === true || s.is_local_admin === 'Yes') ? 'Yes' : 'No',
    lastCheckIn:     s.timestamp ? toIST(s.timestamp) : '—',
    status:          deriveDeviceStatus(s),
    manufacturer:    s.device_manufacturer || s.manufacturer || '—',
    model:           s.device_model        || s.model        || '—',
    serialNumber:    s.serial_number       || '—',
    bios:            s.bios                || '—',
    wifiSsid:        s.wifi_ssid           || '—',
    wifiSignal:      s.wifi_signal_percent ? `${s.wifi_signal_percent}%` : '—',
    secureBoot:      ['enabled', 'on', 'true', '1', 'yes'].includes((s.secure_boot || s.secureboot || s.secure_boot_status || '').toLowerCase().trim())
                       ? 'Enabled' : (s.secure_boot || s.secureboot || s.secure_boot_status) ? 'Disabled' : '—',
    uptime:          s.uptime_days != null ? `${s.uptime_days} day${s.uptime_days !== 1 ? 's' : ''}` : '—',
    lastActivity:    s.timestamp ? toIST(s.timestamp) : '—',
  })).sort((a, b) => a.hostname.localeCompare(b.hostname));
}

function transformOverview(fixRaw, secRaw, hipRaw, sysRaw) {
  const today = new Date().toISOString().slice(0, 10);
  const totalFixesToday = fixRaw.filter(f => (f.timestamp || '').startsWith(today)).length;

  // Use system_info unique devices as the primary count (matches SystemInfo page)
  // Fall back to union of all sources if sysRaw is empty
  const sysDeviceSet = new Set(sysRaw.map(s => s.device_name).filter(Boolean));
  const allDeviceSet  = new Set([
    ...fixRaw.map(f => f.device_name),
    ...hipRaw.map(h => h.device_name),
    ...secRaw.map(s => s.device_name),
  ].filter(Boolean));
  const totalDevices = sysDeviceSet.size > 0 ? sysDeviceSet.size : (allDeviceSet.size || 1);

  // Device type lookup — needed for desktop BitLocker exemption in both HIP and security calculations
  const sysDeviceType = {};
  for (const s of sysRaw) {
    if (s.device_name) sysDeviceType[s.device_name] = (s.chassis_type || s.device_type || '').trim();
  }

  const secCompliantCount = secRaw.filter(s => {
    const isDesktop   = (sysDeviceType[s.device_name] || '').toLowerCase() === 'desktop';
    const cortexOk    = ['running', 'active'].includes((s.cortex_status || '').toLowerCase());
    const bitlockerOk = ['compliant', 'encrypted'].includes((s.bitlocker_status || '').toLowerCase());
    // Desktops: BitLocker not required — only Cortex matters
    return isDesktop ? cortexOk : (bitlockerOk && cortexOk);
  }).length;
  const secPct = secRaw.length > 0
    ? Math.round((secCompliantCount / secRaw.length) * 1000) / 10 : 0;

  const atRiskSet = new Set(
    secRaw.filter(s => {
      const isDesktop   = (sysDeviceType[s.device_name] || '').toLowerCase() === 'desktop';
      const cortexOk    = ['running', 'active'].includes((s.cortex_status || '').toLowerCase());
      const bitlockerOk = ['compliant', 'encrypted'].includes((s.bitlocker_status || '').toLowerCase());
      return isDesktop ? !cortexOk : (!bitlockerOk || !cortexOk);
    }).map(s => s.device_name)
  );

  // Count SUCCESS/FAILED from actual Blob data
  let success = 0, failed = 0, pending = 0;
  for (const f of fixRaw) {
    const s = (f.status || f.fix_status || f.result || '').toUpperCase();
    if (s === 'SUCCESS' || s === 'PASS') success++;
    else if (s === 'FAILED' || s === 'FAIL') failed++;
    else pending++;
  }

  const dailyMap = {};
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(); dt.setDate(dt.getDate() - d);
    dailyMap[dt.toISOString().slice(0, 10)] = 0;
  }
  for (const f of fixRaw) {
    const day = (f.timestamp || '').slice(0, 10);
    if (day in dailyMap) dailyMap[day]++;
  }
  const dailyFixTrend = Object.entries(dailyMap).map(([date, fixes]) => ({
    date: new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    fixes,
  }));

  // Build device type lookup from system_info (for desktop BitLocker exemption)
  // (already declared above as sysDeviceType)

  const latestHip = {};
  for (const h of hipRaw) {
    const dev = h.device_name;
    if (dev && (!latestHip[dev] || h.timestamp > latestHip[dev].timestamp)) latestHip[dev] = h;
  }
  let healthy = 0, warning = 0, critical = 0;
  for (const h of Object.values(latestHip)) {
    const isDesktop = (sysDeviceType[h.device_name] || '').toLowerCase() === 'desktop';
    const checks    = h.checks || h.hip_checks || [];

    // For desktops: exclude BitLocker from compliance evaluation
    const relevantChecks = isDesktop
      ? checks.filter(c => !(c.name || '').toLowerCase().includes('bitlocker'))
      : checks;

    const failCount = relevantChecks.filter(c => (c.status || '').toLowerCase() === 'fail').length;

    if (failCount === 0) healthy++;
    else if (failCount >= 2) critical++;
    else warning++;
  }
  healthy += Math.max(0, totalDevices - Object.keys(latestHip).length);

  const monthMap = {};
  for (let m = 5; m >= 0; m--) {
    const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - m);
    monthMap[dt.toISOString().slice(0, 7)] = { compliant: 0, total: 0 };
  }
  for (const s of secRaw) {
    const mon = (s.timestamp || '').slice(0, 7);
    if (mon in monthMap) {
      monthMap[mon].total++;
      if (['compliant', 'encrypted'].includes((s.bitlocker_status || '').toLowerCase()) &&
          ['running', 'active'].includes((s.cortex_status || '').toLowerCase())) {
        monthMap[mon].compliant++;
      }
    }
  }
  const complianceTrend = Object.entries(monthMap).map(([key, v]) => ({
    date: new Date(key + '-02').toLocaleDateString('en-GB', { month: 'short' }),
    pct:  v.total > 0 ? Math.round((v.compliant / v.total) * 1000) / 10 : 0,
  }));

  const allTs = [...fixRaw.map(f => f.timestamp), ...hipRaw.map(h => h.timestamp)]
    .filter(Boolean).sort().reverse();
  const lastCheckIn = allTs[0] ? toIST(allTs[0]) : 'No data';

  return {
    id: 'latest',
    totalDevices, totalFixesToday, securityCompliance: secPct,
    devicesAtRisk: atRiskSet.size, lastCheckIn,
    fixStatusPie: [
      { name: 'Success', value: success, color: '#22c55e' },
      { name: 'Failed',  value: failed,  color: '#ef4444' },
      { name: 'Pending', value: pending, color: '#f59e0b' },
    ],
    dailyFixTrend,
    deviceHealthDist: [
      { status: 'Healthy',  count: healthy  },
      { status: 'Warning',  count: warning  },
      { status: 'Critical', count: critical },
    ],
    complianceTrend,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Cycle 1 — Dashboard data (every 15 min)
// overview, fixes, hip, security, system, scripts
// Reads actual SUCCESS/FAILED status from Blob fix records.
// ─────────────────────────────────────────────────────────────────────────────
let _isDashSyncing  = false;
let _dashSyncCount  = 0;
let _dashLastSyncAt = null;
let _dashLastDurationMs = null;
let _dashLastCounts = {};

async function runDashboardSync(force = false) {
  if (_isDashSyncing) {
    logger.warn('[SyncJob:Dashboard] Already in progress — skipping');
    return;
  }
  if (!cosmos.isAvailable()) {
    logger.warn('[SyncJob:Dashboard] Cosmos DB not configured — skipping');
    return;
  }
  _isDashSyncing = true;
  const startMs = Date.now();
  _dashSyncCount++;
  logger.info(`[SyncJob:Dashboard] Cycle #${_dashSyncCount} started`);

  try {
    const allBlobs = await blob.listBlobs('Log_Collection/', force);
   
    logger.info(`[SyncJob:Dashboard] Listed ${allBlobs.length} blobs`);

    const fixBlobs = filterBySegment(allBlobs, 'fixes');
    const hipBlobs = filterBySegment(allBlobs, 'hip_checks');
    const secBlobs = filterBySegment(allBlobs, 'security_compliance');
    const sysBlobs = filterBySegment(allBlobs, 'system_info');

    const [fixRaw, hipRaw, secRaw, sysRaw] = await Promise.all([
      readBlobs(fixBlobs, force),
      readBlobs(hipBlobs, force),
      readBlobs(secBlobs, force),
      readBlobs(sysBlobs, force),
    ]);

    logger.info('[SyncJob:Dashboard] Raw records', {
      fixes: fixRaw.length, hip: hipRaw.length,
      security: secRaw.length, system: sysRaw.length,
    });

    const fixDocs     = transformFixes(fixRaw, sysRaw);
    const hipDocs     = transformHip(hipRaw, sysRaw);
    const secDocs     = transformSecurity(secRaw, sysRaw);
    const sysDocs     = transformSystem(sysRaw);
    const overviewDoc = transformOverview(fixRaw, secRaw, hipRaw, sysRaw);

    const scriptsRaw = await blob.readJson('JSON/scripts.json', force);
    const scriptDocs = (scriptsRaw?.scripts ?? []).map((s, i) => ({
      id:          s.script_url ? s.script_url.replace('.ps1', '') : `script-${i + 1}`,
      name:        s.name        || '—',
      category:    s.category    || 'Fix',
      description: s.description || '',
      scriptType:  s.script_type || 'normal',
      managedBy:   s.managed_by  || 'all',
      scriptUrl:   s.script_url  || '',
    }));

    await Promise.all([
      // Write all dashboard types into the unified 'dashboard' container
      // Each document gets a 'type' field for filtered reads by controllers.
      cosmos.deleteAllByType('overview').then(() =>
        cosmos.upsertOne('dashboard', { ...overviewDoc, type: 'overview' })),
      cosmos.deleteAllByType('fix').then(() =>
        fixDocs.length > 0
          ? cosmos.upsertBulk('dashboard', fixDocs.map(d => ({ ...d, type: 'fix' })))
          : Promise.resolve()),
      cosmos.deleteAllByType('hip').then(() =>
        hipDocs.length > 0
          ? cosmos.upsertBulk('dashboard', hipDocs.map(d => ({ ...d, type: 'hip' })))
          : Promise.resolve()),
      cosmos.deleteAllByType('security').then(() =>
        secDocs.length > 0
          ? cosmos.upsertBulk('dashboard', secDocs.map(d => ({ ...d, type: 'security' })))
          : Promise.resolve()),
      cosmos.deleteAllByType('system').then(() =>
        sysDocs.length > 0
          ? cosmos.upsertBulk('dashboard', sysDocs.map(d => ({ ...d, type: 'system' })))
          : Promise.resolve()),
      scriptDocs.length > 0
        ? cosmos.deleteAllByType('script').then(() =>
            cosmos.upsertBulk('dashboard', scriptDocs.map(d => ({ ...d, type: 'script' }))))
        : Promise.resolve(),
    ]);

    _dashLastDurationMs = Date.now() - startMs;
    _dashLastSyncAt     = new Date().toISOString();
    _dashLastCounts     = {
      fixes: fixDocs.length, hip: hipDocs.length,
      security: secDocs.length, system: sysDocs.length,
      scripts: scriptDocs.length,
    };
    logger.info(`[SyncJob:Dashboard] Cycle #${_dashSyncCount} complete`, {
      durationMs: _dashLastDurationMs, ..._dashLastCounts,
    });
  } catch (err) {
    const isAuthErr = err.message && (
      err.message.includes('not authorized') ||
      err.message.includes('AuthorizationFailure') ||
      err.statusCode === 403
    );
    if (isAuthErr) {
      logger.error(
        '[SyncJob:Dashboard] Azure Blob Authorization DENIED.\n' +
        '  The SAS token for AZURE_BLOB_SAS_URL is missing the List ("l") permission.\n' +
        '  Fix: Azure Portal → Storage Account → Shared Access Signature → ' +
        'enable "List" permission → regenerate → update AZURE_BLOB_SAS_URL in .env'
      );
    } else {
      logger.error('[SyncJob:Dashboard] Cycle failed', { error: err.message, stack: err.stack });
    }
  } finally {
    _isDashSyncing = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Cycle 2 — PIN Management (every 5 min)
// Decodes JWT pin_token on backend; stores only rawPin (decoded 4-digit) in Cosmos.
// ─────────────────────────────────────────────────────────────────────────────
let _isPinSyncing  = false;
let _pinSyncCount  = 0;
let _pinLastSyncAt = null;
let _pinLastDurationMs = null;
let _pinLastCount  = 0;

async function runPinSync(force = false) {
  if (_isPinSyncing) {
    logger.warn('[SyncJob:PIN] Already in progress — skipping');
    return;
  }
  if (!cosmos.isAvailable()) {
    logger.warn('[SyncJob:PIN] Cosmos DB not configured — skipping');
    return;
  }
  if (!config.azurePins.blobSasUrl) {
    logger.warn('[SyncJob:PIN] AZURE_PINS_BLOB_SAS_URL not set — skipping PIN sync');
    return;
  }

  _isPinSyncing = true;
  const startMs = Date.now();
  _pinSyncCount++;
  logger.info(`[SyncJob:PIN] Cycle #${_pinSyncCount} started${force ? ' (forced)' : ''}`);

  try {
    const { ContainerClient } = require('@azure/storage-blob');
    const pinsClient = new ContainerClient(config.azurePins.blobSasUrl);

    // ── Parse SAS permissions for diagnostic logging ────────────────────────
    try {
      const sasUrl  = new URL(config.azurePins.blobSasUrl);
      const sp      = sasUrl.searchParams.get('sp') || '';
      const se      = sasUrl.searchParams.get('se') || '';
      logger.info(`[SyncJob:PIN] SAS permissions: "${sp}"  expires: ${se}`);
      if (!sp.includes('l')) {
        logger.warn('[SyncJob:PIN] SAS token is missing List ("l") permission — blob listing will fail. ' +
          'Please regenerate the SAS with at minimum: r (Read) + l (List) permissions.');
      }
    } catch (_) { /* URL parse failure is non-fatal */ }

    // ── List blobs with graceful fallback ────────────────────────────────────
    let pinBlobNames = [];
    try {
      for await (const b of pinsClient.listBlobsFlat({ prefix: 'pins/' })) {
        if (b.name.endsWith('.json')) pinBlobNames.push(b.name);
      }
      pinBlobNames.sort();
      logger.info(`[SyncJob:PIN] Found ${pinBlobNames.length} pin blobs via list`);
    } catch (listErr) {
      const isAuthErr = listErr.message && (
        listErr.message.includes('not authorized') ||
        listErr.message.includes('AuthorizationFailure') ||
        listErr.statusCode === 403
      );
      if (isAuthErr) {
        // SAS is missing List permission — this is a configuration issue, not a code bug.
        // Log clearly and skip this cycle rather than crashing the sync.
        logger.error(
          '[SyncJob:PIN] Azure Blob listing DENIED. The SAS token for AZURE_PINS_BLOB_SAS_URL ' +
          'is missing the List ("l") permission.\n' +
          '  Fix: Go to Azure Portal → Storage Account → Shared Access Signature → ' +
          'check "List" under Allowed permissions → regenerate SAS → update AZURE_PINS_BLOB_SAS_URL in .env'
        );
        _pinLastDurationMs = Date.now() - startMs;
        _pinLastSyncAt     = new Date().toISOString();
        return; // Skip this cycle cleanly
      }
      throw listErr; // Re-throw non-auth errors
    }

    const rawPins = await Promise.all(pinBlobNames.map(async (name, idx) => {
      try {
        const bc = pinsClient.getBlobClient(name);
        const dl = await bc.download();
        const chunks = [];
        for await (const ch of dl.readableStreamBody) {
          chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
        }
        const raw = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

        // ── Decode PIN from JWT pin_token on the backend only ──────────────────
        let pin = '';
        if (raw.pin_token) {
          try {
            const parts = String(raw.pin_token).split('.');
            if (parts.length === 3) {
              const b64    = parts[1].replace(/-/g, '+').replace(/_/g, '/');
              const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
              const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
              pin = String(payload.pin || '').trim();
            }
          } catch (jwtErr) {
            logger.warn('[SyncJob:PIN] Failed to decode pin_token JWT', { blob: name, error: jwtErr.message });
          }
        } else if (raw.pin) {
          // Fallback: plain pin field (non-JWT format)
          pin = String(raw.pin || '').trim();
        }

        // Use the original device hostname (with original casing) as the Cosmos document id.
        // Cosmos DB supports any non-empty string as an id, including uppercase and hyphens.
        // This makes records human-readable in the Azure portal (e.g. LTCH-5CD44666CY)
        // and removes the need for any id-to-hostname mapping in the frontend or controller.
        const hostnameRaw = (raw.device_name || '').trim();
        const documentId  = hostnameRaw || `pin-${idx + 1}`;

        return {
          id:                    documentId,
          seqId:                 idx + 1,
          hostname:              hostnameRaw || '—',
          username:              raw.logged_user  || '—',
          rawPin:                pin,   // decoded 4-digit PIN — JWT is never stored
          period:                raw.period       || '—',
          createdAt:             raw.created_at   || '—',
          expiresAt:             raw.expires_at   || '—',
          rotationIntervalHours: raw.rotation_interval_hours ?? 24,
          pinLength:             pin.length || 4,
          pinValid:              /^\d{4}$/.test(pin),
        };
      } catch { return null; }
    }));

    const pinDocs = rawPins.filter(Boolean);

    // Deduplicate by hostname — keep only the latest pin per device.
    // This handles cases where multiple blob files exist for the same device.
    const pinByHostname = {};
    for (const p of pinDocs) {
      const key = (p.hostname || '').toLowerCase().trim() || p.id;
      const existing = pinByHostname[key];
      if (!existing || (p.createdAt || '') > (existing.createdAt || '')) {
        pinByHostname[key] = p;
      }
    }
    let dedupedPins = Object.values(pinByHostname);

    // ── Cross-reference against active system_info devices ───────────────────
    // Only keep pins whose hostname matches a device currently in system_info.
    // This removes stale pins for decommissioned/renamed devices.
    try {
      const activeSysDocs = await cosmos.queryByType('system');
      if (activeSysDocs.length > 0) {
        const activeHostnames = new Set(
          activeSysDocs
            .map(d => (d.hostname || '').toLowerCase().trim())
            .filter(Boolean)
        );
        const before = dedupedPins.length;
        dedupedPins = dedupedPins.filter(p =>
          activeHostnames.has((p.hostname || '').toLowerCase().trim())
        );
        logger.info(
          `[SyncJob:PIN] Active-device filter: ${before} → ${dedupedPins.length} pins ` +
          `(removed ${before - dedupedPins.length} stale entries)`,
          { activeDeviceCount: activeHostnames.size }
        );
      } else {
        logger.warn('[SyncJob:PIN] No system docs found — skipping active-device filter (dashboard sync may not have run yet)');
      }
    } catch (filterErr) {
      logger.warn('[SyncJob:PIN] Could not fetch system docs for active-device filter', { error: filterErr.message });
    }

    // Always deleteAll first (even if 0 new pins) to remove stale/renamed devices.
    // This is safe: the next sync will re-populate from Blob.
    await cosmos.deleteAll('pins');
    if (dedupedPins.length > 0) {
      await cosmos.upsertBulk('pins', dedupedPins);
    }

    _pinLastDurationMs = Date.now() - startMs;
    _pinLastSyncAt     = new Date().toISOString();
    _pinLastCount      = dedupedPins.length;
    logger.info(`[SyncJob:PIN] Cycle #${_pinSyncCount} complete — ${dedupedPins.length} PINs synced (${pinDocs.length} raw, deduped by hostname)`, {
      durationMs: _pinLastDurationMs,
    });
  } catch (err) {
    logger.error('[SyncJob:PIN] Cycle failed', { error: err.message });
  } finally {
    _isPinSyncing = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Cycle 3 — PIN Audit Log (every 15 min — same as dashboard)
// Reads {timestamp}_pin_attempt_{SUCCESS|FAILED}_{uuid}.json from Blob.
// Stores actual outcome from blob name + content into Cosmos pin-audit container.
// ─────────────────────────────────────────────────────────────────────────────
let _isAuditSyncing  = false;
let _auditSyncCount  = 0;
let _auditLastSyncAt = null;
let _auditLastDurationMs = null;
let _auditLastCount  = 0;

async function runAuditSync(force = false) {
  if (_isAuditSyncing) {
    logger.warn('[SyncJob:Audit] Already in progress — skipping');
    return;
  }
  if (!cosmos.isAvailable()) {
    logger.warn('[SyncJob:Audit] Cosmos DB not configured — skipping');
    return;
  }
  if (!config.azure.blobSasUrl) {
    logger.warn('[SyncJob:Audit] AZURE_BLOB_SAS_URL not set — skipping audit sync');
    return;
  }

  _isAuditSyncing = true;
  const startMs = Date.now();
  _auditSyncCount++;
  logger.info(`[SyncJob:Audit] Cycle #${_auditSyncCount} started${force ? ' (forced)' : ''}`);

  try {
    // Source: selfx-123456789 container ONLY (AZURE_BLOB_SAS_URL)
    // Try multiple path patterns to find where audit logs actually live
    const cutoff30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Try all known path patterns — use whichever has blobs
    const pathsToTry = ['logs/pin_audit/', 'pin_audit/', 'Log_Collection/pin_audit/'];
    let auditBlobs = [];
    let foundPath = '';

    for (const prefix of pathsToTry) {
      try {
        const blobList = await blob.listBlobs(prefix, force);
        const jsonBlobs = blobList.filter(b => b.name.endsWith('.json'));
        logger.info(`[SyncJob:Audit] Checked prefix "${prefix}": ${jsonBlobs.length} JSON blobs`);
        if (jsonBlobs.length > 0) {
          auditBlobs = jsonBlobs;
          foundPath = prefix;
          break;
        }
      } catch (e) {
        const isAuthErr = e.message && (
          e.message.includes('not authorized') ||
          e.message.includes('AuthorizationFailure') ||
          e.statusCode === 403
        );
        if (isAuthErr) {
          logger.error(
            `[SyncJob:Audit] Azure Blob listing DENIED for prefix "${prefix}". ` +
            'The SAS token for AZURE_BLOB_SAS_URL is missing the List ("l") permission.\n' +
            '  Fix: Go to Azure Portal → Storage Account → Shared Access Signature → ' +
            'check "List" under Allowed permissions → regenerate SAS → update AZURE_BLOB_SAS_URL in .env'
          );
          // Stop trying paths — it's a permission issue, not a path issue
          break;
        }
        logger.warn(`[SyncJob:Audit] Failed to list prefix "${prefix}"`, { error: e.message });
      }
    }

    logger.info(`[SyncJob:Audit] Using path "${foundPath}" — ${auditBlobs.length} blobs total`);

    if (auditBlobs.length === 0) {
      logger.warn('[SyncJob:Audit] No pin_audit JSON blobs found in any known path. Check that audit logs exist at logs/pin_audit/ or pin_audit/ in selfx-123456789.');
      _auditLastDurationMs = Date.now() - startMs;
      _auditLastSyncAt     = new Date().toISOString();
      _auditLastCount      = 0;
      return;
    }

    const pinAuditDocs = [];
    const ABATCH = 20;
    for (let i = 0; i < auditBlobs.length; i += ABATCH) {
      const batch = auditBlobs.slice(i, i + ABATCH);
      const parsed = await Promise.all(batch.map(async ({ name, lastModified }) => {
        try {
          const raw = await blob.readJson(name, force);
          if (!raw) {
            logger.warn(`[SyncJob:Audit] Could not read blob: ${name}`);
            return null;
          }

          // Extract hostname/userId from blob path
          // Supports: logs/pin_audit/{hostname}/{user_id}/{file}.json
          //           pin_audit/{hostname}/{user_id}/{file}.json
          const parts = name.split('/');
          let hostnameFromPath = '—';
          let userIdFromPath   = '—';
          const pinAuditIdx = parts.indexOf('pin_audit');
          if (pinAuditIdx >= 0 && parts.length > pinAuditIdx + 2) {
            hostnameFromPath = parts[pinAuditIdx + 1] || '—';
            userIdFromPath   = parts[pinAuditIdx + 2] || '—';
          }

          // Derive outcome from raw.result field (per actual JSON format)
          const rawResult = (raw.result || raw.outcome || raw.status || '').toUpperCase();
          const outcome   = rawResult === 'SUCCESS' ? 'SUCCESS'
                          : rawResult === 'FAILED'  ? 'FAILED'
                          : rawResult === 'PASS'    ? 'SUCCESS'
                          : rawResult === 'FAIL'    ? 'FAILED'
                          : '—';

          // Use JSON timestamp for 30-day filter (not lastModified)
          const ts = raw.timestamp || (lastModified ? new Date(lastModified).toISOString() : null);
          if (ts && new Date(ts) < cutoff30Days) {
            logger.debug(`[SyncJob:Audit] Skipping old record (>30 days): ${name}`);
            return null;
          }

          // Unique id per blob file — no duplicates
          const safeId = name.replace(/\//g, '_').replace(/\.json$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 255);

          // Extract just the filename from script_url (may be a full URL or just a filename)
          const rawScriptUrl = raw.script_url || raw.script_name || raw.action || '—';
          const scriptName   = rawScriptUrl.includes('/')
            ? rawScriptUrl.split('/').pop().split('?')[0]  // strip path and query string
            : rawScriptUrl;

          logger.debug(`[SyncJob:Audit] Parsed: ${safeId} | host=${raw.device_name || hostnameFromPath} | outcome=${outcome} | script=${scriptName}`);

          return {
            id:         safeId,
            hostname:   raw.device_name || hostnameFromPath || '—',
            userId:     raw.logged_user || userIdFromPath   || '—',
            outcome,
            timestamp:  ts || new Date().toISOString(),
            scriptName,                        // filename only, e.g. "Bitlocker-Encryption.ps1"
            dataSource: 'Blob Storage',
            blobName:   name,
            details:    raw.details || raw.reason || raw.error_message || '',
          };
        } catch (e) {
          logger.error(`[SyncJob:Audit] Error parsing blob ${name}`, { error: e.message });
          return null;
        }
      }));
      pinAuditDocs.push(...parsed.filter(Boolean));
    }

    logger.info(`[SyncJob:Audit] Parsed ${pinAuditDocs.length} valid records from ${auditBlobs.length} blobs`);

    if (pinAuditDocs.length > 0) {
      logger.info('[SyncJob:Audit] Deleting existing Cosmos audit records...');
      await cosmos.deleteAll('audit');
      logger.info('[SyncJob:Audit] Upserting fresh records to Cosmos audit container...');
      await cosmos.upsertBulk('audit', pinAuditDocs);
      logger.info(`[SyncJob:Audit] Successfully wrote ${pinAuditDocs.length} records to Cosmos audit`);
    } else {
      logger.warn('[SyncJob:Audit] No valid records to sync (all filtered or parse errors)');
    }

    _auditLastDurationMs = Date.now() - startMs;
    _auditLastSyncAt     = new Date().toISOString();
    _auditLastCount      = pinAuditDocs.length;
    logger.info(`[SyncJob:Audit] Cycle #${_auditSyncCount} complete — ${pinAuditDocs.length} records synced`, {
      durationMs: _auditLastDurationMs,
    });
  } catch (err) {
    logger.error('[SyncJob:Audit] Cycle failed', { error: err.message });
  } finally {
    _isAuditSyncing = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAS Validator — logs permissions for each SAS token on startup
// ─────────────────────────────────────────────────────────────────────────────
function _validateSasPermissions(envKey, sasUrl) {
  if (!sasUrl) {
    logger.warn(`[SyncJob:SAS] ${envKey} is not set — sync for this source will be skipped`);
    return;
  }
  try {
    const url = new URL(sasUrl);
    const sp  = url.searchParams.get('sp') || '';
    const se  = url.searchParams.get('se') || '';
    const st  = url.searchParams.get('st') || '';
    const now = new Date();
    const exp = se ? new Date(se) : null;
    const isExpired  = exp ? exp < now : false;
    const hasRead    = sp.includes('r');
    const hasList    = sp.includes('l');
    const hasWrite   = sp.includes('w');

    const issues = [];
    if (isExpired) issues.push(`EXPIRED at ${se}`);
    if (!hasRead)  issues.push('missing Read ("r") permission');
    if (!hasList)  issues.push('missing List ("l") permission — blob listing will fail');

    if (issues.length > 0) {
      logger.error(
        `[SyncJob:SAS] ${envKey} has issues: ${issues.join(', ')}.\n` +
        '  Fix: Azure Portal → Storage Account → Shared Access Signature → ' +
        'enable Read + List permissions → set future expiry → regenerate SAS → update .env'
      );
    } else {
      logger.info(`[SyncJob:SAS] ${envKey} OK  permissions="${sp}"  valid: ${st} → ${se}  write=${hasWrite}`);
    }
  } catch (e) {
    logger.warn(`[SyncJob:SAS] Could not parse ${envKey} as URL: ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler — three independent timers
// ─────────────────────────────────────────────────────────────────────────────
let _dashTimerId  = null;
let _pinTimerId   = null;
let _auditTimerId = null;

function start() {
  const dashMs  = config.syncIntervalMinutes         * 60 * 1000;  // 15 min
  const pinMs   = config.pinSyncIntervalMinutes       * 60 * 1000;  //  5 min
  const auditMs = config.pinAuditSyncIntervalMinutes  * 60 * 1000;  // 15 min

  logger.info('─────────────────────────────────────────────');
  logger.info(`[SyncJob] Dashboard data sync   → every ${config.syncIntervalMinutes} min`);
  logger.info(`[SyncJob] PIN Management sync   → every ${config.pinSyncIntervalMinutes} min`);
  logger.info(`[SyncJob] PIN Audit Log sync    → every ${config.pinAuditSyncIntervalMinutes} min`);

  // ── Validate SAS token permissions at startup ─────────────────────────────
  _validateSasPermissions('AZURE_BLOB_SAS_URL',      config.azure.blobSasUrl);
  _validateSasPermissions('AZURE_PINS_BLOB_SAS_URL', config.azurePins.blobSasUrl);

  logger.info('─────────────────────────────────────────────');

  // Run all three immediately on startup, then on their independent schedules
  runDashboardSync().catch(e => logger.error('[SyncJob:Dashboard] Initial sync error', { error: e.message }));
  runPinSync().catch(e       => logger.error('[SyncJob:PIN] Initial sync error',       { error: e.message }));
  runAuditSync().catch(e     => logger.error('[SyncJob:Audit] Initial sync error',     { error: e.message }));

  if (!_dashTimerId) {
    _dashTimerId = setInterval(() => {
      runDashboardSync().catch(e => logger.error('[SyncJob:Dashboard] Scheduled error', { error: e.message }));
    }, dashMs);
  }

  if (!_pinTimerId) {
    _pinTimerId = setInterval(() => {
      runPinSync().catch(e => logger.error('[SyncJob:PIN] Scheduled error', { error: e.message }));
    }, pinMs);
  }

  if (!_auditTimerId) {
    _auditTimerId = setInterval(() => {
      runAuditSync().catch(e => logger.error('[SyncJob:Audit] Scheduled error', { error: e.message }));
    }, auditMs);
  }
}

function stop() {
  if (_dashTimerId)  { clearInterval(_dashTimerId);  _dashTimerId  = null; }
  if (_pinTimerId)   { clearInterval(_pinTimerId);   _pinTimerId   = null; }
  if (_auditTimerId) { clearInterval(_auditTimerId); _auditTimerId = null; }
  logger.info('[SyncJob] All sync timers stopped');
}

function getStatus() {
  return {
    dashboard: {
      running:        _dashTimerId !== null,
      syncing:        _isDashSyncing,
      lastSyncAt:     _dashLastSyncAt,
      lastDurationMs: _dashLastDurationMs,
      lastCounts:     _dashLastCounts,
      syncCount:      _dashSyncCount,
      intervalMinutes: config.syncIntervalMinutes,
    },
    pins: {
      running:        _pinTimerId !== null,
      syncing:        _isPinSyncing,
      lastSyncAt:     _pinLastSyncAt,
      lastDurationMs: _pinLastDurationMs,
      lastCount:      _pinLastCount,
      syncCount:      _pinSyncCount,
      intervalMinutes: config.pinSyncIntervalMinutes,
    },
    audit: {
      running:        _auditTimerId !== null,
      syncing:        _isAuditSyncing,
      lastSyncAt:     _auditLastSyncAt,
      lastDurationMs: _auditLastDurationMs,
      lastCount:      _auditLastCount,
      syncCount:      _auditSyncCount,
      intervalMinutes: config.pinAuditSyncIntervalMinutes,
    },
    cosmosAvailable: cosmos.isAvailable(),
  };
}

async function forceSync() {
  await Promise.all([
    runDashboardSync(true),
    runPinSync(true),
    runAuditSync(true),
  ]);
}

async function forceAuditSync() {
  await runAuditSync(true);
}

/**
 * Dynamically update sync intervals and restart the affected timers.
 * Called by adminController when an admin saves new intervals.
 */
function updateIntervals({ dashboardSyncMinutes, pinSyncMinutes }) {
  logger.info('[SyncJob] Updating intervals', { dashboardSyncMinutes, pinSyncMinutes });

  if (dashboardSyncMinutes && !isNaN(dashboardSyncMinutes)) {
    const dashMs = Math.max(1, dashboardSyncMinutes) * 60 * 1000;
    if (_dashTimerId) { clearInterval(_dashTimerId); _dashTimerId = null; }
    _dashTimerId = setInterval(() => {
      runDashboardSync().catch(e => logger.error('[SyncJob:Dashboard] Scheduled error', { error: e.message }));
    }, dashMs);
    logger.info(`[SyncJob] Dashboard interval updated → ${dashboardSyncMinutes} min`);
  }

  if (pinSyncMinutes && !isNaN(pinSyncMinutes)) {
    const pinMs = Math.max(1, pinSyncMinutes) * 60 * 1000;
    if (_pinTimerId) { clearInterval(_pinTimerId); _pinTimerId = null; }
    _pinTimerId = setInterval(() => {
      runPinSync().catch(e => logger.error('[SyncJob:PIN] Scheduled error', { error: e.message }));
    }, pinMs);
    logger.info(`[SyncJob] PIN interval updated → ${pinSyncMinutes} min`);
  }
}

module.exports = { start, stop, getStatus, forceSync, forceAuditSync, updateIntervals };
