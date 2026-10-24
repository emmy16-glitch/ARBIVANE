# Stage 6 — Lending asset coverage, derivative-price diagnostics and reference comparisons

> **READ-ONLY / NOT TRADE READY.** This work does not execute liquidations, retrieve private keys, simulate current deployed-contract internal math, or approve financing. The tests use synthetic records. A green CI job **does not** imply financial readiness.

## The four gaps confirmed by Stage 5

The public Rhea mainnet metadata diagnostic reported **25 listed assets** and four listed IDs not returned by `get_all_token_pyth_infos`:

| Asset account ID | Known from Stage 5 | Stage 6 classification |
| --- | --- | --- |
| `meta-token.near` | Listed, no Pyth metadata | Must inspect pool and per-position exposure; **not assumed delisted** |
| `shadow_ref_v1-4179` | Listed, no Pyth metadata | Must inspect pool exposure and source contract; **not assumed worthless** |
| `token.burrow.near` | Listed, no Pyth metadata | Must inspect pool exposure, collateral permissions and governance token status |
| `usn` | Listed, no Pyth metadata | Must inspect debt exposure and inactive/deprecated market evidence |

These are **not** proof the corresponding assets are still borrowable or liquidatable. Account-level balances, code hash, per-market collateral flags, governance freezes, and the current deployed contract rules must be audited before eligibility can be established.

## New read-only components

- `src/rhea/coverage.ts` reuses the Stage 5 finalized block metadata inspection and re-reads `get_assets_paged` at that **exact block** to report balances/shares and available `can_borrow`/collateral flags for every listed asset. A positive pool balance is only **global liquidity/exposure**, never proof of an affected borrower.
- `src/rhea/coverage-cli.ts` reads only public NEAR RPC methods and aborts unless `EXECUTION_ENABLED=false` and `NEAR_NETWORK=mainnet`. The report includes code hashes, missing metadata, assets with nonzero pool exposure and missing/unavailable fields.
- `src/rhea/derived-prices.ts` implements a BigInt-only, downward-rounded, provenance-gated ratio calculation for independent diagnostics of NEARX, LiNEAR, stNEAR, rNEAR and xRHEA. It cannot make a price executable even when a comparison matches. Real source methods, token addresses and ratio scaling must still be checked against the deployed code.
- `src/rhea/parity.ts` compares an indicative local account valuation with independently supplied reference values at a fixed account/block identity. It explicitly refuses to elevate matching *documentation fixtures* or even operator-supplied contract values into execution authorization. **Real deployed parity remains unverified.**

### Running the mainnet read-only coverage probe

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
npm run probe:rhea:coverage
```

Optionally set `RHEA_EXPECTED_LENDING_CODE_HASH` and `RHEA_EXPECTED_ORACLE_CODE_HASH` to independently audited pins. The diagnostic does not approve the hashes it reads.

The probe reports `UNVERIFIED_MISSING_METADATA` and sets exit code 2 when any listed asset is unresolved, as expected until gaps are resolved. On CI the report is collected as **advisory evidence**, not a passing certification.

## Why simply filling prices is incorrect

Rhea's current Go SDK handles several price families: (1) a protocol-configured Pyth identifier, (2) a default price, (3) derived ratios of NEAR liquid-staking tokens against underlying NEAR, and (4) xRHEA virtual-price composition. Reference SDK off-chain price providers can also use fallback APIs for UI display; those are **not** substitutes for a current deployed lending-contract oracle when performing liquidations. See [`common/lending/price.go`](https://github.com/rhea-finance/lending-sdk-golang/blob/main/common/lending/price.go).

For any derivative, the price and the ratio must be bound to the same finalized block, a reviewed token-specific method, a known numerator/denominator scale, and current contract code hashes. A ticker symbol, generic market price or apparent dollar value alone is not acceptable.

## Required follow-up to close issue #7

1. Record the actual live Stage 6 report for all 25 assets with finalized block, code hashes, pool shares/balances and any available `can_borrow` fields.
2. Audit the lending contract's bytecode/source and whether `get_assets_paged` completely enumerates active/legacy assets; verify pagination and inactive-market rules.
3. For the four missing IDs, establish whether they have *borrower-level* collateral/debt positions, whether they are disabled, and which oracle/valuation route actually controls the deployed contract. A zero pool balance by itself does not establish permanent delisting.
4. Review NEARX, LiNEAR, stNEAR, rNEAR and xRHEA conversions using **live source-approved ratio methods** and pinned contract hashes. Verify derivative rounding matches the contract.
5. Differential-test multiple actual borrower positions at **identical chain states** against audited on-chain contract calculations, including partial repayments and share rounding; fail on every discrepancy.
6. Do not create or fund an execution account until an independently enforceable on-chain custody policy, current fee model, liquidity routing and liquidation financing are proven.

## Tests and claims

`npm run check` runs TypeScript type checks and the cumulative tests. Stage 6 tests reject inconsistent blocks, fake integer amounts, duplicate assets, incomplete mappings, unreviewed conversion ratios, invalid provenance and mismatched reference health factors.

**Status after local work: Stage 6 implementation tested; live coverage unresolved until GitHub Actions runs.** No model or parser has proved exact liquidator eligibility or profitability.
