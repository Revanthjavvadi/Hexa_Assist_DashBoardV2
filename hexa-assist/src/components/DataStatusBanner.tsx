/**
 * DataStatusBanner — intentionally disabled.
 * The global sync strip in the Layout header (Synced HH:MM:SS | Next: Xm Ys)
 * already provides refresh status for the whole dashboard.
 * This component is kept as a no-op so existing page imports compile cleanly.
 */

interface Props {
  loading:     boolean;
  error:       string | null;
  live:        boolean;
  lastUpdated: Date | null;
  onRefresh:   () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function DataStatusBanner(_props: Props) {
  return null;
}
