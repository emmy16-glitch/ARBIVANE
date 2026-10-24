# Stage 27 — valuation sanity and isolated replay admission

Stage 26 proved a specific borrower had a paper health factor below 100%, but **did not prove usable on-chain liquidations or realistic USD quantities**. We independently inspected Stage 26's finalized evidence: adjusted collateral is `6470256469223058373407048439157125446607770319000000` E27 and adjusted debt is `6651483918849689797371598808733861428672591513784463` E27. If interpreted literally as US dollars with 27 decimals, these are approximately `6.47e24 USD` and `6.65e24 USD`, respectively. This is not an economically plausible liquidation notional. The apparent 97.27% ratio may be arithmetically consistent but **does not imply that the underlying amounts, metadata, derivative prices or contract-execution valuation are correct**.

This release implements `assessStage27ReplayAdmission`: it checks fixed-point health/value consistency and uses an intentionally conservative $10 million USD-equivalent sanity cap only for **detecting suspicious reference units**, not for authorizing a trade. A report over the cap is classified `BLOCKED_VALUE_SANITY`, with no inferred repay quantities, gas/net profit, signer or transactions. Evidence must be from fresh finalized block (maximum 30-block lag), unchanged deployed code identities, strictly priced and recorded under research-only Stage 26 status.

## Actual sandbox path — optional probe, not execution

Research confirmed that the open-source [NEAR Workspaces JS](https://github.com/near/near-workspaces-js) exposes a local Sandbox and `importContract({mainnetContract,blockId,withData:true})`, which copies contract bytes and storage into the Sandbox. Importing state larger than the ordinary ~50-kB RPC limit can fail. We deliberately do **not** weaken to `withData:false`; an incomplete snapshot must not become a passing replay.

`scripts/stage27-sandbox-state-import.mjs` is an **optional local state-import proof of concept**, not part of CI, and uses no real wallet. Only after the live Stage 27 gate has been saved to a JSON file does it attempt to import the lending contract, configured priceoracle, and aggregate reader at the same block, then compare lending config and borrower's view against pinned mainnet state. Even if those two views match, the script reports `VIEWS_MATCH_BUT_FULL_STORAGE_COMPLETENESS_UNATTESTED`, not `REPLAY_SUCCEEDED`. All storage keys and dependencies must be verified independently before transaction replay is meaningful.

For local experimentation with a NEAR Sandbox-capable machine:

```bash
npm install --no-save near-workspaces
EXECUTION_ENABLED=false NEAR_WORKSPACES_NETWORK=sandbox STAGE27_SANDBOX_IMPORT_ONLY=true NEAR_RPC_URL=https://archival-rpc.mainnet.fastnear.com STAGE27_GATE_FILE=stage27-replay-gate.json npm run probe:rhea:sandbox-state-import
```

The gate file must come from an immediately fresh read-only Stage 27 run, and the archived RPC endpoint must support its recorded block; there are no live mainnet funds or keys here. This optional import can fail for the very large Rhea lending contract and is **not** a proof of full storage integrity.

## Remaining steps to a real first liquidation

1. Reconcile raw token units and `extra_decimals` against the deployed price-consumption code (including derivative conversion), not simply the old Burrow maths.
2. Construct a complete deterministic current-state snapshot of all relevant lending, configured oracle, source price reader and FT/token contracts; validate complete storage-key coverage and provenance.
3. Execute the exact oracle-routed liquidation in NEAR Sandbox using a funded **sandbox-only** account. Validate resulting borrower/liquidator balances, receipt success, gas, storage, and token withdrawals.
4. Independently price actual swaps, financing and slippage, set strict maximum potential loss and custody limits, and obtain explicit user approval for any real-money release.

**No mainnet liquidation, trade profit, wallet usage or completed sandbox transaction replay is claimed by Stage 27.** No PDF.
