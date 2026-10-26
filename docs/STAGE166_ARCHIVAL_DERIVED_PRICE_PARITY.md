# Stage166 — Pinned archival NEAR price-ratio parity recovery

## Original failure and source evidence

The newest [Stage157 larger-source run #40387459139](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40387459139) completed its CI workflow successfully but the preserved **original actual Sandbox attempt** does **not** show a liquidation. Artifact #12683120600 records a true source-qualified, same-token LiNEAR borrower `fukaih.near` at source block `221732739`, with a tiny paper gross spread. The Stage165 borrower-scoped dependency import completed all five contracts, including `meta-pool.near` with **62,971** state keys, same pinned block hash `EU1ouKQxFVyPNjVHPSsvHo3ntqUfRTxLYfULtk9bp3wo`. Stage51 original Pyth quote and LiNEAR ratio parity passed. The replay then failed before funding or liquidation with `STAGE164_PINNED_SOURCE_RATIO_VIEW_FAILED` during the additional derived-price parity gate. The prior Stage164 global graph and missing meta-pool issues have already been separately fixed.

This failed pinned **read** after a lengthy state clone is not sufficient proof of an invalid contract or liquidation, and successful CI alone is not evidence of settlement. The old Stage164 code reused the normal head/mainnet RPC to fetch historic, pinned auxiliary derived prices, even when the replay already had access to archival endpoints.

## Stage166 repair

- Use explicitly independent read-only **archival** NEAR RPCs for the original pinned `get_st_near_price`, `ft_price` and other source-authenticated derived-price views, rather than depending on a regular head RPC serving old state after a long import.
- Retain the exact original finalized source `blockHeight` for both archive providers and for the local Sandbox clone. Retry transient network failures with a bounded delay, and only switch to the secondary archival provider for genuine timeout/429/5xx failures.
- Reject protocol/contract failures, price changes, zero/invalid ratios, inconsistent block heights and missing cloned contracts **without fallback**, and keep the original Stage51 Pyth parity and Stage52 actor/financing gates.
- Write `stage166-pinned-pricing-read-diagnostics.json` after each source-to-clone comparison, including any failed comparison. It contains only authenticated contract IDs, methods, fixed status codes and whether archival fallback was used; no RPC URLs, provider credentials, arbitrary error messages or price values.
- Preserve the new record with the source/discovery/Sandbox archive for both Stage157 workflows. Add tests for genuine 429/503 recovery, a failed independent archival provider, forged block, source panic, mismatched ratio, missing method/contract and ordering before any Sandbox transaction.

This fix does not imply the historical Rhea callback can now succeed. Original `FINAL` receipts, actor debt/shares, actual balances, funding loan principal **plus all fees and interest**, valid oracle age and safe asset permissions must still be verified. A blocked archival source or differing quote stays blocked. No on-chain mainnet signing/spending (`EXECUTION_ENABLED=false`). No financial amount floor was reintroduced.

## Validation

- Stage166 PR full Safety and type checks pass, including the comprehensive Stage164/165/166 regression suite.
- Merge to `main` only after green CI, triggering fresh source/discovery and independent Sandbox runs.
- Inspect the **original artifacts**, especially `stage166-pinned-pricing-read-diagnostics.json`, `stage164-derived-price-parity.json`, `stage55-sandbox-phase-evidence.json`, `stage56-sandbox-attempt-evidence.json` and `stage129-finalized-transaction.json` if submitted.
- Never equate a green workflow with settled liquidation or positive economic profit.
