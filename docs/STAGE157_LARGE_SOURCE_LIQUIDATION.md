# Stage157 — source-backed large Rhea liquidation search

**Objective:** identify and (only if truly qualified) execute a *materially larger liquidation* in isolated NEAR Workspaces Sandbox. This is not a larger loan against the old tiny borrower.

## Existing evidence and why large borrowing alone is insufficient

- The Stage150 genuine original 10-test-LiNEAR run fully repaid the temporary Rhea partner with zero borrowed shares; see [#40363964469](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40363964469).
- The Stage151 genuine original 100-test-LiNEAR run returned principal but left a financing shortfall because liquidation proceeds stayed almost constant. See [#40363964208](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40363964208) and [Stage154 original finance analysis](STAGE154_ORIGINAL_FINANCING_ECONOMICS.md).
- The newer Stage156 artificial-clock finality-recovery run [#40366390552](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40366390552) is separately monitored; its eventual mechanics proof cannot establish realistic-cost profitability or authorize more principal.
- The authenticated historical 7,801-debt-account Rhea index comes from source run [#40128285853](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40128285853). It is **not** a current liquidation-eligibility or balance statement.
- Archived Stage63 shard #5 ([artifact #12596757482](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40187579892/artifacts/12596757482)) produced one genuine paper-only source candidate at finding index 2594, healthy-ratio estimate 98.40% and same-token `wrap.near` debt. Its originally estimated repay is roughly $0.438 and gross roughly **$0.00353**. Although reference rules passed, those values are FAR below any material trading threshold, and deployed contract parity, spendable token units, source liquidity, swap/gas net and mainnet finance were NOT verified.

## Definition of an eligible *large-source* research candidate

Stage157 requires, at one fresh, genuine finalized NEAR block, all of the following:

1. Verified Rhea and Pyth contract code identity; real indexed borrow position; genuinely current account debt; active, timely, bounded-confidence Pyth prices; exact same-block valuation.
2. Original four-rule Rhea reference eligibility, authentic fixed-point precision, identical `repay`/`seize` token for the available reference route, borrower identity and final source block preserved in the written artifact.
3. **At least $1,000 USD reference repay value** and **at least $10 USD reference liquidation gross** before financing/gas/slippage. These values are expressed as decimal integer strings in E27 units, NEVER floating-point dollars or spendable token quantities.
4. No claims that a gross margin proves net realizable profit, reserve funding, collateral-free lending, settled callback receipts or mainnet safety. The result can only authorize a *separate disposable local Sandbox attempt*, not a live transaction.
5. If the eligible source cannot actually be cloned, converted to NEP-141 atomic units, funded, finalized and settled at zero temporary debt in Workspaces, mark the attempt **FAILED/BLOCKED** with the original source and transaction evidence. Do not alter historical storage or silently enlarge borrower positions.

**Workflow:** [Stage157 large liquidation search](../.github/workflows/rhea-stage157-large-liquidation-sandbox.yml) runs the Stage32 fresh active-Pyth sweep and Stage38 pinned source sizing on four disjoint 80-account ranges: indexes 2537–2616, 4989–5068, 7671–7750 and 2986–3065, total **320** source-backed accounts. The original archived registry independently identifies **62 distinct LiNEAR-debt borrowers** across these windows (19, 16, 14 and 13 respectively), versus only 10 across the previously scanned 0–79, 1820–1899, 4050–4129 and 6800–6879 windows. These are historical debt *locations*, NOT proof of current liquidation eligibility. It rechecks each historical borrower at *fresh* blocks. The Stage157 gate then separately audits the Stage38 paper evidence; only qualified source plans may reach existing real local Workspaces replay.

**Executable asset-route qualification:** the presently verified Stage37 route is LiNEAR repayment against LiNEAR seizure. Large same-token WNEAR or other token paper plans remain **blocked** until that deployed route is implemented and tested, even if their USD reference values exceed the minimums.

This is a **partial market search**, not a claim to scan every current Rhea borrowing account. A failed or unprocessed RPC read remains a blocker and can be safely retried. No dummy candidate, mutable source account, made-up discount, fake lender, fabricated timestamp, unqualified increase in principal, or profit transfer can satisfy the gate.

## Current acceptance status

**Implementation is not evidence of actual success.** Inspect the Workflow run created by merging this stage, plus its four `stage157-large-source-search-shard-*` artifacts, then record how many source accounts were actually processed, any fresh reference-sized candidates and their borrowed shares, funded real Sandbox receipts and residual debt. If no candidate meets BOTH thresholds, conclude `BLOCKED_NO_VERIFIED_LARGE_SOURCE`, with no liquidation transaction.

`EXECUTION_ENABLED=false` throughout; no mainnet keys, wallet money, owner payout or mainnet transactions. The sandbox loan still needs local collateral and is not a NEAR flash loan. No production-size trade should begin until authentic positive **worst-case realized** P&L after full financing, provider premium, gas/storage, slippage, market impact and reserve headroom is demonstrated.
