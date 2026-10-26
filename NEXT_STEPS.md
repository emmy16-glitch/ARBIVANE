# Stage 111 handoff

## Stage 116 execution checkpoint
- Main `0ed2038`: PR #166 merged after CI `40290746331` passed. Actual Stage93 `40296205306` is in progress; inspect it before another full execution.
- Direct pinned quote read at execution block `221659693` returns publish time `1793001238`, 29 seconds before source time. Configured age is 60 seconds, so import overhead can exhaust the remaining 31 seconds. No age limit or stored quote may be changed.
- Branch `fix/stage116-replay-continuation` adds raw signed transaction/receipt preservation and genuine Ed25519 verification against the transaction hash, plus before/after state and finalized headers. It deliberately does not claim independent outcome Merkle verification. Local typecheck and 728 tests pass.
- Next command: inspect `actions/runs/40296205306/jobs` and completed candidate logs/artifacts. Then fix the observed failure; never call a passing CI run a liquidation. Mainnet signing/spending remains disabled.

## Stage 115 historical clock checkpoint
- Main `ea3e0bc` merges reviewed PR #165; its CI `40288933501` passed. Run `40288643664` failed before liquidation with `STAGE114_IMPORTED_PYTH_QUOTE_EXPIRED_OR_MISSING`.
- Artifact inspection distinguishes the earlier sweep block `221436207` (24 October) from the ACTUAL execution proposal block `221659693`, hash `9ZKKQv6bobLiBnqCYh7o3YFPaVn6xNtaa86u1a7VWSCn`, timestamp `1793001267416586578` (26 October 07:54:27 UTC). The null quote was observed at 07:55:35, about 68 seconds later. Do not confuse sweep time with execution snapshot time. Compare configured age and quote publish time in the next actual replay; age expiration is not yet proven by a stored quote. The new clock reads the proposal block, not a hardcoded sweep block.
- Working branch `fix/stage115-historical-clock` anchors Sandbox genesis and its process wall clock to the pinned source block, rounded forward to a whole second. Replay clock advances at rate 1. Monotonic timers and the Node/RPC client remain on real time. No stored prices, borrower state or freshness limits are changed.
- `stage115-historical-clock.json` records source height/hash/time and observed local time. Existing oracle parity still rejects expired/missing/different quotes. Local native smoke is blocked by this container's hard file-descriptor limit (16384; nearcore requires 65535); actual execution must run on Actions.
- Next command after green checks and merge: inspect the automatically triggered Stage93 run, download its artifacts and verify all receipts and debt/collateral/FT deltas. Do not dispatch a duplicate run. Liquidation is still NOT verified. Mainnet signing/spending remains disabled.

- Latest main: `417ea51` (PR #161 merged; Stage 93 log diagnostics added). Mainnet signing/spending remains disabled.
- Last inspected actual Stage 93 run: `40286666795`, failed. Candidate 2579 was fresh and source qualified. Stage 55 records `SANDBOX_PYTH_PARITY` and `STAGE109_SANDBOX_ORACLE_FRESH_QUOTE_VIEW_FAILED`; `localLiquidationCallInvoked=false`. No verified Sandbox liquidation.
- Independently dispatched run `40286675745` was in progress at this checkpoint. Inspect its completed outcome before another dispatch.
- Exact current blocker: the imported `aggregate-oracle.near` contract rejects a local `get_price_no_older_than` view. The oracle's internal failure reason is not yet known. Historic feed expiration against advancing Sandbox clock is a hypothesis, not yet verified. Do not bypass the fresh oracle check or fabricate prices.
- GitHub artifact zip downloads from this environment return 403, but Actions logs are accessible with `gh api repos/emmy16-glitch/ARBIVANE/actions/runs/RUN_ID/logs > /tmp/run.zip` and `unzip -o -q /tmp/run.zip -d /tmp/runlogs`.
- Next command: `gh run view 40286675745 --json status,conclusion,jobs && gh api repos/emmy16-glitch/ARBIVANE/actions/runs/40286675745/logs > /tmp/stage111-run.zip` (after completion). Then inspect the candidate log for `observedFailureCode`.
- Next implementation: establish the oracle's actual local rejection reason by a bounded, sanitized diagnostic; compare source quote publish time, pinned source block timestamp, and Sandbox block timestamp without exposing feed/account/secret values. Implement source authenticated time coherent replay or fresh authentic feed import as required, with a meaningful regression test. Keep quote freshness enforcement and all settlement gates intact.
- After each tested fix: commit, push branch, PR, wait checks, merge, run Stage 93, inspect receipts and borrower debt/collateral and seized FT changes. Continue until real settlement is verified.

## Stage 113 execution update
- PRs #162, #163, #164 merged. Runtime fix commit `0eed145` pins Sandbox nearcore 2.13.4 instead of Workspaces default 2.6.2.
- Actual run `40288079004` proves the oracle view now executes: prior deserialization rejection is gone. Current failure is `STAGE51_IMPORTED_PYTH_FEED_QUOTE_DIFFERENT`, before any liquidation call.
- Next command: `gh api repos/emmy16-glitch/ARBIVANE/actions/runs/40288079004/logs > /tmp/stage113.zip`.
- Next fix: distinguish a null expired local quote from a changed non-null quote. Source quote freshness and Sandbox clock must remain enforced. Investigate authentic historical clock configuration or fresh authenticated oracle updates; do not raise the age bound or modify stored prices.

## Stage 114 actual execution
- `6b13988` adds a null-quote failure distinction; 9 existing Pyth tests pass.
- Run `40288643664` completed with `STAGE114_IMPORTED_PYTH_QUOTE_EXPIRED_OR_MISSING`. Local oracle returns null while the pinned source returns a price. No liquidation call occurred.
- Next implementation must resolve time coherence of authentic oracle data (historical Sandbox time or authenticated fresh oracle state with requalification), not just add diagnostics. Do not widen age bounds or replace oracle values.
- Exact inspection command: `gh api repos/emmy16-glitch/ARBIVANE/actions/runs/40288643664/logs > /tmp/stage114.zip`.
