import styles from './StatusBadge.module.css';

type Status = 'Success' | 'Failed' | 'Pending' | 'Healthy' | 'Warning' | 'Critical' | 'Offline' | 'Compliant' | 'Non-Compliant' | string;

export default function StatusBadge({ status }: { status: Status }) {
  const cls = (() => {
    switch (status) {
      case 'Success': case 'Healthy': case 'Compliant': return styles.green;
      case 'Failed': case 'Critical': case 'Non-Compliant': return styles.red;
      case 'Pending': case 'Warning': return styles.yellow;
      case 'Offline': return styles.grey;
      default: return styles.grey;
    }
  })();
  return <span className={`${styles.badge} ${cls}`}>{status}</span>;
}
