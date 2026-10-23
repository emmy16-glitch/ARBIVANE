# ARBIVANE

**Autonomous Risk-Based Intelligence, Verification And NEAR Execution**

> **Status: Stage 1 research implementation. READ-ONLY / SIMULATION ONLY. No wallet integration, custody contract, liquidation executor, Shade agent deployment, AI inference, or NEAR Intents transfer is live. Nothing here can trade or transfer tokens.**

ARBIVANE is a proposed NEAR-first autonomous DeFi liquidation system. It is designed to observe a market, validate current protocol state, calculate conservative economics, reject unsafe/competitive opportunities, execute only when on-chain authorization is enforceable, reconcile final actual balances, then optionally convert and transfer realized proceeds via NEAR Intents.

The first implementation intentionally stops **before money moves**. The publicly accessible repository was empty when work began on October 23, 2026.

## Implemented now

| Capability | Actual status |
| --- | --- |
| Exact fixed-point profit/loss math | Implemented and unit tested |
| Deterministic risk gate with conservative defaults | Implemented and unit tested |
| Chain snapshots pinned to one NEAR final block | Read-only adapter and mocked-RPC tests |
| Rhea asset, oracle, borrower account pagination | Read-only adapter; live deployment/API compatibility **not yet verified** |
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
```

This command only calls NEAR RPC `query`/`call_function` to inspect a capped number of accounts. RPC failures, incompatible schemas and mismatched block heights abort. The scanner does **not** determine liquidation eligibility or produce valid transaction instructions yet. Read-only deployment configuration is deliberately not hardcoded from legacy Burrow code.

## Project flow

```text
NEAR RPC (final block)      Rhea account/oracle discovery
          |                         |
          +-------- raw snapshot --+
                         |
          Protocol-equivalent liquidation math [NOT DONE]
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

- [Architecture](docs/ARCHITECTURE.md)
- [Security gates and known limitations](docs/SECURITY.md)
- [Source reuse and licenses](docs/REUSE.md)
- [Implementation phases and milestones](docs/ROADMAP.md)
- [Hackathon evidence checklist](docs/HACKATHON_CHECKLIST.md)

Original Stage 1 code is written for this repository. External bot code has **not** been pasted into it. Patterns referenced from upstream projects are credited in `docs/REUSE.md`; any future source imports must preserve licenses/NOTICES and pin commits.

## Not financial advice / not production-ready

Tests use fabricated positions and mocked-RPC responses. A passing unit test does not prove current Rhea liquidation math, true execution profitability, compliance with hackathon rules, deployed contract security, or that an external transfer can succeed. Do not fund, connect secrets, or deploy an autonomous executor based on this stage.
