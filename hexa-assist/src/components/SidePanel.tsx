import { type ReactNode, useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2 } from 'lucide-react';
import styles from './SidePanel.module.css';
import { captureScreenshot } from '../utils/screenshot';

interface SidePanelProps {
  open:      boolean;
  onClose:   () => void;
  title:     string;
  subtitle?: string;
  children:  ReactNode;
  width?:    number;
  /** Device hostname for the screenshot filename. If provided, a Screenshot button is shown. */
  screenshotName?: string;
}

export default function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 480,
  screenshotName,
}: SidePanelProps) {
  const panelRef                  = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleScreenshot = async () => {
    if (!panelRef.current || capturing) return;
    setCapturing(true);
    try {
      await captureScreenshot(panelRef.current, screenshotName ?? title);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <>
      {open && <div className={styles.overlay} onClick={onClose} />}
      <div
        ref={panelRef}
        className={`${styles.panel} ${open ? styles.open : ''}`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>

          <div className={styles.headerActions}>
            {screenshotName && (
              <button
                className={styles.screenshotBtn}
                onClick={handleScreenshot}
                disabled={capturing}
                title="Download screenshot as PNG"
                aria-label="Take screenshot"
              >
                {capturing
                  ? <Loader2 size={14} className={styles.spin} />
                  : <Camera size={14} />}
                {capturing ? 'Saving…' : 'Screenshot'}
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}
