# ARBIVANE roadmap — proven milestones and next acceptance tests

**Status as of 26 October 2026.** Engineering began 23 October 2026. This plan distinguishes completed code, independently observed local contract execution and future **owner-funded** execution. It replaces the previous Stage 1/2 and proposed two-week sprint list as the primary roadmap; historical Stage documents remain in the repository for provenance.

## Priority milestone — independently prove genuinely collateral-free financing

The owner cannot supply trading principal or collateral. Stage139 isolates the real funding issue from the successful Sandbox liquidation: authentic Stage93 funding included **1 NEAR of locally minted wrapped-NEAR collateral**, so its zero final debt does **not** establish a flash loan.

- **Implemented:** original-run collateral-classification verifier, zero-collateral forgery tests and read-only candidate financing/economics gate.
- **Not achieved:** identified deployed lender offering the necessary uncollateralized LiNEAR asset, auditable NEAR asynchronous repayment/recovery, usable loan proceeds within Rhea, external loan repayment, gas sponsorship or capital-free local settlement.
- **Next:** independently identify and attest a deployed native liquidity provider; if compatible, extend Workspaces to include real provider/token state and prove the end-to-end issue → liquidate → repay principal+fee → reconcile flow, including failed callbacks. If none qualifies, record a clear `NO_COMPATIBLE_NEAR_FLASH_LOAN_SOURCE` blocker rather than fabricating liquidity.
- **Until then:** mainnet signing and spending remain disabled. Public owner wallet `okunlola_labs.near` and proposed restricted `sillywiki4201.near` do not need to be funded for research.

See [Stage139 financing](STAGE139_FLASH_LIQUIDITY_FINANCING.md). Stage140 extends it with read-only finalized Rhea/Ref deployed WASM and SHA256/method-export inspection, without falsely certifying a flash lender. See [Stage140](STAGE140_NATIVE_PROVIDER_DISCOVERY.md).

## Delivered

