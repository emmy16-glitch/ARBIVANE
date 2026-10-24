# Stage 13 — Rhea isolated-position oracle quote evidence

**Mode: READ ONLY. NOT A HEALTH CHECK, EXECUTOR, OR PROFIT ESTIMATOR.**

Stage 12 identifies debt positions and verifies their debt asset IDs against
`get_account_all_positions`. Stage 13 adds direct Pyth **quote observations** for
positions whose evidence is complete. It does not approve prices for collateral,
liquidation eligibility, financial health, or real transactions.

## Exact read-only procedure

1. Perform Stage 12 bounded discovery and detailed position-set checks at one
   finalized NEAR block; reject or label inconsistent borrowers.
2. At that same block, recheck lending/oracle `view_account` code hashes and
   lending-owned `get_all_token_pyth_infos`, `get_config`, and asset IDs.
3. Only positions without upstream blockers and with collateral recorded may
   proceed. Each required token must declare a direct Pyth price identifier;
   a contract default, missing configuration, or disabled Pyth is a blocker.
4. Query the deployed `aggregate-oracle.near` `get_price_no_older_than` view
   with the declared feed ID and explicit maximum age. Cache quotes by feed ID
   because distinct assets may share a feed; enforce a per-run 1–32 query budget.
5. Parse quote price/confidence/exponent/publish time strictly, reject stale,
   future, negative, malformed or overconfident quotes, and verify every query
   reports the same finalized block. Use exact integer prices, no JS float math.
6. Record the observed feed price, decimals, age and confidence for each token.
   Never calculate or label a borrower *liquidatable*, *profitable*, or *healthy*.

## CLI

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export RHEA_EVIDENCE_FROM_INDEX=0
export RHEA_EVIDENCE_MAX_ACCOUNTS=200
export RHEA_EVIDENCE_MAX_FINDINGS=12
export RHEA_EVIDENCE_MAX_DETAILS=8
export RHEA_EVIDENCE_MAX_FEEDS=12
npm run check
npm run probe:rhea:price-evidence
```

Advanced controls: `RHEA_EVIDENCE_PAGE_SIZE`, `RHEA_EVIDENCE_MAX_AGE_MS`
(default 60,000), `RHEA_EVIDENCE_MAX_CONFIDENCE_BPS` (default 150),
`RHEA_EXPECTED_LENDING_CODE_HASH`, and `RHEA_EXPECTED_ORACLE_CODE_HASH`
(the last two require independent approval before use).

The command's JSON states are `QUOTES_OBSERVED_UNAPPROVED`, `NO_DEBT_FOUND`,
and `INCOMPLETE_ORACLE_EVIDENCE`. Its evidence is confined to the observed
account-index window, and an account cursor may shift after a later block.

## Critical limitations

- Lending-owned feed IDs do **not** establish that Rhea uses that price as-is
  for the asset's liquidation valuation. This is especially important for
  derivative assets, defaults, asset-specific decimal treatment, and old USN.
- The reference math remains historical and audited deployed-Wasm source
  provenance has **not** been established. Position health factors, exact
  collateral/debt share changes, liquidation rules, and financing remain unknown.
- Oracle publish time is compared to the node process's current wall clock;
  this is an observation-time freshness check, not an attestation of block time.
- A complete observed quote set does not authorize a liquidation, trading,
  custody operations, NEAR Intents settlement, or any real-money transaction.
- GitHub's advisory workflow uses `continue-on-error` for RPC experiments.
  A green workflow is not evidence the live-price probe passed: inspect the
  `rhea-price-evidence.json` artifact and the step's recorded outcome.

Stage 14 should establish auditable per-token price semantics and deployed
contract health-value comparisons **before** adding economic candidate ranking.
