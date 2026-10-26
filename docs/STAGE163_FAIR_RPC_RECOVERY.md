# Stage163 — bounded fair RPC recovery for real at-risk LiNEAR borrowers

## Diagnosed original evidence

The archived 80-account source window in [run #40375056441](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40375056441) (shard 1, historical indexes 4989–5068) records **11 at-risk** borrowers, **68 paper-healthy** and **1 blocked** in Stage32. Stage38 revisited the eleven source-backed at-risk accounts, and all eleven returned `HTTP_RATE_LIMIT_OR_TIMEOUT`. No fresh source liquidation candidate was executable and no transaction was sent. A paper at-risk finding is not itself permission to liquidate.

The Stage38 recovery loop then had only **eight recovery attempts per entire shard**, with **two attempts per borrower** before moving to the next. It could exhaust that budget on the first four candidates and never attempt a recovery for the remaining seven. This was a scheduling defect distinct from whether the RPC providers were themselves available. Independent 169-historical-LiNEAR-borrower scan and Stage162 source rule diagnostics are separate pipelines; do not confuse workflow success with an actual borrowed/settled liquidation.

## Repair

- Switch to **round-robin recovery**: first offer each recoverable source one retry; then offer a second attempt to any still blocked source, while the per-shard total never exceeds the configured ceiling.
- Add `maxRecoveryAttempts` to the Stage38 read-only pipeline: default **8** for established callers, explicitly **40** in the four-shard Stage157 large-source workflow, bounded to **0–160** to prevent runaway retries.
- Use **one concurrent source evaluation and 1600 ms per top-level RPC request** in that large workflow, with Stage32 also set to one concurrent evaluation. Keep two GitHub shards maximum in parallel. This reduces burst pressure but does not guarantee the provider will respond.
- Publish `recoveryDeferredFindings` and `recoveryBudgetExhausted` alongside existing `failedFreshReads` and recovered counts. A 429 `Retry-After` greater than 30 seconds is **deferred**, not overridden and not misclassified as a healthy or ineligible borrower.
- Test the original **11 blocked sources** returning after exactly one retry each, limited-budget fairness, permanent 429 cooldown, validation of retry ceilings and existing Pyth confidence/freshness restrictions.

No protocol oracle safety checks, borrower eligibility rules, source payout amount, asset-route admission, financing accounting or real-mainnet permissions were weakened. Stage160's **no arbitrary size floor** remains effective. The output remains keyless/read-only on the live network, with optional execution only in disposable isolated Sandbox; a `recoveryDeferredFindings > 0` count is not a successful market coverage claim.

## Acceptance

1. PR Safety/typecheck and Stage157 source-gate regression pass.
2. Post-merge 80-account source windows run and emit real original Stage32/Stage38 artifacts; no blocked accounts silently disappear.
3. Any genuinely eligible LiNEAR/LiNEAR source still requires fresh contract and active Pyth parity, reserve proof, original Sandbox `FINAL` receipts and final zero debt.
4. If providers still return 429/timeouts, keep the original blocked accounts and counts, do not fabricate eligible candidates or profitable funds. Mainnet transaction submission stays disabled.
