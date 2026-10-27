# Stage169 — correct original source-vs-contract liquidation sizing, then expand bounded Sandbox discovery

## Verifiable original failed execution

[Stage157 run #40402755800](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40402755800), original immutable shard 0 artifact #12691066664, borrower `fukaih.near`, source block 221744041, did **not** succeed. Its authentic deployed Rhea final receipt panicked at `contracts/contract/src/actions.rs:652:9`:

```
Not enough balances repaid:
discounted collateral 0.037959128341869451899819931
> borrowed repaid sum 0.037959050421204388719231544
```

The source planner requested a maximum seizure at the reference four-rule limit, but Rhea's Borrow/share-conversion and `Liquidate.in_assets.max_amount` can repay slightly **less** than the source nominal amount. One unit of `max_amount` is a ceiling, not a guarantee that exact debt is repaid. The error difference is approximately $0.00000007792. A previously successful smaller borrower does not establish universal debt and collateral conversions.

## Stage169 correction

- Keep the source-verified `Borrow.amount` **unchanged**, preserve `Liquidate.in_assets.max_amount` unchanged, and retain the exact same-token atomic Borrow→Liquidate→Repay→Withdraw sequence. The bare `Repay` must repay all newly created actor borrowing shares; independent verifier must confirm **zero residual actor debt** and authentic FINAL callback receipts.
- For the single-token LiNEAR path only, reserve **10 basis points (0.1%) of original source-price repayment value** against rounding and temporal share accrual. Reduce `Liquidate.out_assets.amount` by ceiling-converted source seizure internal units plus one extra internal unit; reduce `Withdraw.max_amount` correspondingly. Never compensate by requesting more repayment than Rhea's pinned borrower debt or source cap.
- Reject a plan **before any Sandbox execution** when original source prices are absent, inconsistent/nonpositive or the conservative amount would not leave a strictly positive same-token source gross surplus. This is a minimum *economic headroom*, not an arbitrary $/token trade-size floor.
- Source-projection regression uses the exact borrower quantities and original failed Rhea USD values. It demonstrates the reserved seizure would have avoided **this observed inequality under the same observed pricing**, but does **not** prove a subsequent true contract settlement. Only the next original Workspaces Sandbox execution can prove that.
- To discover truly larger debt fractions, Stage157 may source-size up to **10% of independently verified borrower debt** instead of 1%. The default Stage38 read-only pipeline remains unchanged at 1%. Exact Rhea source four-rule checks, borrower available debt, pool borrow headroom, original source block and Stage50/52 funding checks still apply. No arbitrary minimum amount and no synthetic 100-LiNEAR debt.
- Stage157 now prints the **source USD repay amount (E27)** and chosen cap separately from internal token units, preventing internal amount magnitudes from being mislabeled as dollars.

## Stage169 acceptance, costs and financing

1. Test the actual failed source amounts, thin surplus rejection, two positive sizes and unchanged repayment cap; validate all existing safety and type regressions.
2. Mainnet transaction and financing flags remain `false`, and **the normal Sandbox actor is collateralized by 1 locally wrapped NEAR**. This is not a real flash loan and cannot finance unbounded repayments. Stage52 must reject insufficient funding. Do not manufacture debt liquidity or scale borrow beyond independent source risk and reserve proofs.
3. On an original Sandbox retry, require source-to-clone parity, canonical FINAL receipts, borrower debt and collateral reduction, actor FT gain and zero remaining actor borrowed shares. Record Rhea reject reason if still blocked.
4. **Positive net profit has not been verified.** The candidate's original reference gross ~$0.00077 is smaller than typical financing/gas needs; economic feasibility needs genuine venue funding quotes, loan fees, swaps and gas in the same units. No positive-mainnet-profit claim and no automatic live spending.

This stage repairs the identified rounding mis-sizing and widens *research* source sizing. It is not an unconditional guarantee that any sized borrower or unrelated token route can be liquidated. Cross-token routes need independent token economics and funding verification.
