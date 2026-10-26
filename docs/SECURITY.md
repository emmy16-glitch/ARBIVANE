# Security model and production blockers

**Current assessment — 26 October 2026.** ARBIVANE has genuine local NEAR Sandbox transaction and state verification. It does not have a production mainnet signer, wallet custody, enforceable funded trading limits or a realized-profit withdrawal system.

## Current enforcement boundaries

| Boundary | What is implemented | What must not be inferred |
| --- | --- | --- |
| Public NEAR RPC | Read-only queries and fixed-block checks for Rhea borrower, oracle, asset and code evidence | Permission to sign or submit a trade |
| Local NEAR Workspaces | Disposable Sandbox actor, imported relevant Rhea/token/oracle contracts and genuine signed local calls | Access to owner wallet or full-mainnet state-trie equivalence |
| Callback and balance verification | Original FINAL receipt/callback checks, account shares and FT balances, zero actor debt | A completed swap or cash profit |
| Transaction-authenticity verification | Independent legacy V0 Borsh reconstruction, SHA-256 and Ed25519; SHA-256 fingerprints of source artifacts | Validator-certified inclusion into canonical NEAR mainnet |
| Merkle paths | Stage137 calculates outcomes, paths and supplied header/root consistency | Independently authenticated validator-approved head |
| Mainnet capital policy | Stage138 rejects missing budgets, stale quotes, unverified economics, unauthorized signing | An enforceable on-chain risk limit or usable mainnet broadcaster |

The earliest README and this document once said that **no transaction executes anywhere**. That statement is superseded by the recorded **Sandbox-only** Rhea liquidations ([evidence](STATUS_AND_EVIDENCE.md)). The owner has not transferred capital.

## Threat model

**Stale positions and manipulated price data.** A borrower can repay, collateral can change and oracle prices can expire while a scan is running. Source reads are pinned to an exact block, and fresh same-block Pyth and eligible-route checks must be redone before attempting any future funded transaction. Missing or incompatible data rejects the opportunity.

**Partial or mismatched imported contract state.** The Sandbox runner verifies relevant contract code, token vault holdings, borrower positions, asset share indexes and critical oracle views against pinned source. Successful selected-key import is not a complete Merkle state-trie attestation.

**Asynchronous callback ambiguity.** Rhea uses cross-contract calls. The original outer transaction may emit intermediate events even if a later callback fails. Stage130 requires canonical original signed FINAL outcome/child receipts. Stage41 requires actual borrower debt/collateral reductions, liquidator FT gain, and zero remaining actor debt. Stage48 examines later finalized persistence, rather than assuming a requested block jump advanced chain finality.

**Forged reports or compromised runner.** Stage135 checks raw signed transaction, source-approved action sizing, canonical receipt status, source-file hashes and independent state. Stage136 reconstructs the signed transaction Borsh bytes, verifies the hash and Ed25519 signature. Local evidence still depends on truthful original chain/import sources and is not a validator-approved mainnet outcome proof.

**AI decisions and operator impersonation.** No language model has spending privileges. An explanation, risk estimate or JSON boolean saying approved cannot authorize use of funds. Operator approval must be cryptographically bound to a specific owner, network, asset, contract, budget and transaction.

**Competition and false profits.** Historical liquidation counts are not a live inventory of competitors. An estimated margin before gas, funding, slippage, sale and storage cost is not realized net profit. Received LiNEAR token inventory in the local actor is not withdrawable owner income.

**Wallet compromise and unauthorized spending.** No owner account or production key is configured. The planned treasury/policy contract is **not deployed**, and Stage138 always returns maySignMainnet=false and mayBroadcastMainnet=false. There is no mainnet trade executor in this milestone.

**Replay after crash or partial finalization.** GitHub Actions concurrency helps serialize isolated tests, but it does not provide the persistent nonce/outbox accounting required for a production exchange or liquidation system.

## Before mainnet capital can be used

1. Confirm an owner-controlled NEAR mainnet account ID, separately bounded execution funds and a verified owner approval mechanism. Do not put owner private keys into repository or GitHub Actions.
2. Require executable current-chain source/wasm/price/parity checks, valid borrower health, financing headroom and actual reserved liquidity. Do not treat historical Sandbox eligibility as live eligibility.
3. Calculate conservative after-cost *realized* net-profit potential in a common unit, including liquidity depth, actual swap/quote fill, slippage, gas, storage, financing and race costs.
4. Design and independently review a restricted custody/signing route with a real owner-controlled enforcement boundary. A separate Full Access worker key must not be capable of bypassing the off-chain policy.
5. Implement transaction-level and daily capital caps, maximum loss, minimum net profit, cancellation/pause, key revocation, replay protection, deduplication and a durable outbox.
6. Validate the current action on a state-faithful test and require manually approved, very small first mainnet spend with complete canonical receipts and on-chain balance reconciliation.
7. Complete security review of the wallet adapter and protocol interaction. Automatic retries must first determine whether the prior signed transaction finalized.

**Mainnet execution is not enabled.** This is a missing audited feature, not merely an environment variable that needs to be flipped.

## Wallet and credential handling

NEVER share a seed phrase, private key, mnemonic, recovery file or password in chat, screenshots, source, issues, PRs, CI, logs or project documentation. Public NEAR account IDs and public transaction hashes are fine. For significant funds, retain ownership on a hardware-protected wallet and isolate a small execution allowance or escrow under a separately tested policy. NEAR FunctionCall access keys may restrict method and receiver; they do not automatically enforce all of ARBIVANE's daily loss or economic constraints.

Start with [Owner wallet and mainnet](WALLET_AND_MAINNET.md). An eventual security incident procedure must include pausing execution, revoking access keys, preserving the original receipts and reconciling all transfers before retrying.

## Dependencies, disclosure and limitations

The project studies Rhea/Burrow, Morpho, Shade and NEAR Intents, but does not inherit audits or security claims from referenced upstream code. See [third-party sources](REUSE.md). The Stage137 path checker is **not a trusted light client** because validator approvals/epoch transitions are not independently checked.

Report vulnerabilities privately with a redacted reproduction and public transaction or run identifiers. Never attach access keys or recovery material.
