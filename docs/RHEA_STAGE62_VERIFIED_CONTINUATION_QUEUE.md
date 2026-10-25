# Stage 62 — retain the authenticated Rhea scan queue under GitHub Actions concurrency

## Observed blocker
The Stage42 workflow previously used a single `arbivane-stage42-${{ github.ref }}` concurrency group with `cancel-in-progress: false`. That flag protects the **running** workflow but does **not** preserve older **pending** runs: GitHub's default `queue: single` replaces an already pending workflow whenever a new one joins the group. Repeated `main` pushes, manual launches and Stage47 self-dispatches could therefore evict a previously verified future borrower window before it even started.

## Fix
Enable GitHub Actions' documented `queue: max` while keeping the **same** cross-window group and `cancel-in-progress: false`. This permits up to 100 pending runs to line up instead of replacing each other; only one workflow in the group can run at a time. It avoids increasing simultaneous RPC pressure against the already rate-limited NEAR/Rhea endpoint, while allowing the existing bounded continuation to proceed after unrelated code merges. A full Stage59 continuation is only 20 windows (initial + 19 followups), subject to the authenticated Stage30 7,801-account inventory and the existing exactly-contiguous Stage47 validation.

Also expose Stage60's real retry attempt/recovery counts in each 80-borrower shard summary.

## Safety, limits and claims
- **No new scanner, fabricated opportunities, spend, or mainnet signer.** Every Stage42 window still requires four source-authenticated 80-account reads, full Stage42 reconciliation and Stage47 matching cursor before submitting another window.
- `queue: max` is supported in GitHub Actions as of May 7, 2026; the documented queue cap is 100 pending runs. Capacity is not unlimited, and a failed upstream workflow will still halt its own followup.
- Repeated `main` pushes may queue duplicate **starting** windows. This patch preserves them rather than automatically collapsing or cancelling them; rate limits, GitHub minutes, retention, and duplicates remain costs.
- Any Stage37 actual liquidation call remains **isolated Sandbox-only and contingent on authentic Stage35 source-positive evidence**, Stage55/56 receipt and balance checks. Mainnet transaction signing and profits remain unverified and disabled.

## Acceptance
`tests/rhea-stage47-market-continuation.test.mjs` asserts retained queue semantics, the existing finite continuation and no mainnet signing. GitHub Actions safety/typecheck and optional compatibility evidence must succeed before merge. Successful tests prove scheduling configuration, **not** completed multi-thousand borrower coverage or realized liquidation profit.
