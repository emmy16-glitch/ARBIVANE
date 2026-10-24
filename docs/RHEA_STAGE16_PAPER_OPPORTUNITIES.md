# Stage 16 — NEAR-first, read-only liquidation scenario screening

**Status: IMPLEMENTED as OFFLINE RESEARCH SIMULATION ONLY. NO EXECUTION.**

## What this actually does

Takes a Stage 15 `READ_ONLY_RHEA_PAPER_HEALTH` JSON report and analyst-supplied
**hypothetical** USD-E27 repayment/seizure scenarios. All calculated numbers are
integer-only and the example is purely fabricated for regression coverage.
For each isolated NEAR/Rhea position it:

1. Checks identical lending and oracle contract hashes, account ID, position ID,
   finalized block, and bounded block lag. These hashes identify observations;
   they are **not** an attestation that the deployed Wasm matches the 2022 source.
2. Requires existing Stage 15 paper-at-risk position evidence with no blockers.
   No quote, healthy record, legacy position or missing position can be promoted
   to a liquidation opportunity.
3. Applies the **historical Burrow** integer ratio-adjustment and discount checks
   to hypothetical repayment and collateral-seizure USD amounts. Both post-state
   solvency and *improving borrower health* are required by these source checks.
   **Actual protocol share mutations, isolation and rounding still require a
   deployed Rhea contract parity proof.**
4. Checks an assumed funding capacity and **upper-bound assumptions** for gas,
   borrowing costs, slippage, protocol fees and a competition risk buffer.
   Missing cost/financing fields block the result rather than treating costs as 0.
5. Requires an explicitly *nonexhaustive* public competition observation tied
   to the same block. Observed transaction counts **never** represent the total
   number of competing bots; 0 observed does **not** mean 0 competitors.
6. Computes an offline, *hypothetical* gross and net figure and ranks only
   scenarios that satisfy these paper preconditions. Ranking is never an
   executable instruction, actual margin forecast, liquidation eligibility,
   or PnL evidence.

All outputs explicitly report `executionEnabled=false`,
`liquidationEligible=false`, `profitabilityVerified=false` and
`deployedContractParityVerified=false`. Every report has
`liquidationParityVerified=false`.

## How to run the offline demonstration

The example file contains **one invented borrower and fabricated prices, costs,
collateral and risk data**, and is not a current NEAR blockchain observation:

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export RHEA_PAPER_SCENARIOS_JSON_PATH=examples/stage16-synthetic.json
npm run check
npm run score:rhea:paper
```

The `score:rhea:paper` command performs **no RPC calls**, does not load keys,
never constructs NEAR transactions and never moves any assets. Real inputs
must be generated from a consistent reviewed Stage 15 evidence snapshot, not
manually asserted to justify a live trade.

## Necessary proof before any real liquidation

- Finish Stage 14's full-market index and resolve the existing lending-pool debt
  versus zero-discovered-borrowers consistency alarm if it appears.
- Audit exact **deployed Rhea Wasm** and price/health/liquidation mechanics
  including position isolation, interest accrual, repayment and seize rounding,
  and the USN/default/derivative price gaps.
- Obtain actual liquidator balance/borrowing capacity, token liquidity,
  executable swap/slippage quotes and **NEAR gas plus cross-contract** costs.
- Establish reliable, honest nonexhaustive competition indicators; a true live
  competitor count cannot be derived from the first-N account sample.
- Define and formally test treasury policy, replay protection, limits and
  signed-custody separation before adding execution code.

Until then, a top-ranked Stage 16 item means only a **hypothetical model case
using operator-entered economics**. It must never appear in any dashboard as a
real detected or verified profitable liquidation.
