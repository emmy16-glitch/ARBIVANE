# Stage154 — original-receipt loan-sizing admission and Stage153 finality postmortem

**Status: verification gate, not another loan transaction.** This stage implements a deterministic funding-size admission audit against the **original, completed NEAR Workspaces Sandbox evidence**, not fixture-generated economic optimism.

## Finality failure: Stage153 disproved the simple retry hypothesis

The post-merge Stage153 [100-LiNEAR ultra-short local run #40361065214](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40361065214) **FAILED**, and [original artifact #12667044973](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40361065214/artifacts/12667044973) independently confirms:

- Rhea produced genuine `borrow` and `withdraw_succeeded` logs for `100000000000000000000000000` atomic internal LiNEAR and `99999999999999999999999999` atomic wallet LiNEAR.
- Original signed transaction hash: `nu5KxAbXhnNvn9n8rLUmzaNL9uiyPh2vXhraSnnZ9dT`. Initial status `EXECUTED_OPTIMISTIC`; no failed receipt was observed in the immediate response.
- `txStatusReceipts` query for original canonical `FINAL` evidence failed **four times**, all classified `STAGE124_FINAL_RECEIPT_QUERY_FAILED`. Final receipt count remains **zero**. No retries resubmitted a borrow.
- The liquidator **did not receive the new loan in that run**, and no new borrower liquidation, partner payback or loan closure occurred.
- The 1,000× artificially compressed historical clock (rate `0.001×`) is a **plausible** cause of inability to reach finality within the query timeout. The precise underlying RPC exception is still not recorded by Stage124, so do not claim root cause proven.
- Repeatedly running a 0.001× local-clock experiment cannot solve the separate Stage151 **economic** shortfall. Never treat contract events, `EXECUTED_OPTIMISTIC`, passing tests or artificially small interest as FINAL transaction evidence.

## Original observed economics, same tiny source borrower

[Stage150 genuine completed ~10-LiNEAR run #40353279895](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40353279895), [artifact #12664208267](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40353279895/artifacts/12664208267):

- Actual partner principal returned: `9999999999999999999999999` atomic LiNEAR.
- Original Rhea `withdraw_succeeded` events show `1861021454704671` atomic seized payout and `9999999998141509750951193` atomic unused Rhea supply reclaimed.
- Available after original principal is returned: **`2531205655865` atomic LiNEAR**.
- Observed Rhea partner debt after returning principal: `1910726860628` atomic LiNEAR.
- Expected historical net test-token surplus after those financing costs: **`620478795237` atomic** (plus an extra 32-unit safety margin actually paid). Final original actor wallet: **`620478795205` atomic**, partner borrowed shares zero.

[Stage151 genuine ~100-LiNEAR loss run #40354682373](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40354682373), [artifact #12666025832](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40354682373/artifacts/12666025832):

- Actual partner principal returned: `99999999999999999999999999` atomic LiNEAR.
- Original Rhea `withdraw_succeeded` events show the **same** tiny liquidation payout `1861021454704671` atomic and reclaimed unused larger Rhea supply `99999999998141509999718745` atomic.
- Available after original principal is returned: **`2531454423417` atomic LiNEAR**.
- Observed Rhea partner debt after returning principal: **`24899422835948` atomic LiNEAR**.
- **Deficit: `-22367968412531` atomic LiNEAR**, before mainnet gas, realistic routing, trading impact, lending partner premium or liquidation inventory realization. The partner's actual Rhea borrowed shares were not zero. **Fail closed.**

These quantities are all LiNEAR **atomic token units (24 decimals)** in *historical local Sandbox*. They do not represent U.S. dollars, trade profit or a permissionless flash loan.

## What Stage154 implements

The [Stage154 script](../scripts/stage154-real-funding-admission.mjs) and [CI verifier](../.github/workflows/rhea-stage154-source-sized-financing.yml) download **both original GitHub Actions artifacts**, not made-up large borrower fixtures, then:

1. Require the exact local chain classification, absence of mainnet signing, real Rhea Borrow/Transfer/Supply/Liquidate/Unused-Reclaim/Repay transaction hashes and separate canonical FINAL receipt proof flags.
2. Parse the authentic original `withdraw_succeeded` Rhea log events for the disposable liquidator, verifying the NEP-141 asset and exactly the two withdrawals (liquidation proceeds and recovered unused funding).
3. Verify the actually transferred, supplied and repaid original principal are **the same atomic LiNEAR amount** and original borrower debt/collateral declined.
4. Compute the available amount after principal return, compare it to the **observed** protocol borrowing accrual and reject any scenario where debt exceeds the actual available inventory. Account for the separate supplementary repayment and final debt shares.
5. Emit two reviewed machine-readable reports, explicitly labeling Stage151 `BLOCKED_FINANCING_COST_EXCEEDS_SOURCE_LIQUIDATION`.
6. Continue to prohibit production signing and treat any positive *test-token surplus* as **not independently realized market net profit**.

This is a sizing/risk-engine fix, not a change that invents a larger liquidatable borrower or guarantees successful financing. Rhea capital can only be borrowed and repaid in a responsible production route after independently validating available lending collateral or real third-party provider, actual liquidatable debt size and positive *realistic* net proceeds.

## Next full transaction and next scale

Do **not** automatically increase the 100-LiNEAR amount. The next profitable-size experiment requires a real source-attested Rhea borrower with an independently verified liquidation opportunity large enough to cover the entire principal, accrued lending cost, counterparty premium, gas/storage, swap slippage and safety margin. A new source borrower must be discovered **read-only**, source block and active oracle prices pinned, and all original callback receipts independently verified. No synthetic storage patch or fake interest-free loan may be counted as an authentic funded win.

The original 10-token trial remains the largest **completed, fully repaid** local Workspaces partner-funded test for this source borrower. The 100-token original run proved larger transfer mechanics, but also an actual financing deficit. The 0.001× ultra-short reruns are *not a valid replacement* for realistic finality and financing-cost qualification.
