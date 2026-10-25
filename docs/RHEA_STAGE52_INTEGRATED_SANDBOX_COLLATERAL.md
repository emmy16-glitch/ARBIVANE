# Stage52 — integrated genuine local Rhea collateral funding

This integration starts from Stage51's merged main branch and reuses tested
Sandbox funding code from the newer Stage49D implementation without overwriting
Stage50's actual NEP-141 vault-reserve proof or Stage51's Pyth oracle parity.

## What runs when a truly positive Stage35 proposal exists

1. Authenticate the borrower, Rhea lender and Pyth oracle at the proposal's
   single finalized NEAR mainnet block. Validate repay/seize asset flags, pool
   capacity, actual repayment-token reserve, token precision, and source-only
   liquidation quantity.
2. Use bounded native state cursors to clone Rhea lending, Pyth, auxiliary
   oracle, `wrap.near`, repay FT and seize FT into **disposable NEAR Sandbox**.
   Compare Rhea config/borrower/assets, token vault reserve and both selected
   Pyth price feeds/token conversion views against the exact source block.
3. Create one disposable Sandbox actor, initially endowed with **3 local test
   NEAR**. Register Rhea lending, repay and seize FTs with source-derived
   NEP-145 storage bounds, and if needed register `wrap.near` too.
4. **Actually call** the imported `wrap.near.near_deposit` with 1 local NEAR.
   Re-read the actor's wrapped-NEAR FT balance. Then actually call its
   `ft_transfer_call` with the Rhea `OnlyIncreaseCollateral` message and
   attached 1 yocto test NEAR. Require successful asynchronous receipts, a
   decrease in actor wrapped FT holdings and an observed increase in Rhea
   actor collateral positions. No fabricated balances or direct local state
   patching is permitted for the actor.
5. Recheck the actual actor collateral positions, repay pool `can_borrow`,
   and conservative headroom against the exact proposed Borrow internal
   quantity. Only then attempt Rhea's genuine `execute_with_pyth`
   `Borrow → Liquidate → Withdraw` using bigint gas/deposit values. Stage41
   must independently verify borrower debt/collateral decreases, the actor's
   lack of outstanding debt and receipt of seized collateral tokens; Stage48
   must prove the after-state persists on a later finalized local block.

The new artifact `stage52-sandbox-collateral-funding.json` accompanies the
existing Stage37/41/46/49/50/51 receipts and checks in workflows Stage37, 40,
42 and 44.

## Explicit boundaries and falsification rules

- All asset views on NEAR mainnet are read-only. All native NEAR, NEP-145
  deposits and `ft_transfer_call` transactions execute **only in Sandbox**.
  No real wallet, signing key, private key, mainnet broadcast or simulated FT
  token inventory is introduced.
- Fixed one-NEAR local collateral **does not prove enough borrowing power**.
  The current source proposal can correctly fail during actual borrow,
  liquidation Pyth callback or withdrawal. A synthetic unit test, successful
  registration or deposited collateral **is not** a Rhea liquidation.
- Historical Stage35 run `40131111995` had zero source-valid opportunities:
  this unchanged gate blocks any local attempt on that evidence.
- Cross-block Pyth reads, contract/code mismatches, incomplete pagination,
  stale oracle data, insufficient reserves or collateral, failed receipts and
  absent borrower/token deltas must all remain blockers.
- Even a successful Sandbox liquidation cannot establish deploy-time mainnet
  source parity, executable swap proceeds, actual funding/gas/slippage
  profitability, competing transactions or owner-authorized real trading.
  No realized net-profit or wallet withdrawal is claimed.

See the Stage37 isolated Rhea Sandbox workflow, and the Stage52 tests. Real
mainnet trading remains completely disabled.
