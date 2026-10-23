# Stage 3 — Live Rhea protocol compatibility evidence

## What is being tested

- The mainnet lending contract `contract.main.burrow.near` and oracle `aggregate-oracle.near` as listed in the [Rhea contract directory](https://guide.rhea.finance/developers/contracts).
- NEAR `view_account` code hashes for both accounts **at the same final block**, with optional code-hash pins.
- Historical read methods: lending `get_assets_paged`, `get_num_accounts`, `get_accounts_paged` (one record); oracle `get_price_data` with the discovered asset IDs.
- Rhea/Burrow-style pool metadata and oracle price response parsing, timestamp freshness, account pagination structure.

## What this does NOT prove

A successful probe says only that specific public RPC response shapes were readable in a single snapshot. It **does not** mean liquidation calculations match the actual bytecode, the oracle is economically trustworthy, borrowing is enabled, a liquidator has capital, a vault contract can enforce monetary policy, or any trade would be profitable.

An incompatible oracle method is a **hard stop**: do not switch silently to the older `priceoracle.near`. Inspect current oracle source/ABIs and write a reviewed adapter with new fixtures and explicit pinning.

Code hashes alone are observations unless independently matched with compiled/audited source. The code intentionally sets `exactContractParityVerified=false` and `executionEnabled=false` regardless of the RPC outcome. Never add a mode that bypasses those safeguards based on the read-only probe.

## Running the probe

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
npm run probe:rhea
```

Inspect the final `result` and per-step PASS/FAIL statuses. `INCOMPATIBLE_READS` has exit code 2. GitHub Actions also runs an **advisory** probe on relevant pull requests; a green advisory workflow does not imply a passing probe. Check the actual `rhea-mainnet-readonly-evidence` artifact and step status.

### Next blockers before any execution

1. Verify exact live oracle API from audited deployed source; add a real parser only if compatibility is independently established.
2. Compare live contract runtime semantics with our paper rules, including rounding, interest accrual, oracle guarantees and pause flags.
3. Prove an on-chain custody/permission contract controls every outbound asset transfer; agent logs are insufficient.
4. Add protocol-specific transaction simulation and balance deltas, funded dry runs, gas limits, safety review and a manually approved mainnet pilot.
5. Never equate read compatibility with actual profit or zero-capital execution.

## Actual GitHub Actions mainnet probe, 23 October 2026

Evidence: [read-only probe run #40037072511](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40037072511), [artifact](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40037072511/artifacts/12537960382).

- Finalized block height: `221303815`.
- Lending `contract.main.burrow.near` deployed code hash: `6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa`.
- Oracle `aggregate-oracle.near` deployed code hash: `9vafnXzrPYQ4ErDqt2triRkQJHdxtG7tfkyb24t5Ttrg`.
- Lending assets schema: **PASS**, 25 assets.
- Lending account count schema: **PASS**, 72,766 accounts.
- Oracle `get_price_data` method or schema: **FAIL**, reason category `RPC_METHOD_OR_SCHEMA_INCOMPATIBLE`.
- Result: `INCOMPATIBLE_READS`, `exactContractParityVerified=false`, `executionEnabled=false`.

The failure classification intentionally does not claim whether the method was removed or its response format changed. Next task: inspect the actual current oracle source/deployed API and add a reviewed, pinned parser. **Do not substitute the historic price oracle or execute transactions while incompatible.**
