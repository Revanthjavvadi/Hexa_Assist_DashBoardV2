// ─────────────────────────────────────────────────────────────────────────────
// HEXA ASSIST – Frontend API Client
//
// Architecture: Dashboard → Backend API → Cosmos DB only.
// There is NO direct Blob Storage access from the frontend.
// All data flows: Azure Blob Storage → (syncJob) → Cosmos DB → Backend API → Dashboard
// ─────────────────────────────────────────────────────────────────────────────

import { emitLog } from '../hooks/useRealtimeLogs';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ── Generic fetch wrapper ─────────────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? 'GET';
  const label  = `${method} ${path.split('?')[0]}`;
  emitLog('info', 'API', `→ ${label}`);

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = (err as { error?: string }).error ?? `HTTP ${res.status}`;
    emitLog('error', 'API', `✗ ${label} → ${msg}`);
    throw new Error(msg);
  }

  const json = await res.json() as T;
  const live = (json as Record<string, unknown>)['live'];
  emitLog(
    live === false ? 'warn' : 'success',
    'API',
    `✓ ${label} ${live === false ? '(fallback)' : '(live • Cosmos DB)'}`,
  );
  return json;
}

// ── Response shape ────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data:    T;
  live:    boolean;
  error?:  string;
}

// ── Sync status ───────────────────────────────────────────────────────────────
export interface SyncStatus {
  refreshIntervalMs:  number;
  cacheTtlSeconds:    number;
  serverTime:         string;
}

export async function fetchSyncStatus() {
  return apiFetch<{ success: boolean } & SyncStatus>('/api/sync-status');
}

// ── Health ────────────────────────────────────────────────────────────────────
export async function checkHealth() {
  return apiFetch<{ status: string; timestamp: string }>('/health');
}

// ── Dashboard endpoints — all read from Cosmos DB only, no Blob bypass ────────
export async function fetchOverview() {
  return apiFetch<ApiResponse<OverviewData>>('/api/overview');
}

export async function fetchHipChecks() {
  return apiFetch<ApiResponse<HipRecord[]>>('/api/hip');
}

export async function fetchFixes() {
  return apiFetch<ApiResponse<FixRecord[]>>('/api/fixes');
}

export async function fetchSecurity() {
  return apiFetch<ApiResponse<SecurityRecord[]>>('/api/security');
}

export async function fetchSystemInfo() {
  return apiFetch<ApiResponse<SystemDevice[]>>('/api/system');
}

// ── Scripts — read from Cosmos DB only ───────────────────────────────────────
export async function fetchScriptList() {
  return apiFetch<ApiResponse<ScriptMeta[]>>('/api/scripts');
}

export async function fetchScript(id: string) {
  return apiFetch<ApiResponse<object>>(`/api/scripts/${id}`);
}

export async function saveScript(id: string, content: object) {
  return apiFetch<{ success: boolean; message: string }>(`/api/scripts/${id}`, {
    method: 'PUT',
    body:   JSON.stringify(content),
  });
}

export async function deleteScript(id: string) {
  return apiFetch<{ success: boolean }>(`/api/scripts/${id}`, { method: 'DELETE' });
}

// ── Device Tag assignments (Executive Devices) — Azure Cache Storage ─────────

export interface TagEntry {
  hostname:   string;
  tags:       string[];
  assignedAt: string;
}

/** Fetch all tag assignments from Azure Cache Storage via the backend. */
export async function fetchTags(): Promise<TagEntry[]> {
  try {
    const res = await apiFetch<{ success: boolean; data: TagEntry[] }>('/api/tags');
    return res.data ?? [];
  } catch {
    return [];
  }
}

/** Assign a tag to a device (incremental — backend merges into stored list). */
export async function apiAssignTag(hostname: string, tag: string): Promise<void> {
  await apiFetch<{ success: boolean }>('/api/tags/assign', {
    method: 'POST',
    body:   JSON.stringify({ hostname, tag }),
  });
}

/** Remove a tag from a device (incremental). */
export async function apiRemoveTag(hostname: string, tag: string): Promise<void> {
  await apiFetch<{ success: boolean }>('/api/tags/remove', {
    method: 'POST',
    body:   JSON.stringify({ hostname, tag }),
  });
}

// ── PINs — always from Cosmos DB, no ?fresh bypass ───────────────────────────
export async function fetchPins() {
  return apiFetch<ApiResponse<PinRecord[]>>('/api/pins');
}

// EUC pins — same endpoint, same data, separate named export for clarity
export const fetchEucPins = fetchPins;

