# ARBIVANE

**Autonomous Risk-Based Intelligence, Verification And NEAR Execution**

> **Status: Stage 11 read-only isolated position verification. READ-ONLY / SIMULATION ONLY. No wallet integration, custody contract, liquidation executor, Shade agent deployment, AI inference, or NEAR Intents transfer is live. Nothing here can trade or transfer tokens.**

ARBIVANE is a proposed NEAR-first autonomous DeFi liquidation system. It is designed to observe a market, validate current protocol state, calculate conservative economics, reject unsafe/competitive opportunities, execute only when on-chain authorization is enforceable, reconcile final actual balances, then optionally convert and transfer realized proceeds via NEAR Intents.

The first implementation intentionally stops **before money moves**. The publicly accessible repository was empty when work began on October 23, 2026.

## Implemented now

| Capability | Actual status |
| --- | --- |
| Exact fixed-point profit/loss math | Implemented and unit tested |
| Deterministic risk gate with conservative defaults | Implemented and unit tested |
| Chain snapshots pinned to one NEAR final block | Read-only adapter and mocked-RPC tests |
| Rhea asset, oracle, borrower account pagination | Read-only adapter; selected live interfaces verified, full lending parity **not yet verified** |
| Rhea shares, risk ratios, health, discount and proposal rules | **Stage 2:** conservative fixed-point implementation and Rhea-guide example tests; **not yet parity-verified** with current deployed contracts |
| Historical competition proxy | Implemented; incomplete data means unknown, never zero competition |
| Execution/settlement lifecycle transitions | Pure state transition validation; no database yet |
| Realized token P&L accounting | Pure validation and reconciliation math; not wired to receipts |
| NEAR Intents settlement preconditions | Pure validation only; **no quote, swap or deposit** |
| Automated tests | `npm run check` |
| NEAR policy contract, Shade/TEE, NEAR AI Cloud | **Not implemented** |
| Liquidations, token transfers, custody, mainnet profit | **Not implemented** |

## Run locally

Requires Node.js **22.16+** (and TypeScript `tsc` available for the typecheck command). No wallet keys and no `npm install` are required for the unit tests or demo.

```bash
npm test
npm run demo
npm run typecheck
```

For **read-only** Rhea RPC exploration, verify the current lending/oracle deployments independently first, then set:

```bash
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.near.org
export RHEA_LENDING_CONTRACT=YOUR_VERIFIED_LENDING_CONTRACT
export RHEA_ORACLE_CONTRACT=YOUR_VERIFIED_ORACLE_CONTRACT
export EXECUTION_ENABLED=false
npm run scan:readonly
# Optional Rhea-specific indicative account valuations once live oracle schema is verified:
npm run scan:indicative
```

This command only calls NEAR RPC `query`/`call_function` to inspect a capped number of accounts. RPC failures, incompatible schemas and mismatched block heights abort. The read-only scanner never produces valid transaction instructions. The separate indicative valuation command uses documented Burrow-style schemas; its health and liquidation arithmetic are not yet proven identical to the current deployed Rhea contracts. A schema mismatch aborts. Read-only deployment configuration is deliberately not hardcoded from legacy Burrow code.

## Project flow

```text
NEAR RPC (final block)      Rhea account/oracle discovery
          |                         |
          +-------- raw snapshot --+
                         |
          Indicative Rhea liquidation rules [STAGE 2]
             Current deployed parity [NOT VERIFIED]
                         |
           Competition evidence + conservative P&L
                         |
          Deterministic fail-closed risk engine
                         |
          Custody-enforcing NEAR contract [NOT DONE]
                         |
         Shade/TEE proposed executor [NOT DONE]
                         |
         Actual transaction finality [NOT DONE]
                         |
         Realized P&L reconciliation [pure math only]
                         |
         NEAR Intents post-execution settlement [NOT DONE]
```

**Important:** NEAR cross-contract execution is asynchronous; it is not an EVM flash loan transaction. No native Rhea flash loan has been established, and no funding model should be assumed. The existing Burrow bot is a reference, not proof its integrations work unchanged on current deployments.

## Architecture and safety

- [Stage 2 Rhea mathematics, current contract references and remaining parity checks](docs/RHEA_PARITY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security gates and known limitations](docs/SECURITY.md)
- [Source reuse and licenses](docs/REUSE.md)
- [Implementation phases and milestones](docs/ROADMAP.md)
- [Hackathon evidence checklist](docs/HACKATHON_CHECKLIST.md)

