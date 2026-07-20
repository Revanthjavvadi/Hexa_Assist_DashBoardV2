import { type LucideIcon } from 'lucide-react';
import styles from './KpiCard.module.css';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  accent?: 'blue' | 'green' | 'red' | 'yellow' | 'default';
  subtitle?: string;
}

export default function KpiCard({ label, value, icon: Icon, trend, trendUp, accent = 'default', subtitle }: KpiCardProps) {
  return (
    <div className={`${styles.card} ${styles[accent]}`}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        <div className={`${styles.iconWrap} ${styles[`icon_${accent}`]}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className={styles.value}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      {trend && (
        <div className={`${styles.trend} ${trendUp ? styles.up : styles.down}`}>
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}
    </div>
  );
}
