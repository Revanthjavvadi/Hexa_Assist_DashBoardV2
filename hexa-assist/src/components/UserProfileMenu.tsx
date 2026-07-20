import { useState, useRef, useEffect } from 'react';
import {
  User, Info, LogOut, Sun, Moon,
  ChevronRight, X, Mail, Briefcase
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from './UserProfileMenu.module.css';
import { getSessionUser, clearSessionUser, ROLE_LABELS } from '../hooks/useAuth';
import { apiLogout } from '../services/api';

interface UserProfileMenuProps {
  darkMode: boolean;
  toggleDark: () => void;
}

/** Derive initials from a display name (e.g. "Sneha V" → "SV") */
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

type ActiveModal = null | 'profile' | 'about';

export default function UserProfileMenu({ darkMode, toggleDark }: UserProfileMenuProps) {
  const [menuOpen, setMenuOpen]       = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const menuRef  = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Read real session user from cookie
  const sessionUser = getSessionUser();
  const displayName = sessionUser?.displayName ?? 'Unknown User';
  const email       = sessionUser?.email ?? '';
  const roleLabel   = sessionUser ? (ROLE_LABELS[sessionUser.role] ?? sessionUser.role) : '';
  const initials    = getInitials(displayName) || '?';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Close modal on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setActiveModal(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const openModal = (modal: ActiveModal) => {
    setActiveModal(modal);
    setMenuOpen(false);
  };

  const closeModal = () => setActiveModal(null);

  const handleLogout = async () => {
    setMenuOpen(false);
    await apiLogout().catch(() => {});
    clearSessionUser();
    navigate('/');
  };

  return (
    <>
      {/* ── Avatar button ── */}
      <div className={styles.wrap} ref={menuRef}>
        <button
          className={styles.avatar}
          onClick={() => setMenuOpen(p => !p)}
          aria-label="User menu"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          {initials}
        </button>

        {/* ── Dropdown menu ── */}
        {menuOpen && (
          <div className={styles.dropdown} role="menu">
            {/* User identity header */}
            <div className={styles.dropHeader}>
              <div className={styles.dropAvatar}>{initials}</div>
              <div className={styles.dropUserInfo}>
                <span className={styles.dropName}>{displayName}</span>
                <span className={styles.dropEmail}>{email}</span>
              </div>
            </div>

            <div className={styles.divider} />

            {/* Profile */}
            <button className={styles.menuItem} role="menuitem" onClick={() => openModal('profile')}>
              <User size={15} className={styles.menuIcon} />
              <span>Profile</span>
              <ChevronRight size={13} className={styles.menuChevron} />
            </button>

            {/* Appearance — dark/light toggle */}
            <button className={styles.menuItem} role="menuitem" onClick={toggleDark}>
              {darkMode
                ? <Sun  size={15} className={styles.menuIcon} />
                : <Moon size={15} className={styles.menuIcon} />
              }
              <span>Appearance</span>
              <span className={styles.modeTag}>{darkMode ? 'Light' : 'Dark'}</span>
            </button>

            {/* About */}
            <button className={styles.menuItem} role="menuitem" onClick={() => openModal('about')}>
              <Info size={15} className={styles.menuIcon} />
              <span>About</span>
              <ChevronRight size={13} className={styles.menuChevron} />
            </button>

            <div className={styles.divider} />

            {/* Logout */}
            <button className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem" onClick={handleLogout}>
              <LogOut size={15} className={styles.menuIcon} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Backdrop (shared) ── */}
      {activeModal && (
        <div
          className={styles.backdrop}
          onClick={closeModal}
          aria-hidden="true"
        />
      )}

      {/* ══════════════════════════════════════
          Profile modal
      ══════════════════════════════════════ */}
      {activeModal === 'profile' && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-label="Profile"
        >
          {/* Modal header */}
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>Profile</h2>
            <button className={styles.modalClose} onClick={closeModal} aria-label="Close">
              <X size={17} />
            </button>
          </div>

          {/* Avatar hero */}
          <div className={styles.profileHero}>
            <div className={styles.profileAvatarLg}>{initials}</div>
            <div className={styles.profileHeroInfo}>
              <span className={styles.profileFullName}>{displayName}</span>
              <span className={styles.profileRole}>{roleLabel}</span>
            </div>
          </div>

          {/* Details grid */}
          <p className={styles.detailsLabel}>User Details</p>
          <div className={styles.detailsGrid}>
            <div className={styles.detailCard} style={{ gridColumn: '1 / -1' }}>
              <User size={14} className={styles.detailIcon} />
              <div>
                <span className={styles.detailKey}>Display Name</span>
                <span className={styles.detailVal}>{displayName}</span>
              </div>
            </div>
            <div className={styles.detailCard} style={{ gridColumn: '1 / -1' }}>
              <Mail size={14} className={styles.detailIcon} />
              <div>
                <span className={styles.detailKey}>Email</span>
                <span className={styles.detailVal}>{email || '—'}</span>
              </div>
            </div>
            <div className={styles.detailCard} style={{ gridColumn: '1 / -1' }}>
              <Briefcase size={14} className={styles.detailIcon} />
              <div>
                <span className={styles.detailKey}>Role</span>
                <span className={styles.detailVal}>{roleLabel}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          About modal
      ══════════════════════════════════════ */}
      {activeModal === 'about' && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-label="About Hexa Assist"
        >
          {/* Modal header */}
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>About</h2>
            <button className={styles.modalClose} onClick={closeModal} aria-label="Close">
              <X size={17} />
            </button>
          </div>

          {/* App identity */}
          <div className={styles.aboutLogo}>
            <img src="/HEXT.NS.ico" alt="Hexa Assist" className={styles.aboutIcon} />
            <div>
              <span className={styles.aboutName}>Hexa Assist</span>
              <span className={styles.aboutVersion}>v1.0.0 · Systems Technology Group</span>
            </div>
          </div>

          <p className={styles.aboutDesc}>
            Hexa Assist is your personal IT support tool. It helps you fix common computer
            problems quickly and easily — without needing to call the IT helpdesk or wait for
            support. Just click, and the tool handles the rest.
          </p>

          <div className={styles.aboutCards}>
            <div className={styles.aboutCard}>
              <span className={styles.aboutCardTitle}>Fix Issues Instantly</span>
              <span className={styles.aboutCardBody}>Resolve everyday IT problems on your own — no IT ticket, no waiting.</span>
            </div>
            <div className={styles.aboutCard}>
              <span className={styles.aboutCardTitle}>Always Up to Date</span>
              <span className={styles.aboutCardBody}>The tool automatically stays current so you always have the latest fixes available.</span>
            </div>
            <div className={styles.aboutCard}>
              <span className={styles.aboutCardTitle}>Safe & Secure</span>
              <span className={styles.aboutCardBody}>All fixes are pre-approved and securely managed by the IT team — safe to use anytime.</span>
            </div>
          </div>

          <div className={styles.aboutFooter}>
            <span>© 2026 Hexaware Technologies</span>
            <span className={styles.aboutFooterDot}>·</span>
            <span>Systems Technology Group</span>
          </div>
        </div>
      )}
    </>
  );
}
