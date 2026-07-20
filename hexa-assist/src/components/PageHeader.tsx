import styles from './PageHeader.module.css';
import { type ReactNode } from 'react';
import hexWordmark from '../brand/hexaware-wordmark-small.svg';

interface PageHeaderProps {
  title:     string;
  subtitle?: string;
  actions?:  ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <span className={styles.sep} aria-hidden="true">|</span>
          <img
            src={hexWordmark}
            alt="Hexaware"
            className={styles.wordmark}
          />
        </div>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
