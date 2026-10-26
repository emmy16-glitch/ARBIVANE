# ARBIVANE

**NEAR-native liquidation discovery, source-backed risk checks and verifiable Rhea execution**

ARBIVANE studies lending positions on NEAR, identifies candidate liquidations, checks protocol rules and available liquidity, and tests the complete transaction against an isolated copy of the real Rhea contracts. The emphasis is on proving what happened, not confusing a profitable-looking estimate with money actually earned.

**Current state — 26 October 2026:** The project has executed and independently verified real Rhea liquidation transactions **inside NEAR Sandbox**. The latest successful Stage93 verification is [run #40320594342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594342). It has **not** executed a funded mainnet liquidation, sold seized collateral for realized net profit, connected an owner's wallet or enabled production signing.

## Capital-free funding is the next engineering objective

The owner has **no starting capital**. ARBIVANE is investigating genuine native NEAR flash liquidity or another independently verifiable, zero-collateral financing route. The successful Rhea Sandbox transaction was **not** a flash loan: it deposited **1 NEAR of disposable Sandbox wNEAR collateral** before Rhea `Borrow`. That was not the owner's money, but it would be a real capital requirement on mainnet.

Stage139 now audits the original successful funding receipts and refuses to mark collateral-backed borrowing as uncollateralized financing. The project has **not yet independently verified a live LiNEAR flash lender**, its safe asynchronous repayment model, or a gas sponsor. **Do not fund your wallet or enable mainnet signing to solve an unverified financing route.** See [Stage139 financing investigation](docs/STAGE139_FLASH_LIQUIDITY_FINANCING.md) and [Stage140 deployed provider discovery](docs/STAGE140_NATIVE_PROVIDER_DISCOVERY.md). Stage140 can inspect Rhea and Ref **deployed NEAR Wasm exports** through read-only RPC, but no compatible LiNEAR flash lender is verified or connected for trade execution.

## What works today

| Area | Verified capability | Boundary |
| --- | --- | --- |
| Market discovery | Read-only Rhea asset, account and debt pagination; bounded shards, cursors, checkpoints and RPC retries | A market scan is not liquidation eligibility |
| Valuation and rules | Same-block source checks, current Rhea configuration, active Pyth price evidence, fixed-point share/health and repay/seize sizing | Old prices and incomplete sources are rejected |
| Opportunity screening | Source-backed risk checks and a historical competition-pressure model | Competition is estimated, never known to be zero |
| Isolated execution | The real Rhea `execute_with_pyth` path: **Borrow → Liquidate → Repay → Withdraw** using imported contracts and state in local NEAR Sandbox | Only disposable Sandbox keys and tokens move |
| Transaction proof | Original signed transaction, canonical `FINAL` callbacks, independent before/after debt and FT checks, Borsh transaction preimage/Ed25519 verification | No independent canonical-mainnet receipt inclusion or full historical trie proof |
| Settlement evidence | Borrower debt and collateral decrease, net LiNEAR FT received, and zero remaining liquidator debt are independently checked | Received collateral is **unsold inventory**, not realized trading profit |
| Mainnet safeguards | Read-only outcome-Merkle-path consistency checker and spending-policy preview | No authenticated light-client head, live signer, wallet connection or mainnet broadcast |
| Automated checks | Node unit/adversarial tests, TypeScript typecheck and GitHub Actions evidence artifacts | Green CI is not evidence of profitable live trading |

A key result: Stage93 [run #40317139342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342) passed all three jobs. The archived proof independently records **1,858,489,628,732,367** internal lending units of borrower debt decrease, **1,861,021,454,676,401** internal collateral decrease, **2,531,190,098,868** atomic LiNEAR units received by the Sandbox liquidator, and **zero** remaining liquidator debt. These values are integer units; they are **not** USD or a cash profit figure. A subsequent execution also passed [#40320594342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594342).

## How liquidation works

1. Read a finalized NEAR block and discover accounts with genuine borrowing positions.
2. Recalculate prices, health, collateral and repayment limits using Rhea's lending configuration and active Pyth prices, with explicit token/share precision.
3. Reject candidates with invalid rules, unavailable reserves, stale data, insufficient liquidator capacity or unbounded economic risk.
4. Recreate the required lending, token and oracle contracts in NEAR Workspaces Sandbox, importing historical chain state and validating parity before calling anything.
5. Sign **one Sandbox transaction** that borrows temporarily, liquidates the selected borrower, repays the actor's borrowed shares and withdraws the remaining token balance.
6. Retrieve the original signed transaction and its actual asynchronous callback outcomes to `FINAL`. Advance the local finalized chain if necessary and independently read lending positions and NEP-141 wallet balances again.
7. Refuse to mark settlement successful unless **borrower debt and collateral both decrease, net seized FT increases, callbacks succeed and liquidator debt returns to zero**.

The temporary Borrow is a Rhea lending action backed by the Sandbox actor's collateral, **not** evidence that the protocol offers a zero-capital EVM-style flash loan. NEAR cross-contract calls and token transfers are asynchronous; callback and post-state proofs matter.

## Architecture at a glance

```text
Read-only NEAR RPC + Rhea/Pyth views
               |
      Pinned-block discovery
               |
    Deterministic health/sizing
               |
      Liquidity + risk gates
               |
    Source/price parity check
               |
   Local NEAR Workspaces Sandbox
               |
   Rhea execute_with_pyth + callbacks
               |
   FINAL receipts + borrower/FT deltas
               |
 Independent signature/Borsh verifier
               |
      Archived evidence artifacts

Mainnet signer and capital custody: NOT CONNECTED
Live swap / realized P&L:           NOT IMPLEMENTED
```

For the code-level data flow, see [Architecture](docs/ARCHITECTURE.md). For the precise distinction between a passing execution and trading profit, see [Evidence and status](docs/STATUS_AND_EVIDENCE.md).

## Run the project

**Requirements:** Node.js **22.16 or newer**, Git and a working command line. The default test/demo flow requires no wallet or RPC credentials.

```bash
git clone https://github.com/emmy16-glitch/ARBIVANE.git
cd ARBIVANE
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run demo
```

`npm run check` runs the TypeScript typecheck and Node test suite. `npm run demo` exercises offline, non-executable examples. A successful demo does not submit a NEAR transaction.

For public-chain **read-only** probes, use environment settings documented in [Operations](docs/OPERATIONS.md). `EXECUTION_ENABLED=false` is required. Example contract IDs below are the historically verified Rhea paths used by the replay; operators must still verify current deployment/code hashes:

```bash
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.near.org
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export EXECUTION_ENABLED=false
npm run probe:rhea
```

Some provider endpoints may require authorization or an archival alternative. The repository's full automated historical Sandbox replay runs through the deliberately gated [Stage93 GitHub Actions workflow](.github/workflows/rhea-stage93-borrower-settlement.yml), not `npm run demo`. See [Operations](docs/OPERATIONS.md) before reproducing it.

## Documentation

| Read this | For |
| --- | --- |
| [Documentation index](docs/INDEX.md) | Where to start, and how to navigate the earlier development stages |
| [System architecture](docs/ARCHITECTURE.md) | Modules, protocols, execution path and verification boundaries |
| [Verified milestones](docs/STATUS_AND_EVIDENCE.md) | Exact successful runs, receipts, what remains unproved |
| [Operating and reproducing](docs/OPERATIONS.md) | Setup, commands, workflows, artifacts and common failures |
| [Wallet and mainnet readiness](docs/WALLET_AND_MAINNET.md) | Supported wallets, owner authorization, capital controls and setup |
| [Security](docs/SECURITY.md) | Threat model, fail-closed design and unresolved custody risks |
| [Roadmap](docs/ROADMAP.md) | Implemented milestones and the next audited deliverables |
| [Protocol and economics](docs/PROTOCOL_AND_ECONOMICS.md) | Pyth/Rhea amounts, same-token routes, NEAR costs and realized profit |
| [Stage137 technical note](docs/STAGE137_OUTCOME_MERKLE_AND_MAINNET_POLICY.md) | Current Merkle-proof and mainnet admission code |
| [Source reuse](docs/REUSE.md) | Upstream research and license handling |

The `docs/RHEA_STAGE*.md` files preserve the engineering history. Their historical status labels are **not a replacement** for this README or the current evidence ledger.

## Your wallet, your funds

No user's NEAR account is configured. `arbivane-replay.test.near` is only a disposable Sandbox account. For a personal wallet, start with the [NEAR ecosystem wallet directory](https://wallet.near.org/) or [Meteor Wallet](https://wallet.meteorwallet.app/). **Do not enter a recovery phrase, private key or seed phrase in a GitHub secret, issue, pull request, chat or application config.** A future integration should require separate operator-controlled authorization and enforceable caps; current Stage138 is only a review tool.

## Non-goals and current limits

ARBIVANE is currently a research and local execution-verification system. It has **no deployed custody/treasury contract, production scheduler with persistent trade outbox, proven live competitor count, autonomous mainnet trader, realized swap execution, NEAR Intents settlement, working consumer dashboard, deployed Shade/TEE agent or production AI decision-maker**. The corresponding directories contain design or pure validation logic, not evidence those services are running.

**No mainnet trading is enabled. No profit is guaranteed.** Use the audit artifacts to evaluate what is actually demonstrated.
