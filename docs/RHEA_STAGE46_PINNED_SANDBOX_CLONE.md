# Stage 46 — eliminate oversized mainnet-state import from local Rhea liquidation attempts

## What changed

Stage 37 previously imported every dependency with `withData:true`, which causes near-workspaces to request an entire contract storage response in one read. Actual Stage 44/45 evidence established that this fails for large Rhea state. Stage 46 connects the **existing actual Rhea `execute_with_pyth` Sandbox runner** to the Stage 45B native NEAR `view_state` pagination implementation.

For each required lending, aggregate oracle, legacy oracle and NEP-141 token dependency, the new clone utility:

1. Reads the public deployed source code hash at the **one verified proposed block**, rejecting drift and unexpected code.
2. Imports code only into disposable local NEAR Workspaces Sandbox and attests identical code hash.
3. Reads bounded archival storage pages using `limit` and `after_key_base64`, rejecting duplicate/out-of-order keys, stale pages, incomplete cursor, RPC limits and exceeding budget.
4. Patches **only the local Sandbox** state in batches, rejects oversized individual storage entries, and requires all seen keys to be patched.
5. Checks that every dependent contract's provider-reported block hash is identical.
6. Retains the Stage 37 pinned `get_config` and borrower-position comparison before any state-changing attempt.
7. Writes `stage46-sandbox-clone-evidence.json` only when *all* named dependencies have been cloned.

This is provider pagination completeness, **not cryptographic trie-root parity**. It does not establish correct Pyth callback behavior, full NEP-141 registration, funding, real profitable liquidation, or mainnet signing authority.

## Execution

The existing [Stage37 workflow](../.github/workflows/rhea-stage37-sandbox-execution.yml) is the supported entry point. It requires an **authentic Stage35 workflow artifact** with strictly positive, source-compliant repay/seize amounts; its default pinned Stage35 run `40131111995` has **no qualifying source scenario** and correctly blocks before Sandbox mutation. The workflow's `sandbox` job runs only on an explicitly dispatched, valid, approved-for-Sandbox candidate.

A historical borrower with apparent risk is not automatically eligible; no fake low-health account or synthetic profit is used. Stage 46 fixes the state-import obstruction; it does **not** authorize ignoring that admission gate.

If an authentic candidate passes, the runner attempts an actual local `execute_with_pyth` transaction, checks asynchronous callback receipts and then independently verifies borrower/actor lending and NEP-141 balance changes through the existing Stage41 reconciler. Any incomplete import, missing oracle/token state, reverted callback, failed finality or mismatched balances is a failed replay and must stay failed.

## Distinct, noninterchangeable achievements

- **Infrastructure proved**: an independent test contract's state-changing call executed inside NEAR Sandbox at Stage 44.
- **Import tool implemented**: bounded paged copying of actual Rhea state to Sandbox, with test coverage and live proof still required.
- **Rhea liquidation successfully executed**: **NOT YET PROVEN**.
- **Rhea liquidation profitable on mainnet**: **NOT YET PROVEN**.
- **Mainnet trading authorized**: **NO**.

Existing execution gates remain unchanged. The new script cannot sign or broadcast a mainnet transaction; the read-only archival endpoint is used only for state access.

## Next genuine release checks

Inspect the full Stage45B import artifact and Stage46 CI; if a clone fails, fix its **observed error**, not a guessed one. Obtain an authentic fresh positive Stage35 source scenario, then run the actual Sandbox callback/settlement trial. Only after receipt and economic parity can owner-approved mainnet execution be considered, with an audited contract, limited funding, explicit loss budgets and wallet controls.
