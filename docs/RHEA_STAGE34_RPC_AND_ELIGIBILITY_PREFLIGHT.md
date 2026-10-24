# Stage 34 — bounded RPC resilience and single-block candidate preflight

## Why this stage

Stage 30 verified 72,782 Rhea mainnet accounts and 7,801 outstanding-debt accounts at one finalized block. Stage 32 attempted active-Pyth repricing of 320 historical borrowers and found one paper-risk account (`godlike.near`, ~89.08% health) but 276 unreadable records. Stage 33 rechecked 13 accounts, with several HTTP rate limits/timeouts and token/feed metadata failures.

## Implementation

- `ResilientNearReadOnlyRpc` wraps **view-only** NEAR calls. It retries only transport/network timeouts or explicitly retryable HTTP 429/5xx, respecting Retry-After within a bounded max delay. Contract/schema, price confidence, cross-block or source-parity errors are never retried away.
- Identical **pinned-block** account/function calls coalesce and cache for one bounded worker instance, with cloned returned values. Finality/unpinned reads always bypass the cache and cannot accidentally turn a historic quote into a fresh one.
- Stage31 and Stage32 screening CLIs and Stage33 diagnostics use the reusable transport. The chain scanner's historical, source-pinned evidence and the Pyth evaluator's own freshness checks remain intact.
- `inspectStage34Candidate` takes a new finalized lending height and passes that **exact height** to the active Pyth valuation and current deployed entry probes, pins all three code hashes, and compares position counts, debt assets and source-referenced paper health. It does **not** create atomic repay amounts.
- The GitHub Action automatically tests `godlike.near` when this file is merged. Result may show a healthy borrower, a reference-at-risk borrower, or a blocked oracle/RPC response. It never labels any of these *executable* liquidations.

## Evidence and next step

Inspect `.github/workflows/rhea-stage34-resilient-candidate-preflight.yml` for live JSON artifact, including sanitized errors and RPC statistics. Use `npm run check` and `tests/rhea-stage34-readonly-retry-candidate.test.mjs` for regression evidence.

**Still required for real liquidation:** independently verify the actual deployed `Liquidate` rules and repayment/repurchase paths, prove exact atomic sizing and collateral/seize limits, execute the whole call in a full-fidelity local NEAR Sandbox state with receipts and balances, obtain financing and swap quotes, calculate failure/gas/slippage costs, and configure an owner-approved secure signer with loss caps.

No mainnet signer, transaction broadcast or verified net profit in Stage 34. No PDF.
