# Stage 62 — retain the authenticated Rhea scan queue under GitHub Actions concurrency

## Observed blocker
The Stage42 workflow previously used a single `arbivane-stage42-${{ github.ref }}` concurrency group with `cancel-in-progress: false`. That flag protects the **running** workflow but does **not** preserve older **pending** runs: GitHub's default `queue: single` replaces an already pending workflow whenever a new one joins the group. Repeated `main` pushes, manual launches and Stage47 self-dispatches could therefore evict a previously verified future borrower window before it even started.

## Superseded recovery
Live run evidence later showed that a pending push run was still cancelled when a newer push entered the concurrency group. Stage63 therefore removes the fixed-cursor push triggers entirely. Stage42 remains available for explicit, contiguous self-dispatch; the dedicated Stage63 recovery workflow owns scheduled, disjoint cursor progress and derives its bounded attempt number from completed workflow history.

Also expose Stage60's real retry attempt/recovery counts in each 80-borrower shard summary.

## Safety, limits and claims
- **No new scanner, fabricated opportunities, spend, or mainnet signer.** Every Stage42 window still requires four source-authenticated 80-account reads, full Stage42 reconciliation and Stage47 matching cursor before submitting another window.
- Repeated `main` pushes no longer launch Stage40/42 scans at their historical default cursors.
- Stage63 uses one concurrency group, at most two RPC shards in parallel, an 18-attempt budget, a six-hour scheduled fallback, and self-dispatch only while no verified settlement exists and budget remains.
- Any Stage37 actual liquidation call remains **isolated Sandbox-only and contingent on authentic Stage35 source-positive evidence**, Stage55/56 receipt and balance checks. Mainnet transaction signing and profits remain unverified and disabled.

## Acceptance
`tests/rhea-stage47-market-continuation.test.mjs` asserts duplicate push removal, the existing finite continuation and no mainnet signing. GitHub Actions safety/typecheck and optional compatibility evidence must succeed before merge. Successful tests prove scheduling configuration, **not** completed multi-thousand borrower coverage or realized liquidation profit.
