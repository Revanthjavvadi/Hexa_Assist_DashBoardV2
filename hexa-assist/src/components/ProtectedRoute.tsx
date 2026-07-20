import { Navigate } from 'react-router-dom';
import { getSessionUser, canAccessPage } from '../hooks/useAuth';
import { useTempAccess } from '../hooks/useTempAccess';

interface Props {
  page: string;
  children: React.ReactNode;
}

/**
 * Redirects to / if not logged in.
 * Shows a permission message if the user's role doesn't cover the page
 * AND there is no active temporary access grant for it.
 */
export default function ProtectedRoute({ page, children }: Props) {
  const user = getSessionUser();
  const { hasTempPage } = useTempAccess();

  if (!user) return <Navigate to="/" replace />;

  const hasAccess = canAccessPage(user.role, page) || hasTempPage(page);

  if (!hasAccess) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '60vh', gap: 12,
        color: 'var(--text-secondary)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          Access Restricted
        </h2>
        <p style={{ fontSize: 14, maxWidth: 380 }}>
          You do not have permission to access this page.
          Contact your administrator to request access.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Logged in as <strong>{user.displayName}</strong> · Role: <strong>{user.role.replace('_', ' ')}</strong>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
