# ARBIVANE

**Autonomous Risk-Based Intelligence, Verification And NEAR Execution**

> **Status: Stage 5 read-only lending metadata verification. READ-ONLY / SIMULATION ONLY. No wallet integration, custody contract, liquidation executor, Shade agent deployment, AI inference, or NEAR Intents transfer is live. Nothing here can trade or transfer tokens.**

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
