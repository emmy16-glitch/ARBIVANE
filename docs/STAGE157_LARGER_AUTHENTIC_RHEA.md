# Stage157 — genuinely larger Rhea liquidation, source-gated Sandbox experiment

> **Stage160 supersession (26 October 2026):** The former ten-times source-amount floor described below has been removed from current code and both discovery workflows. Any positive source-supported amount is permitted for research and local Sandbox admission, subject to positive same-token remainder and all protocol/financing validation. See [Stage160](STAGE160_SIZE_AGNOSTIC_SOURCE_SCREENING.md). The older figure below records Stage157's original design, not today's operating limit.

**Status:** Implementation of the next experiment, not evidence of a completed new larger liquidation. No mainnet signing, owner funds, external lender, real swap or realized economic profit.

## Why this changes the test

The [original completed Stage93](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342) liquidated about **1,858,490,264,605,801** Rhea *internal lending units* of the historical borrower, source finding **2579**. Borrowing 10 or 100 test LiNEAR did not enlarge that borrower's liquidation size. The 100-test-LiNEAR real-timing trial had financing costs greater than its liquidation surplus.

Stage157 therefore **does not increase the loan against borrower 2579**. It uses an authenticated historical market index from [Stage30 run #40128285853](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40128285853) as an *identity discovery source only*, and makes NEW mainnet read-only price/health/source-rule checks before qualifying a different borrower.

## Source coverage and true larger threshold

The Stage30 archived index contains **7,801** historical debt findings. Exactly **170** historically listed LiNEAR as one of their borrowed assets. One is the old source index 2579, excluded entirely. The remaining **169** are ranked only for query priority by historical number of distinct debt assets; this does **not** predict collateral, eligibility or position size.

The read-only scan selects four nonoverlapping shards of at most 12 accounts per batch. Batches 0–3 cover every one of these 169 historical LiNEAR debt accounts without fabricating borrower state. They are automatically chained only after four verified, completed and eligible-source-free reports from the preceding batch. If one shard is missing or blocked, no further batch is launched or considered complete.

For **each** account, the existing Stage38 source evaluator re-fetches deployed Rhea code hash, fresh finalized state, active Pyth data, current debt/health, asset permissions and the four source liquidation constraints. A candidate must prove a **same-token LiNEAR/LiNEAR** liquidation with a conservative source repayment at least **18,584,902,646,058,010 Rhea internal lending units** (10× the originally pinned source amount), positive paper gross and a valid Stage37 Sandbox-only plan. This is a comparison in Rhea internal units, **not NEP-141 wallet atomic amounts, USD or net trading profit**.

An authenticated historical position that is now healthy, repaid, unpriceable, too small, or not source-rule-valid remains rejected. No borrower bytes, price, collateral, lending constraints, or receipt outcome are patched to create eligibility.

## Conditional actual NEAR Sandbox execution

The workflow [Stage157 larger borrower liquidation](../.github/workflows/rhea-stage157-larger-source-sandbox.yml) automatically runs after its implementation is merged to `main`, or can be manually dispatched with batch 0–3.

**Only after a genuinely larger candidate passes** the read-only source check and Stage37 original ABI check does that shard run the existing nearcore 2.13.4 NEAR Workspaces Sandbox flow. The stage retains the original Rhea/Pyth code, authentic state import, local test collateral, source-price parity, available reserve checks, signed transaction, original FINAL async callback, debt/collateral and FT balance reconciliation. An execution error or missing final receipt is uploaded as a failure; it is never converted to a success. There is no live external loan or wallet payout.

The workflow archives the full source report and, if applicable, `stage157-large-source-evidence.json`, `stage37-sandbox-execution.json`, `stage41-sandbox-balance-settlement.json` and `stage56-sandbox-attempt-evidence.json`. A verified *larger liquidation* requires an actual Rhea call and original FINAL callbacks plus independently verified borrower debt/collateral decreases and liquidator FT increase. **Profit-relevant** success requires additional verified lender principal + all fees repaid to zero, conservative gas/slippage/storage/swap costs, and an actual sale; none are claimed by the source scan.

## Security and admission

- `EXECUTION_ENABLED=false`, `maySignMainnet=false`, `mayBroadcastMainnet=false`; no mainnet keys or user funds.
- Genuine borrower identity, deployed lending/pyth code hashes and fresh actual source pricing are required.
- BigInt comparisons prevent a false larger-candidate admission from imprecise floating point values.
- Original Stage93 borrower 2579 is excluded; no artificial enlargement or pricing override.
- Scan is finite: at most 169 historical LiNEAR debt identities in four 48-account batches, with bounded RPC pacing and non-overlapping audit artifacts.
- A non-positive or blocked source result means **no liquidation execution**. A green regression job is not transaction evidence.

## Next decision

Review the authentic Stage157 GitHub Actions artifacts. If a fresh source-qualified larger candidate exists, inspect the complete original Sandbox settlement and borrower's exact size. If none exists, the truthful outcome is *no larger LiNEAR/LiNEAR liquidation was found in this finite historical sample*. Continue other assets or newly created borrowers via a new source-verified index; do not raise principal against the same old small loan merely for scale.
