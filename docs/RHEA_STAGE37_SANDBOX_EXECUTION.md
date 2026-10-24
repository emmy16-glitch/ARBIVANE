# Stage37 — Real contract transaction attempt in isolated NEAR Sandbox

ARBIVANE now has a transaction runner, **not a mainnet trader**.

## Grounded executable route

Stage36 observed a real mainnet transaction calling `contract.main.burrow.near.execute_with_pyth` with `Borrow → Liquidate → Withdraw`. Its historical callback **failed**, so copying its ABI alone cannot constitute successful liquidation. Stage35 investigated `godlike.near` and found **zero positive-spread source-rule-compliant combinations**; therefore that account is not a valid current trade. This release does not bypass that negative evidence.

`src/rhea/stage37-sandbox-liquidation.ts` builds a strictly validated three-action message only if a real Stage35 run supplies a positive `PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE` reference scenario, with explicit non-authorizing flags. It retains protocol **lending internal units**; it never equates them to raw FT wallet transfer amounts.

`scripts/stage37-workspaces-sandbox-replay.mjs` can perform an **actual local Sandbox transaction attempt**, not merely an unsigned JSON preview, by:

1. Re-reading the candidate, config and deployed contract hashes on exactly the proposed finalized mainnet block.
2. Importing lending, legacy oracle, aggregate oracle and the candidate borrow/collateral FT contracts using `near-workspaces` with `withData:true`, never a code-only state-free clone.
3. Comparing the imported lending `get_config` and borrower `get_account_all_positions` results against the same mainnet snapshot.
4. Creating a disposable **sandbox-only** signer and calling `execute_with_pyth` using the observed three-action ABI with `callRaw`, capturing all asynchronous receipts.
5. Failing rather than declaring a successful liquidation when state import, execution receipts or callbacks fail. Even a local success is not evidence that **all stored keys** or real-profit swaps match current mainnet.

## CI and trigger

The `rhea-stage37-sandbox-execution.yml` workflow checks the ACTUAL Stage35 sizing artifact on merge. For the existing Stage35 witness (Actions run `40131111995`), the correct result is `BLOCKED_NO_SAFE_SOURCE_PLAN` and **no Sandbox mutation**.

When a later verified Stage35 run yields a positive source-rule-compliant candidate, manually dispatch this workflow with that run ID. It installs NEAR Workspaces on an isolated runner and attempts an actual Sandbox transaction; this can still fail if the enormous Rhea state exceeds archived RPC import limits, relevant FT or user storage is missing, or Borrow has no registered liquidator liquidity. Treat these as concrete blockers rather than as profitability. A complete Sandbox state attestation and pre/post borrower/liquidator token/share balance reconciliation would still be necessary before production.

## What remains before any mainnet execution

- Find a genuinely current, priced, liquidation-eligible and positive-net-profit borrower; `godlike.near` did not qualify under Stage35.
- Verify the current deployed Wasm's exact `Liquidate` semantics, allowed borrow assets, pool liquidity and internal-vs-token atomic units.
- Demonstrate **successful** fully imported contract transaction replay, successful async callbacks, final balances, fees and swap proceeds.
- Establish funding, gas, slippage, competition, daily risk limits and explicit authorization for an owner-controlled wallet. No mainnet keys have been requested or used.

No PDFs, no fabricated profits, no mainnet transactions.
