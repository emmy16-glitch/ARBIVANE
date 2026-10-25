# Stage 59 — bounded automatic whole-window Rhea debt-market continuation

## Previously verified and still blocked

Stage30 recorded **7,801 distinct historic debt-bearing borrowers** in a complete read-only registry. Stage42 had an authenticated four-shard, 320-borrower live repricing workflow that conditionally invoked the actual Rhea Workspaces isolated Sandbox executor on strictly positive fresh Stage35 source evidence. The workflow automatically continued at most **three** additional windows after a push, so it could stop after a small fraction of the registry even if every window reconciled and there were no positive candidates. A separate Stage40 compatibility workflow still asserted **at most 16** fresh risks, contradicting Stage58's complete 80-account limit.

## Implementation

- Preserve the existing immutable-source ID registry, fresh active-Pyth per-borrower repricing and independent four-shard reconciliation.
- On a main-branch push affecting Stage42, seed a **finite 20-followup budget**, now supported by the Stage47 planner's explicit **0..24** maximum and the dispatch shell validator.
- Dispatch precisely the *next contiguous 320 historical-debt finding window*, using the independently reconciled `endCursor`; never skip or repeat an account window due to an inferred workflow number.
- Stop after a verified source-positive reference plan, at budget exhaustion, or when fewer than 320 authentic source findings remain. Never dispatch on incomplete/untrusted reconciliation.
- Keep exactly four 80-account workers per window, **maximum two workers at once**, Stage58 80-risk refresh coverage per shard and full ledger/receipt artifacts. Do not include wallet keys, live network transaction signing or synthetic candidates.
- Fix the Stage40 stale `refreshed <= 16` assertion to require `refreshed == paperAtRiskFromPreviousScan`, `refreshed <= 80` and no cohort truncation.

## Proven source coverage boundary

With the existing default beginning at authentic historical finding 1292 and a historic registry size of 7801, this finite sequence covers **20 contiguous verified full windows**, from 1292 through 7691, totaling **6,400 additional source-debt findings**, unless it stops earlier for an authentic qualifying candidate, a failed scan or GitHub Actions operational limits. The 109 remaining historical findings are **explicitly not covered** by the full-window Stage42 implementation. Prior windows before 1292 are not claimed to be verified by this sequence either.

A workflow successfully dispatching is NOT proof that future dispatches finish or discover any eligible liquidation. A passing source-side paper scenario is NOT proof of deployed eligibility or net profit. An isolated Sandbox Rhea transaction can be called only when the actual candidate passes Stage35, Stage37, Stage49, Stage50, Stage51 and Stage52 gates and subsequently Stage41/48/55 settlement checks. The workflow records failures without pretending a successful liquidation.

No mainnet trades, wallet profits or immutable source parity are claimed by this Stage59 change. A full historic registry is not a constantly updated market discovery feed.
