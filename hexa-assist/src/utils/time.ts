/**
 * IST (Indian Standard Time) timestamp formatter — UTC+5:30
 * Used across all dashboard pages for consistent timestamp display.
 */

const IST_LOCALE   = 'en-IN';
const IST_TIMEZONE = 'Asia/Kolkata';

/** Full date + time in IST: "29 Jun 2026, 10:13:15 IST" */
export function toIST(value: string | null | undefined): string {
  if (!value || value === '—') return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const formatted = d.toLocaleString(IST_LOCALE, {
      timeZone: IST_TIMEZONE,
      day:      '2-digit',
      month:    'short',
      year:     'numeric',
      hour:     '2-digit',
      minute:   '2-digit',
      second:   '2-digit',
      hour12:   false,
    });
    return `${formatted} IST`;
  } catch {
    return value;
  }
}

/** Short date only in IST: "29 Jun 2026" */
export function toISTDate(value: string | null | undefined): string {
  if (!value || value === '—') return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString(IST_LOCALE, {
      timeZone: IST_TIMEZONE,
      day:      '2-digit',
      month:    'short',
      year:     'numeric',
    });
  } catch {
    return value;
  }
}
