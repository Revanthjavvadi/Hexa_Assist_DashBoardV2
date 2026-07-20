// Recharts tooltip formatters (typed to satisfy strict mode)
export const fmtNum = (v: unknown) => Number(v).toLocaleString();
export const fmtPct = (v: unknown) => `${v}%`;
export const fmtMin = (v: unknown) => `${v} min`;
export const fmtGB  = (v: unknown) => `${v} GB`;
export const fmtM   = (v: unknown) => `${v}M`;
