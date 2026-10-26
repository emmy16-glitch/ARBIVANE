# Stage139 — capital-free Rhea liquidation financing

Updated 26 October 2026. **Status: funding-source research and strict evidence gate implemented; no verified NEAR-native flash-loan provider or capital-free liquidation execution.**

## Goal

The owner has no capital for lending collateral or initial liquidation principal. ARBIVANE's intended long-term approach is:

```text
Find qualifying Rhea position
     -> borrow the repay asset from a real zero-collateral liquidity provider
     -> execute authentic Rhea liquidation and obtain discounted collateral
     -> repay the external principal plus fees under the lender's enforced rules
     -> sell/reconcile any remaining inventory after network and transaction costs
     -> credit a confirmed positive net gain to okunlola_labs.near
```

The user's public wallet roles are: `okunlola_labs.near` is the future owner/payout account, and `sillywiki4201.near` is the **proposed** separately permissioned execution account. These public identifiers do not grant spending rights. No wallet key should be uploaded or shared.

## What the earlier successful liquidation actually used

Authentic signed Stage93 [run #40317139342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342), original artifact `stage93-authentic-borrower-2579`:
- `stage49-sandbox-funding.json` proves the disposable actor `arbivane-replay.test.near` wrapped and deposited **1,000,000,000,000,000,000,000,000 yoctoNEAR = 1 NEAR** worth of wNEAR into Rhea as Sandbox collateral.
- The same document records **946,259,397,775,418,264,544,034 wrapped NEAR collateral shares**. That collateral gave the actor capacity for an ordinary Rhea `Borrow` of a source-sized LiNEAR amount.
- The original transaction followed Rhea `Borrow → Liquidate → Repay → Withdraw`, finishing with zero actor borrowing and **2,531,190,098,868 atomic LiNEAR** in the actor's account.
- That is a real **collateral-backed NEAR Sandbox liquidation**, not an uncollateralized flash loan, and it did not transfer real profit to the owner.

Run Stage139's verifier against the original artifact:

```bash
node scripts/stage139-flash-financing-cli.mjs original-stage93 ./downloaded-stage93 ./review
```

It independently cross-links `stage49-sandbox-funding.json`, `stage41-sandbox-balance-settlement.json` and the source-approved `stage38-positive-stage35-evidence.json`. It emits `stage139-original-capital-classification.json` with `RHEA_OVER_COLLATERALIZED_BORROW` and explicitly **false** for capital-free financing.

## Why a generic EVM flash-loan tutorial is not the solution

Rhea's own [borrowing documentation](https://guide.rhea.finance/near-chain-guides/lending-and-borrowing/borrowing) requires overcollateralized borrowing. A successful self-`Repay` after a collateral-backed `Borrow` does not alter that fact.

NEAR promise receipts execute asynchronously. A successful cross-contract call is **not** automatically reverted just because a later callback fails. [Aurora's NEAR/XCC documentation](https://doc.aurora.dev/crosschain/xcc/aurora-to-near/introduction/) explicitly explains the difference from EVM revert semantics. An Ethereum/Aave flash-loan provider's `executeOperation` or `flashLoan` interface is not directly callable as an atomic lender for NEAR-native Rhea repayment.

A credible native provider must be identified by its real deployed NEAR account, public verified contract bytecode/code hash, available loan asset and reserve, actual borrow and callback ABI, fee and repayment terms, and execution/compensation behavior across all promise failures. **A website saying flash loan or a string with the method name is not proof.**

## Contract and financing requirements

A provider must provide **the actual repay token**, historically `linear-protocol.near`, at a sufficient atomic amount; a wNEAR-only facility may still require a verified and costed conversion. The route must show, with authentic local Sandbox receipts:

1. **No owner-supplied collateral or principal.** The actor begins with no borrowed shares; no NEAR/wNEAR deposit may be required solely to secure the temporary Rhea borrowing.
2. **Verified source of principal.** The observed lender balance decreases by loan amount and the beneficiary receives precisely the required NEP-141 tokens; its deployed Wasm and token storage match the claimed provider.
3. **Provider repayment protection.** A callback or escrow contract must demonstrably enforce principal plus fee, handle late failures and block nonrepayment without exposing the provider to unrecoverable loss. Because NEAR is async, a mere callback that *hopes* to undo earlier transfers is not enough.
4. **Protocol-compatible liquidation.** The whole route must execute the actual Rhea liquidation and return the necessary NEP-141 funds to repay the external lender; the same-token internal Rhea share balance is not automatically a wallet token transferable to a provider.
5. **Gas and storage funding.** At least one on-chain action and possibly storage registration require NEAR. Without user funds, an independently verified and owner-approved sponsor/relayer must pay the relevant costs; a zero-principal loan does not automatically provide gas.
6. **Full economics.** Net observed settled assets after principal, lender premium, swap/slippage, gas/storage, failed-route exposure and liabilities must exceed a positive minimum; unsold collateral is not realized profit.
7. **Owner authorization and risk caps.** Funding source cannot confer unrestricted access to `okunlola_labs.near` or `sillywiki4201.near`.

The latest researched public Rhea documentation describes **collateralized** borrowing; no audited and currently deployed NEAR-native, LiNEAR-denominated uncollateralized loan provider has yet been independently confirmed from the sources inspected. This is **not** a claim that such a facility is impossible anywhere on NEAR.

## Stage139 verifier and dry-run

The module `scripts/stage139-flash-liquidity-admission.mjs` has two independent functions:

- `stage139AuditHistoricalCollateral(funding, settlement, proposal)`: verifies that the observed successful replay depended on 1 NEAR of disposable **Sandbox** collateral and refuses any forged zero-collateral claim.
- `stage139ReviewFlashLiquidity(candidate)`: conservatively calculates theoretical net return **in one verified asset's atomic units** and lists every missing provider proof, callback repayment guarantee, gas sponsor, live liquidity and owner authorization. It always returns `maySignMainnet: false`, `mayBroadcastMainnet: false`, `feasibleWithoutUserPrincipalDemonstrated: false`, regardless of attractive input. Caller-written JSON flags cannot authorize chain signing.

```bash
node scripts/stage139-flash-financing-cli.mjs flash-research candidate.json review.json
```

The CI [Stage139 authentic funding gate](../.github/workflows/rhea-stage139-flash-financing-gate.yml) downloads previously successful real Stage93 evidence, classifies its actual financing, and rejects a tampered no-collateral deposit. This is a **negative proof about our existing route**, not a flash-loan execution demonstration.

## Follow-on deployed-provider discovery

Stage140 implements a real **read-only** on-chain inspection of Rhea and Ref deployed code identity and exported methods. This cannot fund a trade or prove an uncollateralized lender; see [Stage140 technical results](STAGE140_NATIVE_PROVIDER_DISCOVERY.md).

## Research priorities and exit conditions

1. Enumerate native NEAR lenders from verified contracts, source histories and read-only RPC. Match their actual flash liquidity to the Rhea repay asset. Do not treat Rhea collateralized Borrow, Ref/Rhea DEX pools or EVM lenders as interchangeable.
2. Inspect real contract ABI/Wasm and repayment/async recovery guarantees. Reject providers with ambiguous obligations, insufficient reserves or no verifiable deployment.
3. If a suitable lender exists, create a **local-only** adapter and import it with authentic token state into Workspaces. Run principal issue → real liquidation → external repayment, verify every intermediate receipt and before/after provider balance, including failure injection.
4. Run a gas-sponsored or carefully scoped subsidy test if needed. Do not disguise this as “zero fees.”
5. Only after a real fully financed and completely repaid Sandbox execution can a separately authorized, strictly bounded mainnet trade be proposed. No production private key, live signing, liquidity transfers or profit transfers exist today.

The business goal is preserved. We are specifically eliminating the previous **capital requirement**, not replacing it with an unverified green status.
