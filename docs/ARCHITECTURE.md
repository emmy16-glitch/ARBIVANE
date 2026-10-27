# System architecture

**Current implementation, 26 October 2026.** ARBIVANE is a NEAR-first Rhea liquidation research and *local execution* system. It has deterministic TypeScript/Node components, public-chain read-only adapters, a NEAR Workspaces runner, independent cryptographic verification and GitHub Actions orchestration. It is **not** a deployed, owner-funded autonomous trading service.

## Execution pipeline

1. **Source discovery.** Public NEAR finalized RPC reads fetch Rhea asset metadata, indexed borrowers, positions, pool balances and prices at a consistent source block.
2. **Candidate assessment.** Fixed-point BigInt math enforces health, protocol liquidation constraints, price precision/freshness, liquidity and conservative source-sized repayment bounds. Historical competitor pressure is advisory, not knowledge of current rivals.
3. **Sandbox admission.** An eligible historical borrower is independently checked, and relevant Rhea lending, oracle and fungible token bytecode/state is imported into disposable NEAR Workspaces.
4. **Actor provisioning.** The local actor is registered for required assets and funded with genuine *Sandbox* wNEAR collateral. It must have no preexisting borrowing shares.
5. **Genuine local transaction.** One signed Rhea execute_with_pyth call performs Borrow → Liquidate → Repay → Withdraw with source-capped amounts. NEAR promises and callback receipts are part of the sequence.
6. **Completion and persistence.** The original signed transaction is resolved to FINAL with authentic asynchronous callback definitions. Later finalized local state reads must show reduced borrower debt and collateral, an increase in seized FT and **zero** outstanding actor debt.
7. **Independent proof.** Stage135 rechecks the original source plan, signed identity, callbacks, raw balance changes and artifact hashes. Stage136 independently Borsh-serializes the original TransactionV0 fields and verifies SHA-256/Ed25519.
8. **Archived review.** GitHub Actions publishes source, receipts, state and final proof only after all gates succeed.

The public source chain is NEAR mainnet, but the execution is **only inside isolated Sandbox**. FINAL on a disposable Workspaces chain does **not** mean mainnet assets moved.

## Code map

| Module | Code location | Role |
| --- | --- | --- |
| Fixed-point types and financial math | src/domain/types.ts, src/domain/money.ts | Typed integer strings, rounding and costs |
| NEAR RPC transport | src/rhea/rpc.ts, src/rhea/resilient-readonly-rpc.ts | Finalized source reads, fallback |
| Account and position discovery | src/rhea/scanner.ts, src/rhea/paged-position-index.ts, src/rhea/market-debt-index.ts | Borrower/debt pagination and checkpoints |
| Oracle, Rhea rules and sizing | src/rhea/execution-pyth-valuation.ts, src/rhea/source-math.ts, src/rhea/stage35-atomic-reference-sizing.ts | Source-validated pricing/health/amounts |
| Policy and competition | src/risk/evaluate.ts, src/competition/score.ts | Deterministic rejection and historical pressure |
| State import and canaries | scripts/stage46-paged-sandbox-clone.mjs, scripts/stage82-targeted-lending-clone.mjs, scripts/stage89-targeted-wnear-clone.mjs, scripts/stage91-targeted-linear-token.mjs | Rebuild required Rhea state locally |
| Real local liquidation | scripts/stage37-workspaces-sandbox-replay.mjs | Signed atomic actions in Workspaces |
| Receipts, finality, settlement | scripts/stage124-final-rhea-receipts.mjs, scripts/stage134-finality-fallback.mjs, src/rhea/stage41-sandbox-settlement.ts, src/rhea/stage48-finalized-sandbox-witness.ts | Verify outcomes and net state |
| Signed proof | scripts/stage116-signed-sandbox-evidence.mjs, scripts/stage135-independent-proof.mjs, scripts/stage136-near-borsh-preimage.mjs | Authenticity and cross-file accounting |
| Merkle and budget previews | scripts/stage137-near-outcome-merkle.mjs, scripts/stage138-mainnet-spending-admission.mjs | Read-only path consistency and spend-policy rejection |
| Accounting / proposed settlement | src/reconciliation/profit.ts, src/settlement/intents.ts | Pure validation, **not** live swaps |
| Operations dashboard | dashboard/server, dashboard/web | Authenticated controls, isolated state, SSE events, and evidence-only presentation |