Original Stage 1 code is written for this repository. External bot code has **not** been pasted into it. Patterns referenced from upstream projects are credited in `docs/REUSE.md`; any future source imports must preserve licenses/NOTICES and pin commits.

## Stage 6 — market coverage and price-source parity groundwork

The additional `npm run probe:rhea:coverage` diagnostic reads pool balances and borrowing flags for **all listed Rhea assets at the same finalized block as lending-owned price metadata**. It reports unpriced market exposure without treating missing metadata as proof of delisting. New BigInt-only derivative price comparisons and provenance-aware reference comparisons remain strictly non-executable. See [Stage 6 coverage and parity limits](docs/RHEA_STAGE6_COVERAGE.md).

**Stage 6 does not establish full deployed-contract health-factor or liquidation parity. Real-money execution remains off.**

## Not financial advice / not production-ready

Tests use fabricated positions (including Rhea's own published numerical example) and mocked-RPC responses. A passing unit test does not prove current Rhea liquidation math, true execution profitability, compliance with hackathon rules, deployed contract security, or that an external transfer can succeed. Do not fund, connect secrets, or deploy an autonomous executor based on this stage.

## Stage 3 public contract compatibility probe

`npm run probe:rhea` performs **only JSON-RPC view queries**, pins reads to one finalized block, records lending/oracle code hashes, tests historical method/schema compatibility and oracle age, and emits a borrower-free evidence report. It never signs or sends a transaction. The documented mainnet accounts are `contract.main.burrow.near` and `aggregate-oracle.near`.

```bash
export NEAR_NETWORK=mainnet
export EXECUTION_ENABLED=false
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
npm run probe:rhea
```

Optional approved-hash pins: `RHEA_EXPECTED_LENDING_CODE_HASH`, `RHEA_EXPECTED_ORACLE_CODE_HASH`. The repo also includes an **advisory** workflow `rhea-readonly-probe.yml` which attempts public views on PRs and stores the report even if it fails. A failed or passing probe does not activate any executor. See [Stage 3 evidence](docs/RHEA_LIVE_PROBE.md).

## Stage 4 — Pyth-compatible aggregate oracle reads (no trading)

The documented `aggregate-oracle.near` does **not** provide the old Burrow bot's `get_price_data` API. Stage 4 adds a separately selected Pyth-style `list_prices_no_older_than({price_ids})` reader with strict integer math, per-feed freshness/confidence gates, manually reviewed asset-to-feed mapping, and block-pinned mock-RPC regression tests. This is **not** an approved production price feed or live liquidation parity check.

`npm run probe:rhea:aggregate` requires explicit mainnet contract IDs, `EXECUTION_ENABLED=false`, and `RHEA_OPERATOR_FEED_MAPPINGS_JSON`. See [Stage 4 oracle evidence](docs/RHEA_AGGREGATE_ORACLE.md) before trying it. No default feed mapping is assumed.

**Safety state:** `exactContractParityVerified=false` and `executionEnabled=false` remain mandatory. No wallet access, trades, contracts or token transfers were added.

## Stage 5 — lending-owned Pyth metadata verification

The read-only `npm run probe:rhea:metadata` command reads `get_config`,
`get_assets_paged` and `get_all_token_pyth_infos` from the **same finalized
lending block**, along with lending and oracle code hashes. It reports only
public asset configuration and flags unknown, default-priced, and direct-Pyth
assets separately. It does **not** synthesize prices or treat a shared Pyth
feed as an error. It never authorizes liquidation.

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
npm run probe:rhea:metadata
```

This diagnostic is backed by Rhea's newer Go lending SDK, whose source calls
`get_all_token_pyth_infos` for per-token metadata. The RPC code in this
repository makes **no signed transactions**. See [Stage 5 verification](docs/RHEA_MARKET_METADATA.md)
for checks, limitations and upstream references.


## Stage 7 — borrower-level exposure audit and offline differential suite

`npm run probe:rhea:borrowers` reads the same finalized Rhea lending block as the
Stage 6 coverage report and enumerates a **capped prefix** of borrower records
(default 25; hard limit 200). It reports how many sampled accounts have debt or
collateral in assets with missing on-chain price metadata, including USN.

This is **not a full-market borrower scan**, does not establish whether an
account is liquidatable, and does not convert shares into token or USD values.
It does not return personal account identifiers in the standard report. The
first N accounts are not a statistically representative sample. Invalid or
incomplete account pages abort instead of being counted as empty.

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export RHEA_AUDIT_MAX_ACCOUNTS=25
export RHEA_AUDIT_PAGE_SIZE=10
npm run probe:rhea:borrowers
```

`src/rhea/reference-suite.ts` provides reproducible **offline** comparisons to
explicit reference fixtures with strict account, block and contract-hash
identity. The fixture system cannot grant execution approval, even when every
sample matches. Source details: [Stage 7 notes](docs/RHEA_STAGE7_BORROWERS.md).

No signing functionality, transaction submission, collateral custody, or real
profit extraction was added in Stage 7.

## Stage 8 — reference-source differential math (strictly offline)

The Stage 8 suite fixes a fourth protocol rule that was missing from the Stage 2
paper-liquidation checker: **a liquidation must strictly improve the borrower's
health factor** while leaving it below 100%. An independent 27-decimal source
formula model now checks share conversion and rounding against a pinned **2022**
Burrow contract source revision. It explicitly reports precision disagreements
with our existing conservative micro-USD approximation.

Run the *synthetic example only*:

```bash
npm run audit:rhea:source
```

The report never asserts currently deployed contract parity, profit, or trade
eligibility. This stage is **not** a NEAR WASM execution test; current Rhea
pricing, USN debt, modern isolated markets, source-to-code-hash provenance,
and liquidator financing remain unresolved. See
[Stage 8 source-math evidence](docs/RHEA_STAGE8_SOURCE_MATH.md).

## Stage 9 — deployed borrower share-balance differential (READ ONLY)

`npm run probe:rhea:share-parity` pins the current finalized mainnet block,
checks lending and oracle code-hash observations, reads a capped page of borrower
accounts, and compares independent 27-decimal *historical source* pool/share
amounts with `get_account` balances at that **same block**. It reports mismatches,
unsupported account formats and an empty/debt-free sample as separate outcomes.
The tool never reads secrets, signs transactions, or authorizes liquidation.

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
npm run probe:rhea:share-parity
```

A result of `SAMPLED_SHARE_MATCH` proves **only sampled share-to-balance parity**,
not price-source, liquidation, contract-bytecode, borrower-position or
profitability parity. A read-only GitHub Actions run records its evidence;
errors are advisory and **do not make CI a financial-approval gate**.
See [Stage 9 notes](docs/RHEA_STAGE9_DEPLOYED_PARITY.md).


## Stage 10 — isolated-position source arithmetic differential

The `npm run probe:rhea:isolated-parity` command compares borrower `positions`
independently by position identifier, using the modern Rhea Go SDK's
`get_account_all_positions` view schema as the reference for result fields.
`get_accounts_paged` shares and `get_account_all_positions` balances must come
from one finalized block. The expected balance uses the public historic Burrow
pool `shares_to_amount` integer rounding implementation.

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
npm run probe:rhea:isolated-parity
```

All reports permanently say `liquidationParityVerified=false` and
`executionEnabled=false`. Matching shares is **not** verification of the deployed
Wasm, live oracle valuation, liquidation preconditions, or profits.
Read [Stage 10 evidence](docs/RHEA_STAGE10_ISOLATED_POSITIONS.md) for the outstanding review gates.

## Stage 11 — bounded read-only debt discovery

`npm run probe:rhea:debt-index` scans operator-selected finalized-block account-index windows, detecting **nonzero debt shares per isolated position** with exact resume offsets. It does not calculate liquidation eligibility, prices or profits. Invalid borrower schemas are explicitly counted, never assumed debt-free. The optional [manual GitHub workflow](.github/workflows/rhea-debt-discovery.yml) runs a limited window and saves an evidence report. See [Stage 11 limitations and instructions](docs/RHEA_STAGE11_DEBT_DISCOVERY.md). Execution remains disabled.

## Stage 12 — Borrower debt evidence triage (read only)

`npm run probe:rhea:triage` composes the Stage 11 index scanner with same-block
position-aware detail checks and lending-owned Pyth metadata classification.
`DEBT_SET_OBSERVED_UNPRICED` means **only** that the observed debt token set
matched the contract detail. It never reports eligibility, approved prices,
health, executable profit or gas funding. See
[Stage 12 triage protocol](docs/RHEA_STAGE12_TRIAGE.md).

## Stage 13 — Oracle evidence for read-only debt positions

`npm run probe:rhea:price-evidence` runs bounded Stage 12 position triage,
then checks the lending-owned direct Pyth feed IDs and observed aggregate-oracle
quote freshness and uncertainty at the **same finalized block**. Only quote
metadata is returned. Unverified position details, defaults, missing feeds,
expired quotes and budget limits fail closed. This is **not** liquidation
eligibility, on-chain price parity, financial health, or profit estimation.
See [Stage 13 read-only price evidence](docs/RHEA_STAGE13_ORACLE_EVIDENCE.md).

**Safety invariant:** `executionEnabled=false`, `liquidationParityVerified=false`,
`priceParityVerified=false`, `executable=false`, and `estimatedProfit=null`.

## Stage 14 — NEAR full-market debt index (read only)

`npm run probe:rhea:full-debt-index` runs a bounded, concurrency-controlled
backfill of Rhea's actual NEAR on-chain account index at **one finalized block**.
It outputs observed debt-bearing account counts, isolated position counts,
resumable same-block checkpoints and explicit schema error counts. No wallet,
trade, liquidation, price certification or expected profit is produced.
Synthetic test cases that contain thousands of borrowers do **not** establish
real mainnet counts. Use the GitHub Actions **NEAR Rhea full market debt index**
workflow to gather live evidence, and inspect its JSON artifact and outcome.
See [Stage 14 architecture and instructions](docs/RHEA_STAGE14_FULL_INDEX.md).

### Stage 14.1 live backfill reliability

The first complete-index attempt stopped after **5,100 / 72,768** NEAR account indices because the public RPC returned **HTTP 429**. The follow-up adds shared backoff, bounded page pacing, `Retry-After`, and cross-run **same-block-only** artifact checkpoint restoration. An observed positive lending-pool debt balance with zero discovered borrower positions at **full** completion now produces an explicit `BORROWER_DEBT_MISSING_UNVERIFIED` status. Neither CI success nor a partial count constitutes a verified debt market index. See [`docs/RHEA_STAGE14_FULL_INDEX.md`](docs/RHEA_STAGE14_FULL_INDEX.md). Trading is disabled.

## Stage 15 — Read-only isolated position paper health

`npm run probe:rhea:paper-health` checks discovered isolated positions using exact on-chain share and balance evidence, Stage 13 lending-owned Pyth price quotes and historical Burrow 27-decimal valuation. It outputs `PAPER_AT_RISK_UNAPPROVED`, `PAPER_HEALTHY_UNAPPROVED` or `BLOCKED` — **not** actual NEAR liquidation eligibility. No position is executable and no expected profit is produced. A manual/advisory GitHub Action stores results. The full-market borrower indexing workflow remains separate. See [Stage 15 paper health model](docs/RHEA_STAGE15_PAPER_HEALTH.md).

## Stage 16 — Hypothetical liquidation economics (offline, read-only)

`npm run score:rhea:paper` accepts an explicitly offline Stage 15 health report
plus operator-supplied **hypothetical** USD-denominated repay/seize legs and
maximum cost assumptions. It runs conservative 27-decimal historical source
checks, bounds funding/slippage/gas/competition assumptions and ranks only
paper-positive scenarios. **No real liquidation eligibility or profit is verified,
and no transaction construction or signing exists.**

Try the explicitly synthetic example in
[`examples/stage16-synthetic.json`](examples/stage16-synthetic.json), and read
[`docs/RHEA_STAGE16_PAPER_OPPORTUNITIES.md`](docs/RHEA_STAGE16_PAPER_OPPORTUNITIES.md).
Do not treat the fabricated sample as NEAR mainnet account evidence.


### Stage 17 — Checkpoint-driven NEAR Rhea health bridge

The read-only Stage 17 bridge consumes a genuine Stage 14 same-block checkpoint
from NEAR mainnet, revisits only indexed debt-bearing accounts and their isolated
positions, checks Stage 10 share parity, validates same-block Pyth quotes, and
passes clean evidence into Stage 15 paper-health calculations. Stage 16 paper
scenarios remain explicitly operator-supplied; this stage never invents a
repayment or profitability estimate. See
[Stage 17 documentation](docs/RHEA_STAGE17_INDEXED_HEALTH.md).

Run `npm run probe:rhea:indexed-health` with
`RHEA_INDEX_CHECKPOINT_PATH` and `EXECUTION_ENABLED=false`. GitHub provides a
manual read-only workflow. A cancelled full-index run does **not** provide a
verified market count, and no current liquidatable borrowers are claimed.
