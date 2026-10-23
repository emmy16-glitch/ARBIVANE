# Architecture: current implementation vs target

The project is designed as a **modular monorepo** that can run a single process during early development. Components communicate through typed, deterministic records rather than trusting one AI-driven script.

## Existing implementation

```text
src/domain/types.ts              Financial types and chain snapshot evidence
src/domain/money.ts              Fixed-point integer calculations, rounding rules
src/rhea/rpc.ts                  Finality-pinned, read-only NEAR JSON-RPC transport
src/rhea/scanner.ts              Read-only, bounded Rhea protocol discovery
src/risk/evaluate.ts             Deny-by-default execution policy evaluator
src/competition/score.ts         Historical pressure with explicit uncertainty
src/pipeline/lifecycle.ts        Legal transition graph + demo replay guard
src/reconciliation/profit.ts     Require finality + realised inventory for token P&L
src/settlement/intents.ts        Validation of *proposed* settlement parameters
src/demo/run.ts                  Fixture: always non-executable
```

## Target dependencies, not yet wired

```text
         NEAR finalized RPC          Rhea lending + oracle
                  \                    /
                    discovery adapter
                           |
                 fresh protocol maths
                           |
                    candidate record
                           |
             competition/economic analysis
                           |
               deterministic risk checks <--- AI explanation (never a signer)
                           |
                  contract authorization <--- attested Shade identity
                           |
             NEAR-native Rhea executor (only if custody enforced)
                           |
                  final receipts + token balances
                           |
                   realized P&L ledger
                           |
             NEAR Intents separate settlement
                           |
                 verified user wallet receipt
```

## Deterministic policy has no privileged AI dependency

A network model can help interpret historical evidence and describe candidates, but may not set spending caps, declare a protocol position liquidatable, or approve token movement. `evaluateCandidate` rejects wrong network, non-allowlisted contracts, fixture-only snapshots, unknown oracle freshness, expired candidates, funding gaps, missing contract custody, incomplete preflight and uncertain competition.

The current `safeDefaultPolicy` disables all execution and has an empty contract allowlist. The sample evaluation that passes *with hypothetical fully verified inputs* is a unit test of policy logic, not a real credential or enforcement mechanism. There is no transaction signing or broadcast API here.

## Consistency and idempotency

The scanner initially reads assets at RPC finality `final`, obtains a block number, then reads market counts, prices and account pages at that exact same `block_id`. Any mismatched response aborts. Downstream execution will need a fresh state read immediately before signing, even after passing the first snapshot.

The lifecycle strictly enforces `DISCOVERED -> REVALIDATING -> ANALYSED -> RISK_APPROVED -> POLICY_APPROVED -> SUBMITTED -> FINAL -> RECONCILED -> SETTLEMENT_PENDING -> SETTLED` plus rejection/failure states. Its in-memory idempotency helper is **demo-only**. Production needs a persistent store with a unique key per chain/protocol/target/candidate/intent and a transaction-outbox protocol; a process restart must not permit replay.

## Financial units

All on-chain amounts are represented as decimal strings and evaluated as `bigint`. Profit estimates use integer **micro-USD** accounting (`USD E6`). Costs include repayment, network fees, swaps/route, financing, storage, race and inventory risk. Price conversion must explicitly apply token decimals and conservative rounding. `reconcileRealisedAtomic` computes a token-denominated result only when the final receipt exists and collateral has actually been sold; it is not a substitute for accounting all token transfers on chain.

## Why the original bot is not copied wholesale

The older Rhea/Burrow bot mixes scanning, pricing, candidate selection, local file writes and execution. We use its `get_assets_paged`, `get_num_accounts`, `get_accounts_paged`, `get_price_data` interactions as **unverified API references** and do not port its financial formulas before source-backed rounding tests. From Morpho's framework we reuse *patterns*: discovery is not proof, revalidate on chain, simulate the exact call, keep pending lifecycle, and maintain structured logs. From Shade we will adopt an attested worker whose privilege is confined to a contract.

## Never confuse approval with enforcement

A NEAR policy contract is meaningful only if the execution account and funds are **actually controlled by that contract**, or the protocol itself validates the policy. A worker that receives an `ALLOW` response then signs an unrestricted transaction from a separate Full Access key bypasses the policy. This is a design blocker, not a completed feature.
