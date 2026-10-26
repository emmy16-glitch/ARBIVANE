# Documentation guide

This page is the starting point for understanding ARBIVANE **as it exists now**, not a chronological dump of engineering notes. Updated 26 October 2026.

## Choose the information you need

| Question | Document |
| --- | --- |
| What is ARBIVANE, and is it running? | [README](../README.md) |
| What has genuinely succeeded, with proof? | [Status and evidence](STATUS_AND_EVIDENCE.md) |
| How do the scanners, Rhea math and local execution fit together? | [Architecture](ARCHITECTURE.md) |
| How do I install, test, inspect or rerun the project? | [Operations](OPERATIONS.md) |
| What happens in a Rhea liquidation and what constitutes profit? | [Protocol and economics](PROTOCOL_AND_ECONOMICS.md) |
| Where do I create a wallet? Can this spend my NEAR? | [Wallet and mainnet](WALLET_AND_MAINNET.md) |
| What are the serious security gaps? | [Security](SECURITY.md) |
| What remains to be built next? | [Roadmap](ROADMAP.md) |
| Can liquidation be done with no capital or a real flash loan? | [Stage139: funding-source verification](STAGE139_FLASH_LIQUIDITY_FINANCING.md) |
| How do the new light-client and budget-checking prototypes work? | [Stage137 note](STAGE137_OUTCOME_MERKLE_AND_MAINNET_POLICY.md) |
| What research and third-party code informed the design? | [Reuse](REUSE.md) |

## Core terminology

**Source block.** A pinned finalized NEAR block where Rhea contract configuration, borrower state and price-related evidence are read consistently.

**Position.** A Rhea borrowing/collateral position, potentially isolated. Each position must be valued with the proper protocol rules rather than a wallet's aggregate balance alone.

**Internal lending units.** Amounts derived from share accounting and market indices. They are **not interchangeable** with a NEP-141 wallet token's atomic units or a currency such as USD.

**Candidate.** A borrower/asset pair that might be eligible. Detection or a favorable health factor is not a finalizable transaction.

**Sandbox.** NEAR Workspaces local chain, running imported contract bytecode/state with disposable signing keys. It does not spend the operator's mainnet assets.

**Receipt.** NEAR asynchronous execution/callback result. A successful outer transaction does not automatically prove every child callback succeeded; the canonical set must be checked.

**Seized token inventory.** Net NEP-141 tokens received after a liquidation and all associated debt repayments. This is not realized net profit until sold or valued and settled with actual complete cost accounting.

## The current truth in one paragraph

ARBIVANE has genuine reproducible NEAR **Sandbox** executions of Rhea's four-action liquidation and independent receipts, balance reconciliation, signed transaction Borsh/Ed25519 validation. The Stage137 implementation adds *self-consistency* checks for NEAR outcome Merkle paths, and Stage138 previews strict mainnet capital policy. Neither supplies a validator-authenticated canonical head, real owner-funded signer, executable net-profit route or profit transfer. Mainnet signing and spending are disabled.

## Where the historical research lives

The repository retains `docs/RHEA_STAGE*.md` for the original investigation: initial market/oracle reads (Stages 3–29), scaling borrower scans (30–34 and 40–63), mathematical and execution admission (35–38), detailed Workspaces state imports and oracle parity (45–55 and 75–118), genuine Rhea transactions and later fixes (119–136). This numbering is engineering history, **not** a user-facing workflow. Some of those reports correctly say “no successful liquidation” *at their original date*. That statement was superseded by the successful Stage93 runs referenced in [Status and evidence](STATUS_AND_EVIDENCE.md).

Use `NEXT_STEPS.md` for the chronological implementation log and [Status and evidence](STATUS_AND_EVIDENCE.md) for the current verifiable result. Historical notes should not be silently rewritten to suggest a result was known earlier than it was.

## Contributing and maintaining accuracy

Documentation must identify its supporting code module, link a real test/action artifact when claiming a chain result and distinguish: **implemented** (source exists), **tested** (tests pass), **executed** (real network or Sandbox transaction happened), **economically settled** (actual profit reconciliation), and **deployed** (running service/contract). These are not equivalent.

Prefer exact network, protocol, timestamp, transaction ID, source block, asset unit and run ID. Never turn a mock fixture, local test or estimated edge into a verified mainnet transaction. Keep any secrets out of repository files, CI logs and reports.
