# Stage184 — Cross-page UX and reliability audit

This changes the actual React routes in `dashboard/web/src/App.tsx`, not only the Automation card.

## Corrected pages

- **Live Operations:** Keeps the complete existing searchable source-event journal. SSE subscriptions are closed on unmount/environment switch; original persisted events are reconciled every 30 seconds while the page is open, so an interrupted event connection is not silently treated as permanent emptiness. Real reconnect state remains visible even if a separate HTTP request succeeds. Explicit Retry renews the data subscription and cannot commit a stale response from an earlier environment.
- **Opportunities:** Retains source-only borrower filters, sorting, and expandable original evidence. Search/filter data stays within the chosen environment.
- **Performance:** Unreconciled figures remain hidden; only the existing backend's reconciled values show. Layout scales from desktop to phone without inventing a chart.
- **Wallet:** Replaces the outdated, oversized record grid and permanently disabled transaction buttons with compact actual status/account/asset rows, a concise empty state and explicit custody limitation. Sandbox-only inventory is not presented as withdrawable Mainnet profit.
- **Settings:** Replaces a raw multiline dump with aligned network status and capabilities. Requirements are progressively disclosed in an expandable section, using readable labels and clear missing/available statuses.
- **Transactions:** Retains the searchable expandable receipt table, with consistent responsive rows and keyboard focus states.
- **Dashboard:** Keeps Stage183's two-column Automation layout. The form/filter elements are keyed by environment so changing networks resets unsaved cross-network UI state rather than leaking a previous mode's selection.

## Checks

`tests/dashboard-route-ux.test.mjs` tests that all routes and responsiveness/reconnection guards are retained. The repository's full CI runs type checks, Vite build and Node tests. These checks do **not** replace actual cross-browser screenshots; visual QA is still necessary when a browser can access the Vercel site.

## Financial honesty

No fake wallet balances, profits, tokens, liquidations, or executions have been added. Vercel is still a frontend-only preview and cannot launch a Workspaces bot. Render Free still lacks durable financial storage and live funding. Mainnet spending stays disabled.
