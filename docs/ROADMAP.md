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

## Stage 2 (completed locally; NOT yet validated against current live contracts)

- [x] Parse historical Burrow-style asset pools, share balances, risk ratios and price feed structures with strict schema checks.
- [x] Use bigint fixed-point arithmetic with conservative rounding and debt-free/unknown-price handling.
- [x] Implement documented Rhea initial/final health and liquidation discount rules without constructing executable transactions.
- [x] Match the Rhea official published 1000-DAI / 152-wNEAR example in automated tests.
- [x] Fail closed on malformed data, zero share pools, missing or duplicate oracle prices and invalid transfers.
- [x] Document the current `aggregate-oracle.near` vs legacy `priceoracle.near` difference.
- [ ] Confirm actual deployed oracle method ABI and successful pinned-block **live** RPC reads.
- [ ] Verify arithmetic parity, precise rounding, asset config and code hashes against live lending contract.
- [ ] Independently verify financing and health constraints for the liquidator.

See [Rhea parity evidence](RHEA_PARITY.md). No execution capability added.

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

## Stage 3 (October 23, 2026): public contract identity / API compatibility probe

- [x] Implement read-only, finalized-block-pinned contract account/code hash verification.
- [x] Add schema and freshness probe for current documented Rhea contracts with no fallback to legacy oracle.
- [x] Add mock-RPC regression coverage including oracle method and code-hash mismatch.
- [x] Add advisory GitHub Actions network probe storing verifiable diagnostics.
- [ ] Confirm real mainnet RPC probe output and capture exact code hashes, timestamp and error methods.
- [ ] Differential-test current deployed contract math and receipt traces. No funds or transaction execution until audited.

## Stage 4 (October 24, 2026): Pyth-style aggregate oracle adapter

- [x] Identify documented Pyth oracle method signatures and a real Rhea-to-oracle receipt.
- [x] Implement explicit asset-to-price-ID mappings with no implicit symbol fallback.
- [x] Parse Pyth price, confidence, exponent and publish timestamp via integer math.
- [x] Read single-block Pyth batch quotes and reject null, stale, out-of-bound and partial responses.
- [x] Add non-executing compatibility CLI with code-hash observations and 9+ regression tests.
- [ ] Confirm on-chain mappings and current deployed oracle source and code hashes.
- [ ] Confirm current RPC outputs match this parser; GitHub Actions advisory probe cannot authorize trading.
- [ ] Establish exact lending-contract liquidation arithmetic and gas/financing controls.

See [Stage 4 aggregate oracle details](RHEA_AGGREGATE_ORACLE.md).

## Stage 5 — lending-owned price metadata discovery (read-only)

- [x] Implement finalized-block-pinned `get_config`, `get_assets_paged` and `get_all_token_pyth_infos` reads.
- [x] Parse token-specific feed identifiers/default prices and flag missing information.
- [x] Preserve shared-feed mappings without inferring asset values or liquidator profit.
- [x] Add fail-closed code-hash pin, block consistency and invalid-schema tests.
- [x] Add advisory GitHub Actions diagnostics, isolated from wallet and transaction signing.
- [ ] Confirm live mainnet method/API compatibility from actual recorded CI evidence.
- [ ] Verify derived asset price ratios, oracle refresh constraints and on-chain contract lineage.
- [ ] Differential test health-factor, share rounding, liquidation restrictions and liquidator financing against deployed contract.
- [ ] Verify source/code-hash matching before funding or any form of execution.

**No live liquidation, transfer, wallet signing, or safe-trading designation exists.**


### Stage 6 implementation (read-only)

- [x] Classify unpriced lending assets using same-block global pool balances and configuration flags.
- [x] Add strict derivative-token ratio price **diagnostics**, without using them as execution valuations.
- [x] Add provenance-aware, non-authorizing valuation reference comparisons.
- [x] Add advisory on-chain coverage workflow and explicit issue #7 follow-up.
- [ ] Verify current deployed-contract price semantics and exact liquidation arithmetic with independently audited source.
- [ ] Independently resolve all four missing assets and close issue #7 based on actual borrower positions, source and RPC evidence.
- [ ] Build an enforceable NEAR policy/treasury contract; no funds before a security review.


### Stage 7 (research prototype) — borrower exposure + offline differential harness
- Implement a bounded, read-only borrower sample at a finalized block.
- Count missing-price collateral/debt exposure without treating shares as USD.
- Check reference fixtures against indicative arithmetic; never grant parity.
- **Not complete:** exhaustive borrower enumeration, on-chain source verification, USN authoritative valuation, deployed liquidation math, custody safety, TEE, real execution.
