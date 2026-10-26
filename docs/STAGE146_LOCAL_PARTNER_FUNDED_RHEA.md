# Stage146 — actual partner-financed Rhea Workspaces execution attempt

**Status: experimental genuine Sandbox transaction route.** This milestone is designed to produce real NEAR Workspaces signed calls against the **historically cloned, authentic Rhea Lending and LiNEAR contracts**, and is **not** a permissionless zero-collateral flash loan, actual mainnet revenue or a product with funded external lenders.

Unlike Stage144's fully in-memory accounting demonstration, `scripts/stage146-actual-local-partner-funding.mjs` performs the following *real* Sandbox mutations when explicitly enabled:

1. Stage37 reproduces the pinned borrower 2579 Rhea lending/Oracle/wNEAR/LiNEAR code and target state and rechecks Pyth and token vault parity.
2. Create a **new disposable Sandbox account** `external-partner.test.near`, controlled by the **local Sandbox root**, separate from the equally disposable `arbivane-replay.test.near` liquidator.
3. Register the partner with the real cloned token/lending contracts, wrap **1 disposable Sandbox NEAR** using the real cloned `wrap.near` contract and transfer it as Rhea collateral **for the partner, not the liquidator**.
4. Partner signs an actual Rhea `execute_with_pyth` **Borrow** and the cloned `linear-protocol.near` sends it NEP-141 wallet tokens. A real `ft_balance_of` view and partner's Rhea debt must agree that capital was received.
5. Partner signs an actual NEP-141 `ft_transfer` to the zero-collateral liquidator. Verify **partner balance down and actor balance up by exactly the same amount**.
6. Liquidator signs actual NEP-141 `ft_transfer_call` into Rhea's supplied balance. Verify Rhea supplied shares are credited; the actor has **zero wNEAR collateral and zero Rhea debt**.
7. Liquidator calls real Rhea `execute_with_pyth` with **Liquidate and Withdraw**, using the original source-sized borrower's token route and capped amounts, but **without** a new liquidator `Borrow`. Verify FINAL callback tree, borrower borrowed/collateral balances decreased and liquidator receives real cloned LiNEAR tokens.
8. Liquidator repays its external partner via real NEP-141 `ft_transfer`; confirm partner's wallet balance and actor's residual FT balance.
9. Partner deposits the repaid LiNEAR back to Rhea, signs `Repay`, and must have **zero remaining borrowed Rhea balance**. Failure to close the debt is a **failed run**, never a green loan.
10. Publish actual `stage146-*.json` raw and finalized transfer/liquidation receipts, account deltas and an explicit zero-mainnet-signing outcome.

The partner's source is **collateralized Rhea borrowing secured with disposable Sandbox wNEAR**. Its own collateral may remain deposited even after debt repayment; the output explicitly notes collateral recovery has **not** been proven. This is a credible independently-controlled *local* funding route, NOT an uncollateralized permissionless flash-lender deployment. The liquidator/user supply no collateral; the partner must supply it. LiNEAR inventory remaining after principal repayment is unsold **Sandbox** property, not actual mainnet profit. There is no automated owner payout.

The new branch attaches the alternate mode behind all of these constraints: `NEAR_WORKSPACES_NETWORK=sandbox`, `STAGE146_SANDBOX_PARTNER_FINANCING=true`, `EXECUTION_ENABLED=false`, `STAGE37_ALLOW_SANDBOX_MUTATION=true`, `STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING=true`. No private key or owner wallet is accessed. The existing Stage93 four-action actor-funded path stays unchanged when Stage146 opt-in is absent.

## Independent CI execution

[Stage146 actual local partner-funded Rhea workflow](../.github/workflows/rhea-stage146-actual-local-partner.yml) runs adversarial guards on pull requests. On **push to main** or manual dispatch it fetches the complete authentic signed Stage93 borrower 2579 source artifact from [run #40317139342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342), imports genuine pinned contract bytecode and state and runs the alternate path in a local nearcore 2.13.4 Workspaces Sandbox.

The job succeeds ONLY if **all seven** distinct finalized contract calls succeed and actual NEP-141/Rhea borrower/partner/actor balance conservation and debt closure are verified. It always saves raw/final evidence or bounded failure diagnostics. A source clone error, stale oracle, unsafe Rhea liquidation, loan repayment shortfall or unregistered FT balance should **fail the job**, not convert to a paper success.

The complete original Stage93 signed local Rhea liquidation is already proven, but **that historical run cannot prove this new partner route**. Inspect the new Stage146 run's actual uploaded receipts before marking this milestone as done. If Stage146 fails, capture exact failing step and iterate without losing the already verified mainline.

## Remaining external-capital gaps

- No permissionless native NEAR flash lender was verified in Stage141's surveyed contracts.
- Local root-subaccount lending is not an actual 2026 external investor/third party and no owner capital was involved. It cannot establish a market quote, partner consent, legal agreement or production lendability.
- Actual partner wNEAR collateral recovery has not been proved.
- No authentic cross-asset swap or market sale and no post-gas realized net mainnet profit.
- No gas-sponsorship arrangement for zero-fee user execution; on-chain 1-yocto deposits remain subject to normal NEAR constraints.
- **Mainnet signing, spending and profit payout remain off.**

After a successful genuine Stage146 local trial, the next separate milestone is a restricted escrow contract with independently authorized third-party capital, deterministic on-chain callback recovery, explicit partner payback and independently observed local premium/gas/valuation receipts before a separately approved production proposal.
