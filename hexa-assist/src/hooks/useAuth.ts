/**
 * useAuth — RBAC authentication hook
 *
 * Reads the current user from the 'hexa_user' cookie set by the backend.
 * Designed to be replaced with Microsoft Entra ID token parsing later.
 *
 * Updated Role Permissions:
 *   admin          All pages EXCEPT Admin Center. Full edit, tag, PIN access.
 *   developer      All pages INCLUDING Admin Center. Full access + User Management.
 *   global_reader  All pages EXCEPT Admin Center. Can assign/remove device tags. Can reveal PIN.
 *   reader_pin     All pages EXCEPT Admin Center. View-only. Can reveal PIN. No tag management.
 *   reader_tag     All pages EXCEPT Admin Center. Can assign/delete tags in System Info and Executive Devices. No PIN reveal.
 */

export type UserRole =
  | 'admin'
  | 'developer'
  | 'global_reader'
  | 'reader_pin'
  | 'reader_tag';

export interface AuthUser {
  id:          string;
  username:    string;
  displayName: string;
  role:        UserRole;
  email:       string;
}

// ── Role labels ───────────────────────────────────────────────────────────────
export const ROLE_LABELS: Record<UserRole, string> = {
  admin:         'Admin',
  developer:     'Developer',
  global_reader: 'Global Reader',
  reader_pin:    'Reader + PIN',
  reader_tag:    'Reader + Tag',
};

// ── Pages each role can access ────────────────────────────────────────────────
// Page keys must match the route segment in App.tsx (e.g. 'overview', 'admin', etc.)
export const ROLE_PAGES: Record<UserRole, string[]> = {
  // Admin: everything EXCEPT Developer Settings ('admin' page)
  admin:         ['overview', 'system', 'executive', 'fixes', 'hip', 'pins', 'security'],

  // Developer: everything INCLUDING Developer Settings
  developer:     ['overview', 'system', 'executive', 'fixes', 'hip', 'pins', 'security', 'admin'],

  // Global Reader: view-only access to all pages EXCEPT Developer Settings
  global_reader: ['overview', 'system', 'executive', 'fixes', 'hip', 'pins', 'security'],

  // Reader + PIN: view + PIN Management + Executive Devices — NO Developer Settings. No Assign/Delete Tag.
  reader_pin:    ['overview', 'system', 'executive', 'fixes', 'hip', 'pins', 'security'],

  // Reader + Tag: view + Executive Devices + PIN Management (view-only) — NO Developer Settings. No Assign/Delete Tag.
  reader_tag:    ['overview', 'system', 'executive', 'fixes', 'hip', 'pins', 'security'],
};

// ── Capabilities per role ─────────────────────────────────────────────────────
export const ROLE_CAPS = {
  // Reveal PIN button in PIN Management — admin, developer, reader_pin, global_reader
  canRevealPin:     (r: UserRole) => r === 'admin' || r === 'developer' || r === 'reader_pin' || r === 'global_reader',

  // Assign / remove tags on devices in System Info and Executive Devices.
  // admin, developer, global_reader, reader_tag can manage tags.
  canTag:           (r: UserRole) => r === 'admin' || r === 'developer' || r === 'global_reader' || r === 'reader_tag',

  // Rename / delete tags in the Tag Management section of Developer Settings (admin only)
  canManageTags:    (r: UserRole) => r === 'admin',

  // Access Developer Settings page (and User Management)
  canAccessAdmin:   (r: UserRole) => r === 'developer',

  // Any non-tag create / update / delete edit action (admin + developer only)
  canEdit:          (r: UserRole) => r === 'admin' || r === 'developer',

  // Export CSV (admin + developer only — readers use view)
  canExport:        (r: UserRole) => r === 'admin' || r === 'developer',
};

// ── Cookie helpers ─────────────────────────────────────────────────────────────
export function getSessionUser(): AuthUser | null {
  try {
    const raw = document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('hexa_user='));
    if (!raw) return null;
    const value = raw.slice('hexa_user='.length);
    return JSON.parse(decodeURIComponent(value));
  } catch { return null; }
}

export function clearSessionUser(): void {
  document.cookie = 'hexa_user=; Max-Age=0; path=/; SameSite=Lax';
}

export function canAccessPage(role: UserRole, page: string): boolean {
  return (ROLE_PAGES[role] ?? []).includes(page);
}

/**
 * Check if a temp access grant covers a given page.
 * Called at runtime when the user's role-based pages don't include the page.
 * The actual grant list is fetched by the frontend and passed in.
 */
export function hasActiveTempAccess(
  grants: Array<{ module: string; expiresAt: string; active: boolean }>,
  page: string
): boolean {
  const now = new Date();
  return grants.some(g =>
    g.active &&
    g.module === page &&
    new Date(g.expiresAt) > now
  );
}
