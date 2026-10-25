# Stage 52 — exact wrapped-NEAR collateral deposit proof

## Defect addressed

Merged Stage49E added an **actual local NEAR Workspaces** funding sequence using the real imported `wrap.near` and Rhea lending contracts: `near_deposit` followed by `ft_transfer_call` to Rhea using `OnlyIncreaseCollateral`. That previously accepted a successful callback, a reduction in the actor's wrapped-NEAR FT balance, and **any positive** Rhea collateral. The checks did not prove which collateral token was credited or whether the Rhea FT vault received the **full 1 NEAR** worth of wrapped tokens.

That gap could count a partially refunded FT transfer or unrelated collateral as sufficient funding to attempt the next Sandbox liquidation action.

## Exact state-based reconciliation

- Before wrapping, require the temporary actor to have **no** wrapped NEAR FT balance, no existing collateral and no wrapped-NEAR lending collateral shares.
- Snapshot the **actual cloned wrapped NEAR FT vault balance** held by `contract.main.burrow.near`.
- Execute `near_deposit` using exactly `10^24` units of **local Sandbox NEAR**. Confirm that the actor's FT balance increases by the entire amount and that the lending vault has not changed.
- Execute `ft_transfer_call` to the imported Rhea contract, preserving the observed `OnlyIncreaseCollateral` message. Check actual success-only transaction and callback receipts.
- Require that the Rhea borrower's actual **`wrap.near` collateral leg** now has both positive lending-internal balance and positive shares; unrelated collateral does not count. Do **not** equate lending-internal shares with raw FT atomic units.
- Require the actor's wrapped-NEAR FT balance to return to zero **and** the Rhea lending vault FT balance to increase by **exactly** `10^24` units. Short credit, partial refunds, absent collateral leg, zero shares, fake mint or malformed balances all fail closed.
- Record exact before/after FT vault balances and observed `wrap.near` collateral units/shares in the existing real Stage49E Sandbox-funding evidence, without changing source admission or Pyth/repayment-vault prerequisites.

## What this means — and does not mean

This validates a real **local-Sandbox-only** funding proof on the exact imported token contracts when a genuine qualifying source proposal is supplied. The unit tests use controlled fixtures; **no actual funding or Rhea liquidation is claimed from CI alone**. The actor's borrowing power, `execute_with_pyth` callback, Stage41 debt decrease, seized FT balance increase, Stage48 later-finalized state, full state parity, conversion costs, swaps, competition and net profit remain separate conditions.

No mainnet transaction, owner wallet, real funds, artificial FT balance mutation or execution authorization has been added. The source-positive liquidation gate still blocks where no genuine eligible borrower was found.
