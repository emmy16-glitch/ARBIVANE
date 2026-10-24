# Stage 17 — Real indexed Rhea debt findings to read-only paper health

**Status: IMPLEMENTED FOR RESEARCH, NOT DEPLOYED LIQUIDATION PARITY OR TRADING.**
NEAR mainnet is the authoritative blockchain. This stage reads public Rhea/NEAR
views, never signs, sends transactions, estimates executable profit, or takes custody.

## Why this exists

Stages 11–15 independently sampled small groups of borrower indices. Stage 14
produced same-finalized-block market checkpoint artifacts with *discovered*
debt-bearing account IDs and isolated position IDs. Stage 17 consumes those
artifacts directly rather than jumping back to the first 200 accounts. It
preserves the position identity and the exact source block.

The source indexer run [40072333263](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40072333263)
was **cancelled**. No complete market enumeration and no verified live debt
count can be inferred from it. A complete checkpoint artifact must come from
an actual completed index scan. A partial checkpoint can be inspected, but it
remains explicitly labeled `INCOMPLETE_EVIDENCE`.

## Processing contract

1. Load **untrusted** Stage 14 checkpoint JSON; reject forged completion flags,
   duplicate borrower identifiers, invalid positions, wrong counts, and invalid
   schema-error summaries. Checkpoints are still **not cryptographic
   attestations**.
2. Resolve the *same historic finalized NEAR block* using `view_account`; verify
   lending code hash against the checkpoint. Optionally require independently
   reviewed lending and oracle code-hash pins.
3. Get lending asset pools, on-chain Pyth metadata, and lending oracle config at
   that block. A default/derived/unmapped price is not substituted for a direct
   Pyth quote.
4. For each saved finding (cursor + budget), re-read exactly its original indexed
   borrower (`get_accounts_paged` with a one-row range) and
   `get_account_all_positions`, again pinned to the checkpoint block. Refuse
   reindexed/mismatched accounts, altered position asset sets, legacy account-wide
   debt, ambiguous collateral, and nonmatching share-to-balance arithmetic.
5. Use `get_price_no_older_than` and the strict Pyth parser to apply freshness,
   confidence, nonzero-price, and oracle-source checks. Cache shared feed IDs
   only inside the *same block and one invocation*. Query count is capped.
6. Reuse Stage 15 integer-only historical-source share/price/volatility health
   calculation for each fully verified isolated position. Output
   `PAPER_HEALTHY_UNAPPROVED`, `PAPER_AT_RISK_UNAPPROVED`, or `BLOCKED`, never
   `liquidationEligible=true`.
7. Optionally feed a **separately supplied** set of hypothetical analyst
   scenarios to the existing Stage 16 paper scorer. No repayment, seize size,
   funding, gas cost, or competitor count is automatically invented. Missing
   evidence makes a scenario `BLOCKED`; potential profits are not verified.

The checkpoint stores **which debt assets were found**, not their original raw
share quantities. Stage 17 therefore cannot attest the original shares from
that artifact alone. It instead performs an independent detailed share/balance
differential against the same pinned block. A stronger future checkpoint format
should also preserve exact typed shares for independent replay validation.

## Manual run

Prepare a Stage 14 JSON checkpoint saved from a genuine GitHub artifact.
For *full live* operation the NEAR RPC provider must support historical views
at the checkpoint height. Historical oracle quotes may legitimately fail the
60-second freshness requirement; never silently replace them with current
quotes from another block.

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export RHEA_INDEX_CHECKPOINT_PATH=stage14-checkpoint.json
export RHEA_INDEX_FINDING_CURSOR=0
export RHEA_INDEX_MAX_FINDINGS=8
npm run check
npm run probe:rhea:indexed-health
```

The manual GitHub workflow downloads a Stage 14 checkpoint artifact using its
run ID, then performs a bounded read-only evidence check. It **will not**
produce a borrower count on its own, and a cancelled indexer without an uploaded
checkpoint has no usable input. The returned `nextFinding` is a cursor within
an immutable source checkpoint, not the Stage 14 `nextIndex` account cursor.

## Open blockers for production-quality liquidation intelligence

- Stage 14 complete, accurate and recoverable full-market backfill, plus
  incremental NEAR chain updates without mixing finalized blocks.
- Independently proven modern deployed Rhea WASM and isolated-liquidation rules;
  historical Burrow share arithmetic by itself is insufficient.
- Price coverage for USN, default-priced and derivative assets, with on-chain
  conversion/rounding parity and complete position valuation.
- Actual *token quantities*, routing/depth, funded repay capacity, gas and
  cross-contract receipts, negative/adversarial scenarios, competition evidence,
  custody limits, and enforceable audit gates.

**No wallets, flash loans, liquidation transactions, or profit-transfer code
were added.** The project does not yet claim thousands of verified active
debt accounts or safe execution.
