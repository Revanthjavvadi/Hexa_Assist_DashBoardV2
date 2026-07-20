import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Wrench, ShieldCheck, Monitor,
  Search, Menu, X,
  ChevronRight, ClipboardList, KeyRound,
  RefreshCw, Clock, Crown, Settings
} from 'lucide-react';
import styles from './Layout.module.css';
import { checkHealth } from '../services/api';
import { triggerRefresh, getLastRefreshed, REFRESH_INTERVAL_MS } from '../hooks/useRefreshBus';
import { getSessionUser, canAccessPage, hasActiveTempAccess } from '../hooks/useAuth';
import { useTempAccess } from '../hooks/useTempAccess';
import UserProfileMenu from './UserProfileMenu';

interface LayoutProps {
  darkMode:   boolean;
  toggleDark: () => void;
}

const navItems = [
  { to: '/dashboard/overview',  label: 'Overview',              icon: LayoutDashboard },
  { to: '/dashboard/system',    label: 'System Info',           icon: Monitor },
  { to: '/dashboard/executive', label: 'Executive Devices',     icon: Crown },
  { to: '/dashboard/fixes',     label: 'Fixes',                 icon: Wrench },
  { to: '/dashboard/hip',       label: 'HIP Compliance',        icon: ClipboardList },
  { to: '/dashboard/pins',      label: 'PIN Management',        icon: KeyRound },
  { to: '/dashboard/security',  label: 'Security & Compliance', icon: ShieldCheck },
  { to: '/dashboard/admin',     label: 'Admin Center',    icon: Settings },
];

/** Format seconds into "Xm Ys" or "Xs" */
function fmtCountdown(seconds: number) {
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export default function Layout({ darkMode, toggleDark }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [searchVal,   setSearchVal]     = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(() => getLastRefreshed());
  const [countdown, setCountdown]       = useState(() => {
    // Initialise immediately from the bus so navigating between pages
    // never resets the visible countdown back to 5m 0s.
    const lr = getLastRefreshed();
    if (!lr) return REFRESH_INTERVAL_MS / 1000;
    const elapsed = Math.floor((Date.now() - lr.getTime()) / 1000);
    return Math.max(0, Math.floor(REFRESH_INTERVAL_MS / 1000) - elapsed);
  });

  const user = getSessionUser();
  const { grants: tempGrants } = useTempAccess();

  // Filter nav items by role + any active temp access grants
  const visibleNavItems = navItems.filter(item => {
    if (!user) return false;
    const page = item.to.split('/').pop() ?? '';
    return canAccessPage(user.role, page) || hasActiveTempAccess(tempGrants, page);
  });

  // ── Blob health probe — kept for internal blobReady state only ─────────────
  useEffect(() => {
    checkHealth().catch(() => {});
  }, []);

  // ── Sync the "last refreshed" time from the bus ─────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const lr = getLastRefreshed();
      setLastRefreshed(lr);
      if (lr) {
        const elapsed = Math.floor((Date.now() - lr.getTime()) / 1000);
        const remaining = Math.max(0, Math.floor(REFRESH_INTERVAL_MS / 1000) - elapsed);
        setCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Manual "Refresh Now" ────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    triggerRefresh();
    // Visual feedback — reset after 3 s
    setTimeout(() => setIsRefreshing(false), 3000);
  }, [isRefreshing]);

  const lastRefreshedLabel = lastRefreshed
    ? lastRefreshed.toLocaleTimeString('en-GB', { hour12: false })
    : null;

  return (
    <div className={`${styles.shell} ${sidebarOpen ? styles.open : styles.collapsed}`}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <img src="/HEXT.NS.ico" alt="Hexaware" className={styles.logoImg} />
            {sidebarOpen && (
              <div className={styles.logoTextWrap}>
                <span className={styles.logoText}>HEXA ASSIST</span>
                <span className={styles.logoSub}>Powered by Systems Technology Group</span>
              </div>
            )}
          </div>
          <button className={styles.collapseBtn} onClick={() => setSidebarOpen(p => !p)} aria-label="Toggle sidebar">
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {sidebarOpen && user && (
          <div className={styles.roleTag}>
            <span>{user.displayName}</span>
          </div>
        )}

        <nav className={styles.nav}>
          {visibleNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }>
              <Icon size={18} className={styles.navIcon} />
              {sidebarOpen && <span>{label}</span>}
              {sidebarOpen && <ChevronRight size={14} className={styles.navChevron} />}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          {/* Logout is available in the UserProfileMenu (top-right avatar) */}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className={styles.main}>
        {/* ── Top header ── */}
        <header className={styles.header}>
          <div className={styles.searchBox}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search devices, fixes, users…"
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
            />
          </div>

          {/* ── Sync status strip ── */}
          <div className={styles.syncInfo}>
            <Clock size={12} className={styles.syncIcon} />
            {lastRefreshedLabel
              ? <span className={styles.syncTs}>Synced {lastRefreshedLabel}</span>
              : <span className={styles.syncTs}>Not synced yet</span>
            }
            <span className={styles.syncCountdown} title="Next auto-refresh">
              Next: {fmtCountdown(countdown)}
            </span>
            <button
              className={`${styles.syncBtn} ${isRefreshing ? styles.syncBtnSpin : ''}`}
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh all dashboard data now"
              aria-label="Refresh now"
            >
              <RefreshCw size={13} className={isRefreshing ? styles.spinIcon : ''} />
              {isRefreshing ? 'Syncing…' : 'Refresh Now'}
            </button>
          </div>

          <div className={styles.headerRight}>
            <UserProfileMenu darkMode={darkMode} toggleDark={toggleDark} />
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
