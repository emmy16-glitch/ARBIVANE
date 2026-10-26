# Stage160 — size-agnostic Rhea source screening and corrected large-search CI

**Scope:** any source-qualified positive amount is eligible for *read-only screening* and potentially an isolated, disposable Workspaces Sandbox replay. There is NO fixed minimum USD value, ten-times-historical-source requirement, or automatic increase in borrowing principal. **Mainnet spending stays disabled.**

## What failed before this change

[Stage159 merged source search #40372238960](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40372238960) completed as FAILED before any of its four live-recheck shards executed. The source-gate regression step invoked Node 22 with `node --test` while importing a TypeScript `.ts` module from the Stage38 test, raising `ERR_UNKNOWN_FILE_EXTENSION`. The 320-borrower scan **did not run** in that workflow. This failure is technical; it provides no new positive or negative evidence about current large borrowers. Stage160 calls `node --experimental-strip-types --test` and includes the other Stage157 source-discovery tests.

## Amount admission now

1. Stage157's `minimumRepayUsdE27` and `minimumGrossUsdE27` defaults are **0**, with `sizeFloorApplied=false`. A positive source-supported opportunity below $1, $10, or $1000 is not rejected merely for its size. The source gate still requires strictly positive repay internal units, positive reference repayment, positive reference gross, and `seizeInternal > repayInternal` for the currently implemented same-token path. These are arithmetic/protocol requirements, not configurable profit guarantees.
2. The keyless Stage157 source workflow sets `RHEA_STAGE38_SANDBOX_MIN_PAPER_GROSS_USD_E27=0`. Stage38's optional Sandbox screening value now accepts zero, but Stage35 still requires **gross > 0** and the actual four Rhea reference liquidation rules to pass. Other workflows' existing values are not changed.
3. The *separate* historical 169-LiNEAR-debtor Stage157 discovery path no longer rejects candidates merely because `repayInternal < 10 * historicalRepayInternal`. It still requires deployed LiNEAR/LiNEAR, a source-pinned risk/rule pass, positive gross, nonzero repay, and a same-token remainder, and it never signs mainnet transactions.
4. Retain all original active-Pyth freshness and confidence limits, code identities, lender-borrow/withdraw permissions and inventory checks, original callback receipts, balance reconciliation, funding principal and accrued-interest coverage, and required zero outstanding partner debt. No amount selected by a user can override actual lender inventory, liquidatable source debt, oracle checks, contract limits, or capital requirements.

## Economic caution

**No size floor** means no arbitrary preference threshold; it does **not** mean any amount is *profitable*, liquidatable, lendable, or repayable. Many tiny gross spreads will lose money after financing interest, network/storage fees, settlement costs and slippage. Candidate `canAttemptSandbox=true` only means a **test may be run**; real-money approvals and profit verification remain explicitly false. Do not turn on mainnet signing, collateral funding, user payouts, or a fictional flash lender.

The earlier 10-test-LiNEAR locally fully repaid cycle is independently documented. The 100-test-LiNEAR real-timing trial against the same tiny borrower still suffered negative financing economics. These facts are unchanged.

## Post-merge acceptance

Inspect the **new** Stage157 action's `source_gate_regression` and all four fresh-source shard jobs, including the four archive artifacts. Record source account counts, recheck blocks, quote freshness, eligible reference scenarios, any attempted Sandbox `execute_with_pyth` receipt finality, final Rhea debt and complete financing settlement. If the source-gate test passes but no route is eligible, report `BLOCKED_NO_VERIFIED_LARGE_SOURCE` without making up a funded execution. The large-source search remains a **bounded research search**, not a claim of complete market coverage.

All mainnet execution, signing and wallet transfers remain disabled.
