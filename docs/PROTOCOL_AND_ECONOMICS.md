# Rhea liquidation mechanics and economic accounting

This document explains what ARBIVANE evaluates and what its successful local execution actually does. Financial figures are integer strings; a “balance” only makes sense with an explicit asset, scale and network.

## The actors and contracts

- **Borrower:** an account holding Rhea debt and posted collateral. A position may be isolated, so a combined wallet balance cannot substitute for that position's risk calculations.
- **Lending contract:** `contract.main.burrow.near`, the Rhea/Burrow lending interface verified during these historical source-pinned replays. A current production caller must verify that this remains the deployed trusted contract and that its Wasm/code hash matches the approved source.
- **Oracle:** Rhea's active Pyth pricing path and the documented `aggregate-oracle.near`. The legacy `priceoracle.near` endpoint should not be silently substituted. Price feed age, ratios and decimals must match the contract's actual configuration.
- **Liquidator:** for successful tests, the disposable `arbivane-replay.test.near` account funded **only in local Sandbox**. It is not an owner-controlled funded mainnet account.
- **Tokens:** NEAR for network use, wrapped NEAR collateral in the local actor where required, and LiNEAR for the studied same-token repayment/seizure path.

## Screening versus execution

The scanner pages through indexed Rhea accounts and extracts genuine borrowing evidence. It pins related views to a consistent source block rather than mixing account details with unrelated newer prices.

The protocol's share accounting matters: a pool owns aggregate funds and each borrower may own or owe shares. Displayed underlying balances can accrue with market indices even when the share ownership does not change. Borrowing, repaying and withdrawing fixed amounts may round by a smallest share; ARBIVANE tested these cases against actual imported contract behavior.

A candidate must pass collateral/debt health rules, protocol liquidation size and health-improvement rules, oracle freshness, actual asset permissions/reserves and conservative source-sized repayment. A positive indicative spread is not an execution approval.

## Why the four-action route is atomic within Rhea

The successful same-asset Sandbox plan submits one `execute_with_pyth` call:

```text
Borrow LiNEAR for temporary liquidator capacity
  -> Liquidate the specifically approved undercollateralized Rhea borrower
  -> Repay ALL temporary borrowed liquidator shares
  -> Withdraw source-capped remaining LiNEAR
```

The liquidator must already have sufficiently safe collateral in Rhea. The final `Repay` is full-share based to avoid stranded one-share debt. `Liquidate` and `Withdraw` use conservative source-backed ceilings rather than unsafe exact minimums after rounding. The source borrower, amount ceilings, oracle identity and expected contract/account permissions remain immutable within the recorded replay.

On NEAR, `execute_with_pyth` has asynchronous price lookup, contract callbacks and token-transfer receipts. A log saying `liquidate` is not by itself a completed operation. A failed late `Withdraw` can invalidate an apparently successful intermediate log sequence. The verifier requires genuine callback finality and independently observed end-state changes.

## The settlement equation

Distinguish three quantities:

1. **Source-gross spread:** the protocol's reference difference between collateral potentially seized and the amount repaid, *before* costs and actual execution.
2. **Net seized inventory:** token atoms received by the liquidator wallet after the real protocol sequence, observed by `ft_balance_of` and cross-checked with borrower/account state.
3. **Realized net profit:** value of actually sold inventory minus repayment/funding, token conversion and swap slippage, network gas, storage, competition costs and any residual liabilities, reconciled in a common real settlement asset.

For a live production system:

```text
Realized net P&L =
    actual settlement proceeds
  - acquisition / borrowed principal and financing cost
  - swap price impact + liquidity / route fees
  - gas + storage
  - execution / failed-attempt costs
  - any residual debt or inventory losses
```

The exact treatment of principal must follow actual cash/asset flows; do **not** subtract principal twice. Where a Rhea Borrow is genuinely repaid within the same operation, count the real cost of that funding and resulting asset movement, not a synthetic flash-loan assumption.

In the verified Stage93 #40317139342 replay, the actor received **2,531,190,098,868 LiNEAR atomic units** and finished with **zero debt**. That is evidence of local inventory gain, **not** profit denominated in NEAR, USD or naira. No market swap, price-impact quote or real funded wallet ledger has been demonstrated.

## Competitive risk and latency

`src/competition/score.ts` estimates pressure from historical liquidation density, distinct actors and contested failures. This is a **historical proxy**, not a network mempool oracle or a live count of rival bots. Zero observed competition does not prove the route is uncontested. Future production scoring must account for false eligibility after concurrent state changes and transaction finality.

## Scope of the current primitives

`src/domain/money.ts`, `src/rhea/source-math.ts`, `src/rhea/stage35-atomic-reference-sizing.ts`, `src/rhea/stage37-sandbox-liquidation.ts`, `src/rhea/stage41-sandbox-settlement.ts` and `scripts/stage37-workspaces-sandbox-replay.mjs` contain the tested source/economic path. `src/reconciliation/profit.ts` and `src/settlement/intents.ts` provide strict *validation primitives*, not a deployed swap engine or verified settlement service. No executable EVM flash-loan route has been implemented.

Read [Architecture](ARCHITECTURE.md), [Status and evidence](STATUS_AND_EVIDENCE.md) and [Wallet and mainnet](WALLET_AND_MAINNET.md) for related controls.