The dashboard service is runnable but not deployed by this repository. A source file or GitHub Actions workflow alone does not imply a deployed application. See [Dashboard operations](DASHBOARD.md) for configuration and the exact supported environment boundaries.

## Finalized source data and amounts

The scanner pages Rhea accounts and keeps each valuation and contract view pinned to the same source block. The source formulas handle borrower shares, token atomic amounts, market indices, isolated positions, active Pyth quotes, configured token decimals and extra decimal factors. Incomplete or stale quotes must fail closed.

Source-gross spreads do not equal final liquidator wallet inventory. Changes in underlying displayed balances over a long local chain advance can reflect interest accrual rather than ownership change. Stage48 therefore checks authenticated asset/share ownership and exact FT balances across snapshots, not simplistic byte-for-byte equality of all accrual displays.

The full-price and market-cap evidence must match the intended source block; mock results cannot authorize a real Sandbox attempt.

## Async execution and evidence

NEAR's cross-contract calls are asynchronous. A successful initial transaction or an emitted event is insufficient to prove successful Liquidate and Withdraw. Stage130 resolves the authentic receipt tree to a canonical FINAL response; Stage41 recomputes borrower debt/collateral changes and verifies actor FT gained, while requiring the actor's borrowed liability to return to zero. Stage55 records durable execution phases so a failure can be attributed to import, funding, oracle, receipts or final balance gates.

Stage136 reconstructs the original signed TransactionV0 preimage from signer ID, public key, nonce, receiver, actual local reference block hash and one FunctionCall action (args, gas and attached yoctoNEAR). The recomputed transaction hash and Ed25519 signature have been tested against a real archived successful transaction. The local reference block is not a validator-authenticated mainnet block.

The [Evidence ledger](STATUS_AND_EVIDENCE.md) links the actual successful Stage93 runs and precise observed units.

## Wallet and custody boundary

There are **three distinct authority levels**:

- The mainnet **reader** can query public chain state; it cannot send transfers.
- The disposable **Sandbox actor** can sign on the isolated Workspaces chain with explicit Sandbox-only guards. It cannot spend real wallet balances.
- The **future mainnet executor**, which does not exist today, would need owner-controlled keys, independently enforceable trading caps, authorization and durable transaction reconciliation.

The generic SAFE_DEFAULT_POLICY has execution disabled and an empty contract allowlist. Stage138 evaluates proposed risk limits but **always refuses broadcasting**. An off-chain ALLOW string is not a substitute for contract-held custody or correctly scoped access keys.

A future Rust policy treasury, Shade-attested worker and NEAR Intents route are design proposals, not deployed or audited components.

## Dashboard security boundary

Dashboard data is physically separated into Sandbox, Testnet, and Mainnet state/event directories. Browser commands map to fixed server adapters and cannot submit arbitrary commands. SSE event IDs are monotonic and persisted for reconnect replay. The current Sandbox adapter launches the existing genuine Workspaces runner while explicitly disabling mainnet execution and clearing signing variables. Testnet execution remains unavailable until a supported wallet/contract adapter is implemented; Mainnet has no signing route.

Accounting fields remain empty until a receipt and balance evidence importer independently reconciles them. Historical success documentation is never treated as the current session's wallet balance or realized profit.

## Production gaps

The repository does not have a production wallet-connect adapter, funded mainnet signer, audited treasury, transactional job/outbox database, deployed Shade/TEE runtime, verified swap executor, realized profit transfer or validator-authenticated canonical outcome proof. The dashboard provides durable local state and event logs, not a distributed database or deployed service.

Stage137 checks supplied outcome Merkle paths and lite-header hashes, but its head root is not independently authenticated with NEAR validator approvals. Imported local contract state has not been proved equivalent to the **entire** historic mainnet state trie.

See [Protocol and economics](PROTOCOL_AND_ECONOMICS.md), [Security](SECURITY.md), [Roadmap](ROADMAP.md) and [Wallet and mainnet](WALLET_AND_MAINNET.md) for detail.
