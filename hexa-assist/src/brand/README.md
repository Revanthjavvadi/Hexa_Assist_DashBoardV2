# Brand Assets

This folder contains all Hexaware branding assets used throughout the dashboard.

## How to update the logo

1. Replace `hexaware-mark.svg` with the new H mark logo (keep filename the same)
2. Replace `hexaware-wordmark.svg` with the new HEXAWARE text logo (keep filename the same)
3. The favicon is at `../../public/favicon.svg` — replace it too if needed

All components import from this folder:
- `Layout.tsx` — uses `hexaware-mark.svg` in the sidebar
- `PageHeader.tsx` — uses `hexaware-wordmark-small.svg` beside page titles
- `Landing.tsx` — uses both assets on the landing page

## Files
| File | Usage | Size |
|---|---|---|
| `hexaware-mark.svg` | Sidebar logo mark (H icon) | 28×30px rendered |
| `hexaware-wordmark.svg` | Full "HEXAWARE" text logo | sidebar expanded |
| `hexaware-wordmark-small.svg` | Compact wordmark for page headers | 80×18px rendered |

## Brand colours
- Primary blue: `#3333CC`
- Background: transparent (works on light and dark themes)
