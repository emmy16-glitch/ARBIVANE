# Implementation plan and acceptance criteria

Research and a Stage 1 safety foundation were begun October 23, 2026 at the user's request. Hackathon organizers may have time-window rules; check them and distinguish pre-hackathon preparation from eligible implementation work.

## Stage 1 (implemented in code, not deployed)

- [x] Typed data model and signed/unsigned integer parsing
- [x] Conservative financial estimates with rounding helpers
- [x] Fail-closed risk decision engine
- [x] Historical competition pressure proxy with explicit uncertainty
- [x] Read-only, finalized-block NEAR/Rhea RPC scanner (mock tests only)
- [x] Lifecycle transition validator and nonpersistent replay helper
- [x] Settlement order guard (no funds moving)
- [x] Test suite and CI configuration
- [ ] Test read-only scan against current real Rhea deployment

## November 1–14 target sprint, subject to verification

| Day | Delivery | Acceptance proof |
| --- | --- | --- |
| 1 | Verify Rhea contracts, oracles, methods and deployment/network | Logged final-block read with on-chain call evidence |
| 2 | Exact position/share parsing and protocol health math | Test vectors match verified deployed contract |
| 3 | Liquidation sizing and liquidator financing model | No division/rounding or liquidity mismatch in edge fixtures |
| 4 | Fresh candidate revalidation and invalidation | A stale borrower or price cannot enter approved state |
| 5 | Risk, cost model, market depth and competition evidence | Adversarial fixtures cause reject decisions |
| 6 | Build on-chain Rust policy/treasury prototype | Owner, limit, replay, pause, expiry unit tests |
| 7 | Verify on-chain custody and protocol call path | Unauthorized worker cannot spend even if compromised |
| 8 | Shade SDK + TEE testnet registration | Attestation and unauthorized rejection both demonstrated |
| 9 | Transaction outbox + durable state machine | Crash, restart, replay, duplicate callback tests |
| 10 | Verified NEAR AI explanation adapter | AI cannot override deterministic policy; verification proof |
| 11 | Reconciliation against actual receipt and balances | Accounting separates unsold inventory from proceeds |
| 12 | NEAR Intents quote/status/refund adapter | Sandbox fixture plus **optional** owner-authorized tiny mainnet round-trip |
| 13 | Readable owner dashboard, observability and kill-switch UI | Judge can see all evidence without private keys |
| 14 | End-to-end safety demo, documentation and submission | Independent steps reproduce all claims |

**Priority:** If Rhea funding/custody or exact liquidations cannot be validated, show accurate detection/paper decision paths, actual testnet contract controls and a separate small-value Intents proof. Do **not** claim mainnet trading worked when it did not.

## Post-hackathon only

Morpho Base read-only integration, Chain Signatures, audited custody/execution, competing-liquidator data pipeline, optional EVM flash-loan execution and production live capital controls.
