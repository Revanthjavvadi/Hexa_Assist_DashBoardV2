import { type ReactNode } from 'react';
import styles from './ChartCard.module.css';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  span?: 1 | 2;
}

export default function ChartCard({ title, subtitle, children, action, span = 1 }: ChartCardProps) {
  return (
    <div className={`${styles.card} ${span === 2 ? styles.span2 : ''}`}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {action && <div className={styles.action}>{action}</div>}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
