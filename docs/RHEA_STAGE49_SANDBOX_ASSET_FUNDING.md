# Stage 49 — Rhea Sandbox borrow-asset eligibility and NEP-141 storage registration

## Concrete failure removed

The actual April 2026 Rhea liquidation transaction observed in Stage36 reached `callback_execute_with_pyth` and failed because the borrowed token was disallowed. The Stage37/48 runner did not test the deployed pool's **can_borrow** value or token registration before submitting its disposable local Sandbox transaction.

Stage49 runs **after all lending, Pyth, legacy oracle, repay and collateral FT contracts have been imported into an isolated NEAR Sandbox** and their lending config/borrower position views agree with the same pinned mainnet block.

1. Re-read the source lending `get_assets_paged` at the proposal block. Compare the **full** JSON asset registry against the cloned Rhea contract's view, rejecting any change. Parse listed repay and seized assets; require the repay token's `config.can_borrow === true` and at least indicative nonzero pool supply less borrowed balance. These numbers are **not** a verified executable borrow capacity, raw NEP-141 FT quantities, or gas/slippage quote.
2. Create a disposable Sandbox-only liquidator account with **3 local NEAR**, never mainnet funds, and use its own local key.
3. Independently query each imported FT's `storage_balance_of`. For missing registrations, call `storage_balance_bounds`; refuse unknown minimums or more than **0.1 NEAR per token**, and perform a real local `storage_deposit` with precisely the verified NEP-145 minimum. Verify receipts succeeded and re-read the actor's actual FT storage registration. Avoid creating any synthetic token holdings.
4. Record `stage49-sandbox-asset-storage-preflight.json` as an artifact. Token registration, even when successful, is **not wallet token funding**; `NEP-141` registration does not establish Rhea `Borrow` capability, collateral, share rounding or profit.
5. Only after this preflight may Stage37 attempt the real `execute_with_pyth` call **inside disposable Sandbox**; callback and finalized borrower, actor and FT balance attestation by Stage41/48 remains mandatory.

## Correct failure behavior

Unknown `can_borrow`, disabled borrowing, empty lending capacity, mismatched mainnet and Sandbox assets, incomplete token metadata, unsupported storage methods, excessive minimum storage cost, failed registration receipt or a null balance after registration **blocks**; none of these cases are interpreted as an executable liquidation.

## Remaining non-negotiable release gates

No real qualifying borrower/positive net trade is proven by this work. The lender's current deployed liquidation behavior, the actor's actual borrow permission, raw token precision, source/Wasm parity, end-to-end completed Sandbox repayment, and funding or swap route still must be verified. There is **no** mainnet signer, transaction broadcasting, real-money liquidation or net-profit transfer.

Tests: `npm run check`; see `.github/workflows/rhea-stage37-sandbox-execution.yml`. The Stage37 default historical artifact from `40131111995` is ineligible and still blocks early, without fabricating an opportunity.
