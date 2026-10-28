# Stage182 — adaptive operations workspace

This implementation replaces the permanent two-column dashboard with evidence-driven layouts for the current environment.

## Screen composition

- **Global mode:** Sandbox, Testnet and Mainnet share a compact header control. Selection persists when moving among client-side routes, and the data loader remains environment-scoped. Network selection does not enable unauthorized execution.
- **Idle:** Financing form and activity occupy the primary width. No verified balance, proceeds, cost or P&L means no wallet summary and no reserved empty second column. GitHub Sandbox research is reduced to one expandable line, with original workflow links retained.
- **Running:** A confirmed server session reveals a current-session panel. Source-backed activity shows immediately from SSE; the relevant results panel displays only numbers supplied by actual accounting evidence. The live feed has more room and existing Pause/Stop protections remain.
- **Completed or interrupted:** Original start/end times, last recorded operation and failure detail are preserved. A session being completed is not evidence of realized profits; original receipts and financing costs must still be reconciled.
- **Detail routes:** Full-width searchable Live Operations journal, borrower evidence list with sortable labels, searchable transaction receipts, reconciled-only Performance summary, environment-specific Wallet, and readiness Settings. Analytics is a redirect to Performance; Transactions remain directly accessible from Live Operations. Original source/receipt JSON remains expandable.

## Verified frontend behavior

The absence test in `tests/dashboard-adaptive-workspace.test.mjs` ensures that null/unknown accounting never renders a financial sidebar while a genuine reported zero is not mistaken for missing data. UI states are driven by backend session statuses and accounting records, not random timers or fabricated profit. Tests and `npm run check` must pass before merging.

## Hosting and execution limits

Vercel uses `VITE_ARBIVANE_PREVIEW=true` and remains intentionally frontend-only: it displays the real application structure and public GitHub workflow metadata, but cannot run a lender, sign or withdraw tokens. Render Free is authenticated and can serve the Node API, but without durable financial storage and configured Workspaces credentials/capacity it cannot honestly advertise fully automated, withdrawable test or real Mainnet balances.

Passing GitHub Actions checks does not establish profitable liquidation. Mainnet spending and unsupported wallet transfers stay locked. Realized P&L charts require verified multi-point accounting history; Stage182 does not invent a line chart.