export async function revealPin(id: string) {
  return apiFetch<{ success: boolean; pin: string }>(`/api/pins/${encodeURIComponent(id)}/reveal`);
}

// ── PIN Audit Log ─────────────────────────────────────────────────────────────
export interface PinAuditRow {
  hostname:     string;
  userId:       string;
  successCount: number;
  failedCount:  number;
}

export interface PinAttemptDetail {
  scriptName: string;
  timestamp:  string;
  dataSource: string;
  outcome:    string;
  details:    string;
}

export async function fetchPinAuditLog() {
  return apiFetch<ApiResponse<PinAuditRow[]>>('/api/pins/audit');
}

export async function fetchPinAttempts(hostname: string, outcome: 'SUCCESS' | 'FAILED') {
  const enc = encodeURIComponent(hostname);
  return apiFetch<ApiResponse<PinAttemptDetail[]>>(`/api/pins/audit/${enc}/attempts?outcome=${outcome}`);
}

// ── Authentication & RBAC ─────────────────────────────────────────────────────
export interface AuthUser {
  id:          string;
  username:    string;
  displayName: string;
  role:        string;
  email:       string;
}

export async function apiLogin(username: string) {
  return apiFetch<{ success: boolean; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body:   JSON.stringify({ username }),
  });
}

export async function apiLogout() {
  return apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
}

export async function fetchUsers() {
  return apiFetch<{ success: boolean; data: AuthUser[] }>('/api/auth/users');
}

export async function createUser(user: Omit<AuthUser, 'id'>) {
  return apiFetch<{ success: boolean; data: AuthUser }>('/api/auth/users', {
    method: 'POST',
    body:   JSON.stringify(user),
  });
}

