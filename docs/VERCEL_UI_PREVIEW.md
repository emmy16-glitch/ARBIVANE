# ARBIVANE UI review on Vercel

Vercel serves a **static frontend-only review** of the current ARBIVANE React interface. It uses `VITE_ARBIVANE_PREVIEW=true` at Vite build time (configured in vercel.json), so `dashboard/web/src/api.ts` returns clearly empty, environment-specific states **without fetching any backend data**. Every command is fail-closed, and no signing, deposits, withdrawals, fake blockchain events, balances, P&L or live engine statistics can be created by this preview.

This is NOT a replacement for the authenticated Node/SSE backend on Render, and cannot execute actual Sandbox/Testnet/Mainnet operations. Use it to inspect desktop/mobile visual hierarchy, navigation, editing interactions and truthful empty states. The highlighted preview banner explains this distinction.

Production backend builds `npm run build:dashboard` without the preview flag. This keeps Render authentication and original SSE behavior unchanged.

Vercel build settings: Vite, repo root, `VITE_ARBIVANE_PREVIEW=true npm run build:dashboard`, output `dashboard/web/dist`, Node.js 22.x; client-side route fallbacks in vercel.json.
