# Stage162 — Source-route-aware sizing and rejection evidence

**Scope:** NEAR mainnet read-only Rhea/Pyth observations and disposable local NEAR Workspaces Sandbox only. **Not** a profitable liquidation, verified flash loan, owner payout, or funded mainnet transaction.

## Evidence prompting this stage
Stage161 repaired the early jq parsing failure. The independent four-batch search completed (runs [batch 0](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40376474783), [batch 1](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40377326506), [batch 2](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40378024415), [batch 3](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40378685555)). All conditional Sandbox replay steps were skipped; no positive borrower was attested. There were 169 historic LiNEAR debt candidates, but historic debt is not proof of current undercollateralization.

The original Stage157 report collapsed distinct Stage35 cases into `SOURCE_RULE_OR_DENOMINATION_NOT_VERIFIED`: currently healthy, source rule rejection, non-executable token route, pool permission/headroom limitation, or provider error could not be distinguished from the summary.

## Stage162 implementation

1. Stage35 now optionally receives `requiredSameTokenId='linear-protocol.near'`. This filters the *candidate repay/collateral pair search* itself, before picking the highest gross proposal. It prevents an unsupported WNEAR or cross-token route **within the same borrower** from hiding a smaller valid LiNEAR/LiNEAR reference pair. Default Stage35 exploratory sizing is unchanged. Invalid route choices fail closed. Original source health and all four liquidation rules, pool permissions, pool headroom, and integer limits remain unchanged.
2. Both Stage38 and independent Stage157 discovery explicitly forward the LiNEAR route requirement for their isolated Sandbox selection lane. Unsupported token directions cannot be presented as executable.
3. Stage157 now keeps bounded machine-readable evidence: `sourceSizingStatus`, `sourceSizingBlockers`, `consideredPairs`, reference repay/seize token IDs, `sourceRejectionCounts`, and `sourceSizingStatusCounts`. `NO_CURRENT_REFERENCE_RISK`, `NO_MATCHING_SUPPORTED_SAME_TOKEN_ROUTE`, `NO_SOURCE_POOL_BORROW_HEADROOM`, `FOUR_SOURCE_RULES_REJECTED_ALL_BOUNDED_REPAY_SIZES`, and failed fresh source reads are distinguished when actually observed. Error contents and RPC credentials are not persisted; only pre-defined failure categories.
4. Regression tests demonstrate the unchanged general-purpose Stage35 behavior, unsupported-route blocking, a valid same-token pricing scenario, reason preservation, safe filtering and aggregation. The independent four-shard workflow performs these tests before sending RPC requests and includes the aggregated denials in job summaries.

## Interpreting next-run results
A successful workflow alone is **not** evidence of a liquidation. Inspect each source artifact's exact `sourceRejectionCounts` and `sourceSizingStatusCounts` before saying whether the previous borrowers are healthy, do not have same-token collateral, have no borrow permissions/headroom, violate source rules, or have missing oracle evidence.

Only an authentic source-sized LiNEAR/liNEAR opportunity can trigger the existing original-code Sandbox replay. A successful replay must prove original FINAL transaction/async callback receipts, principal and financing-cost repayment, zero remaining Rhea partner debt, and actual transferable surplus; passing paper checks is insufficient.

No mandatory minimum USD size or 10x source amount. `EXECUTION_ENABLED=false`; no production signing, gas sponsor, flash lender, funded liquidation, or real net profit is claimed.