export async function updateUserRole(id: string, role: string) {
  return apiFetch<{ success: boolean; data: AuthUser }>(`/api/auth/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body:   JSON.stringify({ role }),
  });
}

export async function deleteUser(id: string) {
  return apiFetch<{ success: boolean }>(`/api/auth/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Trigger an immediate audit sync from Blob → Cosmos on the backend */
export async function triggerAuditSync() {
  return apiFetch<{ success: boolean; message: string }>('/api/pins/audit/flush', { method: 'POST' });
}

// ── Temporary Access ──────────────────────────────────────────────────────────
export interface TempAccessGrant {
  id:                   string;
  userId:               string;
  username:             string;
  displayName:          string;
  module:               string;
  permission:           'view' | 'manage';
  grantedBy:            string;
  grantedByDisplayName: string;
  startTime:            string;
  expiresAt:            string;
  active:               boolean;
}

export async function fetchTempAccess() {
  return apiFetch<{ success: boolean; data: TempAccessGrant[] }>('/api/temp-access');
}

export async function createTempAccess(grant: Omit<TempAccessGrant, 'id' | 'startTime' | 'active'>) {
  return apiFetch<{ success: boolean; data: TempAccessGrant }>('/api/temp-access', {
    method: 'POST',
    body:   JSON.stringify(grant),
  });
}

export async function revokeTempAccess(id: string) {
  return apiFetch<{ success: boolean }>(`/api/temp-access/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchUserTempAccess(userId: string) {
  return apiFetch<{ success: boolean; data: TempAccessGrant[] }>(`/api/temp-access/user/${encodeURIComponent(userId)}`);
}

// ── Admin Settings ────────────────────────────────────────────────────────────
export interface AdminSettings {
  dashboardSyncMinutes: number;
  pinSyncMinutes:       number;
}

export async function fetchAdminSettings() {
  return apiFetch<{ success: boolean; data: AdminSettings }>('/api/admin/settings');
}

export async function saveAdminSettings(settings: AdminSettings) {
  return apiFetch<{ success: boolean; data: AdminSettings }>('/api/admin/settings', {
    method: 'PUT',
    body:   JSON.stringify(settings),
  });
}

export async function fetchAdminTags(): Promise<string[]> {
  const res = await apiFetch<{ success: boolean; data: string[] }>('/api/admin/tags');
  return res.data ?? [];
}

export async function createAdminTag(name: string): Promise<string[]> {
  const res = await apiFetch<{ success: boolean; data: string[] }>('/api/admin/tags', {
    method: 'POST',
    body:   JSON.stringify({ name }),
  });
  return res.data ?? [];
}

export async function renameAdminTag(oldName: string, newName: string): Promise<string[]> {
  const enc = encodeURIComponent(oldName);
  const res = await apiFetch<{ success: boolean; data: string[] }>(`/api/admin/tags/${enc}`, {
    method: 'PUT',
    body:   JSON.stringify({ newName }),
  });
  return res.data ?? [];
}

export async function deleteAdminTag(name: string): Promise<string[]> {
  const enc = encodeURIComponent(name);
  const res = await apiFetch<{ success: boolean; data: string[] }>(`/api/admin/tags/${enc}`, {
    method: 'DELETE',
  });
  return res.data ?? [];
}

// ── Data shapes ───────────────────────────────────────────────────────────────
export interface OverviewData {
  totalDevices:       number;
  totalFixesToday:    number;
  securityCompliance: number;
  devicesAtRisk:      number;
  lastCheckIn:        string;
  fixStatusPie:       Array<{ name: string; value: number; color?: string }>;
  dailyFixTrend:      Array<{ date: string; fixes: number }>;
  deviceHealthDist:   Array<{ status: string; count: number }>;
  complianceTrend:    Array<{ date: string; pct: number }>;
}

export interface HipRecord {
  id:           string;
  rawTimestamp?: string;   // ISO UTC string — used for sort order
  timestamp:    string;
  deviceName:   string;
  deviceType?:  string;   // 'Desktop' | 'Laptop' | etc. — used for BitLocker N/A in compliance
  serialNumber: string;
  loggedInUser: string;
  networkMode:  'Online' | 'Offline';
  appVersion:   string;
  checks: Array<{
    id:       string;
    category: string;
    name:     string;
    status:   'Pass' | 'Fail' | 'Warning';
    detail:   string;
  }>;
}

export interface FixRecord {
  id:             string;
  timestamp:      string;   // IST display string e.g. "29 Jun 2026, 10:13:15 IST"
  rawTimestamp?:  string;   // ISO UTC string e.g. "2026-06-29T04:43:15Z" — used for date filtering
  deviceName:     string;
  serialNumber:   string;
  loggedInUser:   string;
  networkMode:    'Online' | 'Offline';
  action:         string;
  fixName:        string;
  status:         'Success' | 'Failed' | 'In Progress';
  details:        string;
  duration:       string;
}

export interface SecurityRecord {
  id:               string;
  rawTimestamp?:    string;   // ISO UTC string — used for sort order
  timestamp:        string;
  deviceName:       string;
  deviceType?:      string;   // 'Desktop' | 'Laptop' | etc. — used for BitLocker N/A logic
  serialNumber:     string;
  loggedUser:       string;
  networkMode:      'Online' | 'Offline';
  appVersion:       string;
  cortexStatus:     'Running'     | 'Not Running';
  gpStatus:         'Connected'   | 'Not Connected';
  bitLockerStatus:  'Compliant'   | 'Non-Compliant' | 'N/A';
  secureBootStatus: 'Enabled'     | 'Disabled';
}

export interface SystemDevice {
  sno:             number;
  hostname:        string;
  username:        string;
  deviceType:      string;
  os:              string;
  diskTotal:       string;
  diskUsed:        string;
  diskType?:       string;
  ramTotal:        string;
  ramUsed:         string;
  patchCompliance: 'Compliant' | 'Non-Compliant';
  patchLabel?:     string;
  lastReboot:      string;
  domain:          string;
  managedByIntune: 'Yes' | 'No';
  isLocalAdmin?:   'Yes' | 'No';
  lastCheckIn:     string;
  status:          'Healthy' | 'Warning' | 'Critical' | 'Offline';
  manufacturer?:   string;
  model?:          string;
  serialNumber?:   string;
  bios?:           string;
  cpu?:            string;
  gpu?:            string;
  wifiSsid?:       string;
  wifiSignal?:     string;
  secureBoot?:     string;
  uptime?:         string;
  installedApps?:  Array<{ name: string; version: string }>;
  recentFixes?:    Array<{ date: string; fix: string; status: string; duration: string }>;
  lastActivity?:   string;
}

export interface ScriptMeta {
  id:           string;
  name:         string;
  container:    string;
  size:         string;
  lastModified: string;
  category?:    'Fix' | 'Diagnostic' | 'Compliance' | 'Utility';
  description?: string;
}

export interface PinRecord {
  id:                    string;   // Cosmos document id — sanitised hostname e.g. "ltch-5cd44666cy"
  hostname:              string;   // Original device hostname with preserved casing e.g. "LTCH-5CD44666CY"
  username:              string;
  pin:                   string;   // always "● ● ● ●" in list; real 4-digit via revealPin
  period?:               string;
  createdAt?:            string;
  expiresAt?:            string;
  rotationIntervalHours?: number;
  pinLength?:            number;
  pinValid?:             boolean;
}