| Capability | Implementation | Verified evidence |
| --- | --- | --- |
| Deterministic project foundation | BigInt amount accounting, lifecycle state machine, deny-by-default risk policy, tests | npm run check, GitHub CI |
| Read-only Rhea discovery | Asset/borrower/debt indexing, full and sharded pagination, cursor recovery, RPC failover and rate limits | Earlier Rhea investigation/workflow artifacts; scope varies by run |
| Protocol checks | Source-backed share conversions, oracle precision, isolated collateral/debt health, capped repay/seize sizing, current Pyth admission | Historical stage35/38 source proofs and parity tests |
| NEAR Workspaces imported-state replay | Lending/oracle/wrapped NEAR/LiNEAR bytecode and relevant storage, account registration, real Sandbox actor collateral | Stage90–96 import canaries, subsequent Stage93 real runs |
| **Real local Rhea liquidation** | Signed Borrow → Liquidate → Repay → Withdraw, original successful FINAL async callback and borrower/actor/FT balance verification | [Stage93 #40315134156](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40315134156), [#40317139342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342), [#40320594342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594342) |
| Independent transaction authenticity | Original signed proof, canonical receipt review, SHA-256 source artifact fingerprints, rebuilt NEAR Borsh V0 preimage, SHA-256 and Ed25519 | [Stage135/136 audit](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594331) |
| Merkle path checker | Outcome, shard, lite-header and supplied-head-root consistency | [Stage137 read-only gate](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage137-proof-gate.yml); a trusted validator head is **not** yet authenticated |
| Mainnet capital policy preview | Explicit spending, loss, quote and profitability validation with unconditional broadcast refusal | Stage138 source and test suite; **not** a funded execution authority |

These milestones support the central claim: a **real Rhea liquidation has been completed inside local NEAR Sandbox**. They do not support a claim that a funded mainnet liquidation, sale or withdrawal has produced profit.

## Next milestone 1 — validator-authenticated canonical outcome inclusion

**Objective:** turn Stage137's self-consistency proof into authenticated canonical-chain evidence.

**Engineering work:** obtain genuine NEAR light-client proof responses from read-only RPC, independently verify the trusted validator-approved light-client head and epoch transitions, and authenticate all relevant outcome Merkle paths against that head. Explicitly distinguish historical NEAR-mainnet receipts from local Sandbox receipts.

**Acceptance:** authentic public transaction inclusion with trusted checkpoint chain; altered root/path, stale head, incorrect epoch or forged validator approval rejected. No permission to spend.

## Next milestone 2 — stronger source-to-Sandbox state attestation

**Objective:** independently establish the exact historical state relied on for a replay.

**Engineering work:** capture source contract hashes, state roots and relevant storage proofs for Rhea lending, Pyth/oracle and NEP-141 assets; verify imported bytes and accounted balances against anchored mainnet sources. Document where provider APIs do not supply a full authenticated trie proof.

**Acceptance:** independently reproducible source/import manifest with no unexplained missing storage or mutable provenance. A selected-key import must not be presented as parity of the complete mainnet trie.

## Next milestone 3 — current executable opportunity economics

**Objective:** identify opportunities that are positive *after* actual financing and settlement costs, not merely source-sized liquidation spreads.

**Engineering work:** fresh borrower and Rhea share health, executable funding, conservative on-chain liquidity reserve, current Pyth price, realistic sell/swap quotes and depth, storage/gas/slippage, route failure downside, competitive revalidation, a common audited value unit and bounded retries.

**Acceptance:** a real, current, fully sourced opportunity with independently checked minimum positive net value and explicit expiry; fail-closed outcomes when prices or fills change. No exposure to real money during proof construction.

## Next milestone 4 — owner wallet and enforceable bounded custody

**Objective:** an account and permissions owned by the user rather than by a development runner.

**Engineering work:** obtain only public NEAR account ID and explicit risk decisions from owner; design separate low-balance executor or on-chain treasury; bind allowed contracts/methods, capital per trade, daily total, maximum loss and pause/revocation to actual keys or contract custody; implement durable nonce/idempotency/outbox to avoid duplicate spending after timeout.

**Acceptance:** tests showing unauthorized and over-limit operations cannot move any asset, even with a compromised agent; missing budget/wallet/signature always rejects. A generic green policy JSON must not authorize a full-access key.

## Next milestone 5 — bounded funded mainnet transaction

**Blocked until milestones 1–4 and owner consent.** Integrate and audit wallet signing with owner-controlled permissions; verify current Rhea Wasm/quotes/asset cap, get approval for the exact transaction, start with a small owner-approved amount and reconcile all chain receipts, capital and gas. Avoid retries while prior finality is unknown.

**Acceptance:** real canonical transaction hash, source opportunity and authorized risk budget, successful callbacks and separately verified changes to the owner's account/execution treasury. Realized net profit must not be asserted until collateral is sold and full costs accounted.

## Next milestone 6 — settlement, reporting and hardening

**Objective:** determine actual profits and provide an owner-reviewable record.

**Engineering work:** swap/sell/NEAR Intents integration only when route compatibility and refund flow are tested, actual asset inventory and realized proceeds ledger, fee reconciliation, proof archive, operator dashboard, alerts, kill switch, persistent runtime and independent security audits.

**Acceptance:** owner can explain each signed transfer, stop future spending and verify actual realized profit to their account from canonical transactions.

## Possible later extensions, not live

Shade/TEE attested agents, NEAR AI evidence explanations, cross-chain execution, Morpho and EVM flash loans, dedicated monitoring dashboard and deployed Rust treasury. The current repository contains preliminary modules or design notes, not live audited instances of those technologies.

## Project completion definition

The project is end-to-end only after it can **find** a presently eligible Rhea position, **independently verify** it, **safely authorize** limited capital under owner's control, **execute and finalize** a profitable chain transaction, **reconcile** all assets and debt, and **deliver realized net proceeds** to an approved account without an unrestricted key or unbounded retry loop. The successful Sandbox proof is a critical earlier milestone, not the whole system.

For exact run IDs and asset unit definitions, use [Evidence and status](STATUS_AND_EVIDENCE.md). For setup and operator requirements, use [Operations](OPERATIONS.md) and [Wallet and mainnet](WALLET_AND_MAINNET.md).
