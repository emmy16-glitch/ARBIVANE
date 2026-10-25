# Stage53 — verify *actual* wrapped-NEAR collateral conservation

Stage49E (#80) introduced disposable NEAR Workspaces Sandbox wrapped-NEAR funding with real calls to a cloned `wrap.near` contract and Rhea lender, but its post-transfer check could pass when only a **nonzero unrelated collateral balance** appeared in the actor's account, or when only a fractional wrapped token amount was transferred/refunded.

Stage53 strengthens the real Sandbox-only funding path used by Rhea Stage37/40/42/44:

1. Verify the newly registered disposable actor's wrapped-NEAR FT balance starts at **zero**. Read the Rhea contract's exact pre-transfer wrapped-NEAR FT vault balance.
2. Execute `near_deposit` with exactly 1 local Sandbox NEAR; independently require the actor's wrapped token balance to rise to **exactly 10^24 atomic units**.
3. Execute the existing `ft_transfer_call` to the **real imported Rhea contract** with `OnlyIncreaseCollateral`, and check the callback and all receipt failures.
4. Re-read the actor's FT wallet, Rhea's wrapped-NEAR FT vault and its Rhea lending position. Require exactly 10^24 atomic units to leave the actor's FT wallet and enter the lender's token vault, allowing **no refunded partial transfer**.
5. Only collateral whose `token_id` is **`wrap.near`** qualifies. Require its observed Rhea internal-unit balance to be between **99% and 101%** of one native wrapped NEAR, accounting conservatively for supply-share conversion. Any other collateral, zero/dust credit or unrelated balance cannot satisfy this step.

All comparisons are based on real Workspaces Sandbox contract views, not patched balances or fixture data. Tests additionally reject missing lender vault credit, partial token transfer, preexisting token balance, fake collateral identity and zero observed actor collateral.

These are collateral-accounting assertions, **not a completed liquidation**. Actor borrow health, Pyth callback, source-rule parity, safe repayment, swap outcome, gas and positive net profit remain separate checks. Source mainnet RPC remains read-only. No mainnet signer or funds are enabled.
