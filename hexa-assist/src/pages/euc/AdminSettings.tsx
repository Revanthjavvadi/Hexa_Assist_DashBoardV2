import { useState, useEffect } from 'react';
import {
  RefreshCw, Save, Tag, Plus, Pencil, Trash2,
  Check, X, Clock, Database, Users, UserPlus, ShieldCheck,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import {
  fetchAdminSettings, saveAdminSettings,
  fetchAdminTags, createAdminTag, renameAdminTag, deleteAdminTag,
  fetchUsers, createUser, updateUserRole, deleteUser,
  type AuthUser,
} from '../../services/api';
import { setCatalog } from '../../hooks/useTagStore';
import { ROLE_LABELS, type UserRole } from '../../hooks/useAuth';
import styles from './AdminSettings.module.css';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin',         label: 'Admin' },
  { value: 'developer',     label: 'Developer' },
  { value: 'global_reader', label: 'Global Reader' },
  { value: 'reader_pin',    label: 'Reader + PIN' },
  { value: 'reader_tag',    label: 'Reader + Tag' },
];

// ── Interval presets ──────────────────────────────────────────────────────────
const DASH_PRESETS  = [5, 10, 15, 30, 60];
const PIN_PRESETS   = [1, 2, 3, 5, 10, 15];

export default function AdminSettings() {
  // Sync intervals
  const [dashMin,     setDashMin]     = useState(15);
  const [pinMin,      setPinMin]      = useState(5);
  const [syncSaving,  setSyncSaving]  = useState(false);
  const [syncSaved,   setSyncSaved]   = useState(false);
  const [syncError,   setSyncError]   = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(true);

  // Tags
  const [tags,        setTags]        = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [newTagName,  setNewTagName]  = useState('');
  const [creating,    setCreating]    = useState(false);
  const [renameState, setRenameState] = useState<{ name: string; value: string } | null>(null);
  const [tagError,    setTagError]    = useState<string | null>(null);

  // Users
  const [users,       setUsers]       = useState<AuthUser[]>([]);
  const [usersLoading,setUsersLoading]= useState(true);
  const [userError,   setUserError]   = useState<string | null>(null);
  const [userSaved,   setUserSaved]   = useState(false);
  const [editRole,    setEditRole]    = useState<{ id: string; role: string } | null>(null);
  const [newUser,     setNewUser]     = useState({ username: '', displayName: '', email: '', role: 'global_reader' as UserRole });
  const [creatingUser,setCreatingUser]= useState(false);

  // Load settings + tags + users on mount
  useEffect(() => {
    fetchAdminSettings()
      .then(res => { setDashMin(res.data.dashboardSyncMinutes); setPinMin(res.data.pinSyncMinutes); })
      .catch(() => {})
      .finally(() => setSyncLoading(false));

    fetchAdminTags()
      .then(setTags)
      .catch(() => {})
      .finally(() => setTagsLoading(false));

    fetchUsers()
      .then(res => setUsers(res.data ?? []))
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, []);

  // ── Save sync intervals ─────────────────────────────────────────────────────
  const handleSaveSync = async () => {
    setSyncError(null);
    setSyncSaving(true);
    try {
      await saveAdminSettings({ dashboardSyncMinutes: dashMin, pinSyncMinutes: pinMin });
      setSyncSaved(true);
      setTimeout(() => setSyncSaved(false), 3000);
    } catch (e: unknown) {
      setSyncError((e as Error).message || 'Failed to save settings.');
    } finally {
      setSyncSaving(false);
    }
  };

  // ── Create tag ──────────────────────────────────────────────────────────────
  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    setTagError(null);
    setCreating(true);
    try {
      const updated = await createAdminTag(name);
      setTags(updated);
      setCatalog(updated);   // sync to useTagStore immediately
      setNewTagName('');
    } catch (e: unknown) {
      setTagError((e as Error).message || 'Failed to create tag.');
    } finally {
      setCreating(false);
    }
  };

  // ── Rename tag ──────────────────────────────────────────────────────────────
  const handleRenameTag = async () => {
    if (!renameState) return;
    const newName = renameState.value.trim();
    if (!newName || newName === renameState.name) { setRenameState(null); return; }
    setTagError(null);
    try {
      const updated = await renameAdminTag(renameState.name, newName);
      setTags(updated);
      setCatalog(updated);   // sync to useTagStore immediately
      setRenameState(null);
    } catch (e: unknown) {
      setTagError((e as Error).message || 'Failed to rename tag.');
    }
  };

  // ── Delete tag ──────────────────────────────────────────────────────────────
  const handleDeleteTag = async (name: string) => {
    if (!window.confirm(`Delete tag "${name}"? This will remove it from all assigned devices.`)) return;
    setTagError(null);
    try {
      const updated = await deleteAdminTag(name);
      setTags(updated);
      setCatalog(updated);
    } catch (e: unknown) {
      setTagError((e as Error).message || 'Failed to delete tag.');
    }
  };

  // ── Create user ─────────────────────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!newUser.username.trim()) { setUserError('Username is required.'); return; }
    setUserError(null);
    setCreatingUser(true);
    try {
      await createUser({
        username:    newUser.username.trim(),
        displayName: newUser.displayName.trim() || newUser.username.trim(),
        email:       newUser.email.trim(),
        role:        newUser.role,
      });
      // Re-fetch from Cosmos to get the authoritative list
      const res = await fetchUsers();
      setUsers(res.data ?? []);
      setNewUser({ username: '', displayName: '', email: '', role: 'global_reader' });
      setUserSaved(true);
      setTimeout(() => setUserSaved(false), 3000);
    } catch (e: unknown) {
      setUserError((e as Error).message || 'Failed to create user.');
    } finally {
      setCreatingUser(false);
    }
  };

  // ── Update user role ─────────────────────────────────────────────────────────
  const handleUpdateRole = async () => {
    if (!editRole) return;
    setUserError(null);
    try {
      await updateUserRole(editRole.id, editRole.role);
      // Re-fetch from Cosmos so the list reflects the saved state
      const res = await fetchUsers();
      setUsers(res.data ?? []);
      setEditRole(null);
    } catch (e: unknown) {
      setUserError((e as Error).message || 'Failed to update role.');
    }
  };

  // ── Delete user ─────────────────────────────────────────────────────────────
  const handleDeleteUser = async (id: string, name: string) => {
    if (!window.confirm(`Remove user "${name}"?`)) return;
    setUserError(null);
    try {
      await deleteUser(id);
      // Re-fetch from Cosmos so the list is authoritative
      const res = await fetchUsers();
      setUsers(res.data ?? []);
    } catch (e: unknown) {
      setUserError((e as Error).message || 'Failed to delete user.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Admin Center"
        subtitle="Configure sync intervals and manage device tags."
      />

      <div className={styles.grid}>

        {/* ── Section 1: Dashboard Sync Time ─────────────────────────── */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><Database size={16} /></div>
            <div>
              <div className={styles.cardTitle}>Dashboard Sync Interval</div>
              <div className={styles.cardSub}>How often the backend syncs Blob Storage → Cosmos DB for all dashboard data</div>
            </div>
          </div>

          {syncLoading ? (
            <div className={styles.loading}><RefreshCw size={14} className={styles.spin} /> Loading…</div>
          ) : (
            <>
              <div className={styles.presetRow}>
                {DASH_PRESETS.map(m => (
                  <button
                    key={m}
                    className={`${styles.presetBtn} ${dashMin === m ? styles.presetActive : ''}`}
                    onClick={() => setDashMin(m)}
                  >
                    {m} min
                  </button>
                ))}
              </div>
              <div className={styles.customRow}>
                <Clock size={13} className={styles.inputIcon} />
                <input
                  type="number"
                  className={styles.numInput}
                  value={dashMin}
                  min={1} max={120}
                  onChange={e => setDashMin(Number(e.target.value))}
                />
                <span className={styles.inputUnit}>minutes</span>
              </div>
              <div className={styles.currentVal}>
                Current interval: <strong>{dashMin} minute{dashMin !== 1 ? 's' : ''}</strong>
              </div>
            </>
          )}
        </div>

        {/* ── Section 2: PIN Sync Time ────────────────────────────────── */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><Clock size={16} /></div>
            <div>
              <div className={styles.cardTitle}>PIN Management Sync Interval</div>
              <div className={styles.cardSub}>How often PIN data is synced from Blob Storage → Cosmos DB</div>
            </div>
          </div>

          {syncLoading ? (
            <div className={styles.loading}><RefreshCw size={14} className={styles.spin} /> Loading…</div>
          ) : (
            <>
              <div className={styles.presetRow}>
                {PIN_PRESETS.map(m => (
                  <button
                    key={m}
                    className={`${styles.presetBtn} ${pinMin === m ? styles.presetActive : ''}`}
                    onClick={() => setPinMin(m)}
                  >
                    {m} min
                  </button>
                ))}
              </div>
              <div className={styles.customRow}>
                <Clock size={13} className={styles.inputIcon} />
                <input
                  type="number"
                  className={styles.numInput}
                  value={pinMin}
                  min={1} max={60}
                  onChange={e => setPinMin(Number(e.target.value))}
                />
                <span className={styles.inputUnit}>minutes</span>
              </div>
              <div className={styles.currentVal}>
                Current interval: <strong>{pinMin} minute{pinMin !== 1 ? 's' : ''}</strong>
              </div>
            </>
          )}
        </div>

        {/* ── Save button spans both sync cards ──────────────────────── */}
        <div className={styles.saveRow}>
          {syncError && <span className={styles.errorMsg}>{syncError}</span>}
          {syncSaved  && <span className={styles.successMsg}><Check size={13} /> Settings saved and sync intervals updated.</span>}
          <button
            className={styles.saveBtn}
            onClick={handleSaveSync}
            disabled={syncSaving || syncLoading}
          >
            {syncSaving
              ? <><RefreshCw size={14} className={styles.spin} /> Saving…</>
              : <><Save size={14} /> Save Sync Settings</>}
          </button>
        </div>

        {/* ── Section 3: Tag Management ───────────────────────────────── */}
        <div className={`${styles.card} ${styles.cardFull}`}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><Tag size={16} /></div>
            <div>
              <div className={styles.cardTitle}>Tag Management</div>
              <div className={styles.cardSub}>Create, rename, or delete device tags. Changes apply everywhere tags are used.</div>
            </div>
          </div>

          {tagError && <div className={styles.errorMsg} style={{ marginBottom: 12 }}>{tagError}</div>}

          {/* Create new tag */}
          <div className={styles.createRow}>
            <input
              className={styles.tagInput}
              placeholder="New tag name (e.g. VVIP)"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
            />
            <button
              className={styles.createBtn}
              onClick={handleCreateTag}
              disabled={creating || !newTagName.trim()}
            >
              {creating ? <RefreshCw size={13} className={styles.spin} /> : <Plus size={13} />}
              {creating ? 'Creating…' : 'Add Tag'}
            </button>
          </div>

          {/* Tag list */}
          {tagsLoading ? (
            <div className={styles.loading}><RefreshCw size={14} className={styles.spin} /> Loading tags…</div>
          ) : (
            <div className={styles.tagList}>
              {tags.length === 0 && (
                <div className={styles.emptyTags}>No tags defined yet. Create one above.</div>
              )}
              {tags.map(tag => (
                <div key={tag} className={styles.tagRow}>
                  {renameState?.name === tag ? (
                    <>
                      <input
                        className={styles.renameInput}
                        value={renameState.value}
                        autoFocus
                        onChange={e => setRenameState({ name: tag, value: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameTag();
                          if (e.key === 'Escape') setRenameState(null);
                        }}
                      />
                      <button className={styles.iconBtnGreen} onClick={handleRenameTag} title="Save rename">
                        <Check size={13} />
                      </button>
                      <button className={styles.iconBtnGhost} onClick={() => setRenameState(null)} title="Cancel">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={styles.tagChip}>
                        <Tag size={11} /> {tag}
                      </span>
                      <button
                        className={styles.iconBtnGhost}
                        onClick={() => setRenameState({ name: tag, value: tag })}
                        title="Rename tag"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className={styles.iconBtnRed}
                        onClick={() => handleDeleteTag(tag)}
                        title="Delete tag"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 4: User Management ─────────────────────────────── */}
        <div className={`${styles.card} ${styles.cardFull}`}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><Users size={16} /></div>
            <div>
              <div className={styles.cardTitle}>User Management</div>
              <div className={styles.cardSub}>Add users and assign roles. Users log in with their username or email.</div>
            </div>
          </div>

          {userError && <div className={styles.errorMsg} style={{ marginBottom: 12 }}>{userError}</div>}
          {userSaved  && <div className={styles.successMsg} style={{ marginBottom: 12 }}><Check size={13} /> User created successfully.</div>}

          {/* ── Add new user form ── */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserPlus size={14} /> Add New User
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Username / Employee ID *</label>
                <input
                  className={styles.tagInput}
                  placeholder="e.g. 2000189894"
                  value={newUser.username}
                  onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Display Name</label>
                <input
                  className={styles.tagInput}
                  placeholder="e.g. Yamini G"
                  value={newUser.displayName}
                  onChange={e => setNewUser(p => ({ ...p, displayName: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Email</label>
                <input
                  className={styles.tagInput}
                  placeholder="e.g. user@hexaware.com"
                  value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Role *</label>
                <select
                  className={styles.tagInput}
                  value={newUser.role}
                  onChange={e => setNewUser(p => ({ ...p, role: e.target.value as UserRole }))}
                  style={{ cursor: 'pointer' }}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              className={styles.createBtn}
              onClick={handleCreateUser}
              disabled={creatingUser || !newUser.username.trim()}
            >
              {creatingUser ? <><RefreshCw size={13} className={styles.spin} /> Creating…</> : <><UserPlus size={13} /> Add User</>}
            </button>
          </div>

          {/* ── Existing users list ── */}
          {usersLoading ? (
            <div className={styles.loading}><RefreshCw size={14} className={styles.spin} /> Loading users…</div>
          ) : (
            <div className={styles.tagList}>
              {users.length === 0 && (
                <div className={styles.emptyTags}>No users found. Add one above.</div>
              )}
              {users.map(u => (
                <div key={u.id} className={styles.tagRow} style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{u.displayName || u.username}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.username}{u.email ? ` · ${u.email}` : ''}</div>
                  </div>
                  {editRole?.id === u.id ? (
                    <>
                      <select
                        className={styles.renameInput}
                        value={editRole.role}
                        onChange={e => setEditRole({ id: u.id, role: e.target.value })}
                        style={{ minWidth: 150 }}
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <button className={styles.iconBtnGreen} onClick={handleUpdateRole} title="Save">
                        <Check size={13} />
                      </button>
                      <button className={styles.iconBtnGhost} onClick={() => setEditRole(null)} title="Cancel">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{
                        padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                        background: 'color-mix(in srgb, var(--brand) 10%, transparent)',
                        color: 'var(--brand)', marginRight: 8,
                      }}>
                        <ShieldCheck size={10} style={{ marginRight: 4 }} />
                        {ROLE_LABELS[u.role as UserRole] ?? u.role}
                      </span>
                      <button
                        className={styles.iconBtnGhost}
                        onClick={() => setEditRole({ id: u.id, role: u.role })}
                        title="Edit role"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className={styles.iconBtnRed}
                        onClick={() => handleDeleteUser(u.id, u.displayName || u.username)}
                        title="Remove user"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
