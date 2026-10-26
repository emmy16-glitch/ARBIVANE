# Stage140 — native NEAR flash-liquidity provider discovery

**26 October 2026. Status: public-source assessment plus executable read-only on-chain discovery. No lender selected, no live flash loan signed or repaid.**

## Authenticated live NEAR on-chain findings (26 October 2026)

The actual pushed-mainnet read-only GitHub Actions run **[40329051976](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40329051976)** uploaded artifact **[12653091807](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40329051976/artifacts/12653091807)**. Its raw `stage140-native-provider-discovery.json` was independently inspected after download.

| NEAR mainnet contract | Finalized block inspected | SHA256 verified deployed Wasm code hash | Relevant flash-loan exports |
| --- | ---: | --- | --- |
| `contract.main.burrow.near` | **221693345** | `6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa` | **None** |
| `v2.ref-finance.near` | **221693355** | `25eNFdfK76NUEZn4cDgq1xQYKjxKCuzgXmPB3SHBRW4Y` | **None** |

Both accounts returned a valid `view_account` code hash and the corresponding `view_code` payload at the **same finalized block per account**. The calculated SHA256 of each fetched Wasm matched the on-chain code hash. `WebAssembly.Module.exports` found no standard `flash_loan`, `flashloan`, `flash_borrow`, `flash_liquidate`, `flash_liquidation`, or `request_flash_loan` function on either inspected deployment.

**Actual result: `NO_FLASH_LOAN_ENTRYPOINT_EXPORTED` for both watched contracts.** `hasVerifiedUncollateralizedLiNEARProvider=false`, `providerConnectedForExecution=false` and all mainnet signing/broadcast flags are false. This disproves a usable flash-loan entry method on **these inspected deployed accounts at these block heights**, not that *every* contract on NEAR lacks one.

The public 2023 Ref/Burrow flash-loan roadmap was therefore **not evidence of a shipped compatible entrypoint on the inspected October 2026 deployed code**. Do not point ARBIVANE's loan adapter at either account and assume capital-free execution. Next work requires discovering a different genuinely deployed NEAR-native uncollateralized LiNEAR lender or an explicitly funded/sponsored provider whose economic and asynchronous repayment terms can be independently verified.

---

## Summary

ARBIVANE's proven Stage93 liquidation required **1 NEAR worth of collateral issued locally by the Workspaces Sandbox**. The owner does not have funds to post collateral or pay liquidation principal. The financing objective is therefore to prove *uncollateralized, temporary NEAR-native liquidity* usable for a genuine Rhea liquidation and fully repaid with all costs covered. Do not call Rhea's existing collateralized Borrow a flash loan.

A provider is connected to **funded execution** only after a real native NEAR contract, its public verified source/deployed Wasm, the precise repay asset, available pool liquidity, safe asynchronous callback/repayment accounting and complete financed local settlement have been demonstrated. No such facility has met that bar.

## Provider candidates inspected from public sources

