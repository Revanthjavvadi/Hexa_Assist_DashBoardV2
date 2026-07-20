import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Shield, Lock, User, Loader2, AlertCircle } from 'lucide-react';
import bannerVideo from '../brand/hexassist_banner_4k.mp4';
import styles from './Landing.module.css';
import { apiLogin } from '../services/api';

export default function Landing() {
  const navigate = useNavigate();
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');   // kept for UI/future Entra ID
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError('Please enter your username.'); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiLogin(username.trim());
      if (res.success) {
        navigate('/dashboard/overview');
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'User not found. Please check your username.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSOLogin = () => {
    // Placeholder — will be replaced with Microsoft Entra ID redirect
    navigate('/dashboard/overview');
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgGrid} />
      <div className={styles.bgGlow} />

      {/* Top-left branding */}
      <div className={styles.topBranding}>
        <img src="/HEXT.NS.ico" alt="Hexaware" className={styles.hexIcon} />
        <div>
          <h1 className={styles.title}>HEXA ASSIST DASHBOARD</h1>
          <p className={styles.tagline}>Powered by Systems Technology Group</p>
        </div>
      </div>

      <div className={styles.container}>
        {/* Left side - Video */}
        <div className={styles.leftSide}>
          <div className={styles.illustrationWrap}>
            <video
              src={bannerVideo}
              className={styles.illustration}
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
        </div>

        {/* Right side - Login Box */}
        <div className={styles.rightSide}>
          <div className={styles.loginBox}>
            <div className={styles.loginHeader}>
              <div className={styles.loginIconWrap}>
                <Lock size={20} />
              </div>
              <div>
                <h2 className={styles.loginTitle}>Welcome Back</h2>
                <p className={styles.loginSubtitle}>Sign in to continue</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className={styles.loginForm}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Username</label>
                <div className={styles.inputWrap}>
                  <User size={16} className={styles.inputIcon} />
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Password</label>
                <div className={styles.inputWrap}>
                  <Lock size={16} className={styles.inputIcon} />
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                className={`${styles.loginBtn} ${isLoading ? styles.loginBtnLoading : ''}`}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className={styles.spinner} />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn size={16} />
                    <span>Sign In</span>
                  </>
                )}
              </button>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginTop: 4 }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}
            </form>

            <div className={styles.divider}>
              <span>or continue with</span>
            </div>

            <button className={styles.ssoBtn} onClick={handleSSOLogin}>
              <Shield size={16} />
              Login with Microsoft SSO
            </button>
          </div>
        </div>
      </div>

      {/* Footer info strip */}
      <div className={styles.footerInfo}>
        <div className={styles.footerItems}>
          <span className={styles.footerItem}>Fix IT issues in minutes with guided self-resolution</span>
          <span className={styles.footerDot}>·</span>
          <span className={styles.footerItem}>Resolve common IT issues without raising a ticket</span>
          <span className={styles.footerDot}>·</span>
          <span className={styles.footerItem}>Hexa Assist Fixes IT issues anytime, without waiting for suppor Team</span>
        </div>
        <p className={styles.footerCopy}>© 2026 Hexaware Technologies · Systems Technology Group</p>
      </div>
    </div>
  );
}