| Candidate | Public evidence | Compatibility assessment |
| --- | --- | --- |
| **Ref/Rhea Lending** (mainnet `contract.main.burrow.near`) | [Rhea lending docs](https://guide.rhea.finance/docs/rhea-finance-cross-chain-lending-litepaper) describe borrowing against posted collateral. [June 2023 Ref/Burrow roadmap](https://rhea-finance.medium.com/ref-finance-oversees-burrow-to-strengthen-defi-on-near-23802c8d74a5) proposed flash loan / flash liquidation, but a roadmap is not a deployment or supported method. | Existing original Stage93 route is genuinely collateralized; no authenticated native flash-loan ABI, LiNEAR reserve or loan/repayment evidence |
| **Ref/Rhea AMM** (mainnet `v2.ref-finance.near`) | [Official contract directory](https://guide.rhea.finance/developers/contracts) lists this as an AMM for swaps and liquidity, not a certified flash lender. | Could offer swap liquidity; **not established** as uncollateralized loan facility |
| **NEAR Intents / Rhea Solver Liquidity** | [Rhea main website](https://rhea.finance/) describes solver-funded fills and Rhea Lending yield-bearing solver capital. | An intent quote/solver-funded trade is not a collateral-free repay loan offered to ARBIVANE. A funded solver arrangement requires separate binding commercial terms and authenticated settlement |
| **Aave flash loans** | [Aave documentation](https://aave.dev/docs/aave-v3/guides/flash-loans) documents EVM same-transaction loans. | Ethereum/EVM execution cannot be assumed atomically compatible with NEAR's Rhea async receipts or native LiNEAR |
| **NAVI / Neptune / Sui flash loan facilities** | [NAVI SDK](https://sdk.naviprotocol.io/lending/flashloan) describes loans on the **Sui** chain. | Wrong chain and no proven native LiNEAR bridge/loan atomicity |

**Conclusion:** We have **not found a publicly substantiated currently deployed NEAR-native uncollateralized LiNEAR flash-loan provider** among these candidates. This is not a universal impossibility claim; it is a bounded verification result. A 2023 roadmap cannot substitute for a real 2026 contract and transaction.

## Implemented mainnet read-only connection

Files:
- `scripts/stage140-native-flash-provider-discovery.mjs`
- `scripts/stage140-native-flash-provider-cli.mjs`
- `tests/rhea-stage140-native-provider-discovery.test.mjs`
- `.github/workflows/rhea-stage140-native-provider-discovery.yml`

The adapter inspects two **existing deployed-contract candidates**, explicitly **not assumed flash providers**:

```text
NEAR mainnet finalized RPC
       |
   query: view_account -> code_hash, final block height
       |
   query: view_code at EXACT SAME BLOCK -> deployed WASM
       |
   SHA256(decoded WASM) -> base58 -> compare on-chain code_hash
       |
   Enumerate exported WASM function names
       |
   Check exported flash_loan / flashloan / flash_borrow etc.
       |
   Status ONLY: no flash entry point, named export only, or unavailable
       |
   LIQUIDITY PROVIDER CONNECTED FOR EXECUTION: ALWAYS FALSE
```

Using Node.js 22+ from the repository root:

```bash
node scripts/stage140-native-flash-provider-cli.mjs stage140-native-provider-discovery.json
```

Or use the GitHub Actions read-only workflow: [Stage140 live discovery](../.github/workflows/rhea-stage140-native-provider-discovery.yml). On push to main or manual dispatch, it queries the public RPC and uploads `stage140-live-readonly-deployed-provider-exports` for independent inspection. PRs test its logic only, avoiding flaky external RPC as a safety-test prerequisite.

The watcher exports match *method names only*: a named method may be permissioned, may require collateral or may have completely different parameters. Absence of such names on both **watched accounts** does not exclude every new unknown provider on the network. A code-hash identity proves only the bytes matched a queried contract at the queried block, not that the same provider can safely issue and recover an uncollateralized loan.

All inputs, results and workflows are **read-only** and make only `query` RPC calls (`view_account` and `view_code`). The module contains no wallet signer or broadcast action and declares `hasVerifiedUncollateralizedLiNEARProvider=false`.

## Why this is not yet executable

The lender must prove all of these together:

1. Native NEAR deployed account, audited/current Wasm hash and real, accessible loan API.
2. Nonzero available NEP-141 LiNEAR at the lender and proof it can be borrowed without the owner's collateral.
3. Authenticated token transfers, provider callback/repayment guarantee and failure compensation despite NEAR's async receipts. No promise of blanket cross-contract reversion.
4. Rhea borrower's health and the liquidation's actual source sizes, current Pyth, gas, storage and liquidity.
5. Principal **plus lender fee** returned to the provider, independently verified in actual local token balances and original receipt tree; account owes no residual debt.
6. Payout settlement assets have genuine net value after slippage, network/storage charges, liquidity costs and unpaid inventory risks.
7. If owner starts with zero NEAR, somebody must legitimately cover gas and storage registration; this is a separate subsidy/relayer agreement.
8. Owner-signed authorization of any real mainnet call and strictly bounded custody; no owner seed or Full Access key in CI.

**Next:** If the read-only WASM export discovery finds a plausible candidate, inspect full source, ABI, liquidity and real native callback receipts before extending the Workspaces execution. If it does not, continue provider discovery or develop a clearly authorized external capital partner route, without claiming automatic zero-capital profitability.

The user wallet roles are unchanged: `okunlola_labs.near` owns future profits and `sillywiki4201.near` is only a proposed restricted execution identity. Neither is connected to the local Replay signer or authorized to spend.
