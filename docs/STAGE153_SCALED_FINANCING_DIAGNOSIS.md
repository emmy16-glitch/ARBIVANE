# ARBIVANE — Stage146–153 genuine Sandbox funding trials and next-size gate

> **Evidence status (26 October 2026):** All money described here is **disposable local NEAR Workspaces Sandbox inventory**, using imported authentic historical Rhea and NEP-141 contract code. No actual person or deployed liquidity provider gave ARBIVANE a loan. The temporary `arbivane-replay.test.near` partner posted test wNEAR collateral. None of these runs establish real token value, a riskless NEAR-native flash loan, mainnet execution, an actual market sale, investor consent, or a withdrawable wallet payout.

## What is genuinely verified

| Stage and original evidence | Principal / financing | What was actually proven | Limit |
| --- | --- | --- | --- |
| [148 — successful local cycle](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40347017312) | ~0.00000000185849 test LiNEAR | Original Rhea liquidation, actual token transfers, principal returned; extra 320 atomic LiNEAR to retire accrual; partner debt zero | Very small historic source borrower, unsold test inventory |
| [150 — successful larger cycle](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40353279895) | ~10 test LiNEAR, backed by 1,000 disposable test NEAR | Independently finalized borrow, funding transfer, original source-sized Rhea liquidation, withdrawal of unused Rhea supply, principal and additional debt paid, final Rhea partner debt zero | Does not make source borrower larger or produce real monetary profit |
| [151 — 100-token economic failure](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40354682373) | ~100 test LiNEAR, same 1,000 test NEAR collateral | Original borrow, FT transfer, liquidation and return of the original principal were finalized | Final Rhea debt **24,899,422,835,948 atomic LiNEAR** remained. Estimated small liquidation proceeds cannot cover the large principal's accrued financing cost |
| [152 — ultra-short clock finality failure](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40357920852) | 100 test LiNEAR at **0.001× artificial historical Sandbox time** | Rhea `borrow`, `withdraw_started`, underlying NEP-141 `ft_transfer` and `withdraw_succeeded` appeared in authentic Sandbox logs | The runner stopped at `PARTNER_REAL_RHEA_BORROW_AND_WITHDRAW` without completing original FINAL receipt attestation; no liquidation/repayment by this run |
| [153 — bounded same-hash finality query rerun](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40361065214) | 100 test LiNEAR at 0.001× Sandbox time | **Must inspect uploaded original artifact**; implementation adds bounded *status query only* retries, no duplicate contract action | CI checks alone or an emitted event are **not** proof that all callbacks and debt settlement completed |

## Why Stage152's receipt verification failed and how Stage153 changes the diagnosis

The Stage152 original [artifact](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40357920852/artifacts/12666882421) contains an authentic successful Rhea borrow/withdraw event trail, but `stage146-actual-partner-evidence.json` stopped before recording `receiptProofs.partnerBorrow` and only showed `STAGE146_PARTNER_REAL_RHEA_BORROW_AND_WITHDRAW_RPC_OR_CONTRACT_EXECUTION_FAILED`. That error wrapper discarded the underlying exception and **does not, by itself, prove that the network-side call was reverted**. A callback may have completed while canonical FINAL receipt retrieval was incomplete; the original evidence does not isolate the exact subcheck.

The Stage153 code in `scripts/stage146-real-workspaces-partner-lender.mjs` re-queries **the already-signed transaction hash** only when the Stage124 resolver reports `STAGE124_FINAL_RECEIPT_QUERY_FAILED` or `STAGE124_CANONICAL_CALLBACK_RECEIPTS_MISSING`. Other failures, including actual failed callbacks, are not retryable. Stage124 still requires signed identity, exact signer/hash, final execution status and receipt inclusion. **No repeat Borrow/Withdraw or altered Oracle prices are authorized.** Stage153 emits bounded query-attempt audits. Original `FINAL` receipts plus genuine Rhea account balances are required to accept success.

## How to decide if we can raise the amount beyond 100

**Do not increase the principal solely to make the test numbers larger.** Stage151 definitively showed that increasing funding did not increase the historically pinned source borrower's repayable debt, while interest on the larger borrowed principal increased. A full 100-token lifecycle at 0.001× *artificial* time, if achieved, would prove mechanics only, not resolve real-time economics.

Before a new 200/500/1,000 LiNEAR test can be treated as a *profit-relevant* demonstration:

1. **Market:** identify a genuine, independently source-attested Rhea borrower with a source-sized eligible liquidatable debt of suitable scale, and authenticated current debt/health, collateral, liquidation discount and reserve liquidity. Do not mutate historic borrower storage to simulate a larger position.
2. **Funding:** prove the actual lender/source has sufficient liquidatable token liquidity and document real collateral, protocol premium, gas/storage and settlement constraints. On mainnet, an actual external provider consent/offer is necessary.
3. **Safety:** take real-time Pyth quote freshness and NEAR asynchronous callbacks into account; 20× or 1000× *compressed Sandbox clocks are non-production conditions*.
4. **Economic test:** compute worst-case liquidator proceeds **minus principal, interest, fees, slippage, gas and partner premium** with a strictly positive margin and independently verified payout asset. The residual test LiNEAR balance is **not realized profit**.
5. **Full chain receipts:** verify partner Borrow+Withdraw, partner→liquidator FT transfer, supplied LiNEAR, borrower liquidation, recovery of unused supply, exact principal return, final Rhea debt zero, fee/interest reconciliation and collateral recovery. Fail closed on any missing callback, receipt or balance.
6. **Authorization:** keep `EXECUTION_ENABLED=false`, no mainnet key, no user wallet signing, no owner profit payout until capital ownership, safety and realistic positive-net execution are independently established.

## Workflow and technical references

- [Stage146 base partner-funded Workspaces run](../.github/workflows/rhea-stage146-genuine-partner-sandbox.yml)
- [Stage150 10-LiNEAR successful scaled run](../.github/workflows/rhea-stage150-large-financing-sandbox.yml)
- [Stage151 100-LiNEAR negative economics](../.github/workflows/rhea-stage151-100-linear-sandbox.yml)
- [Stage152 100-LiNEAR synthetic time / Stage153 query verification](../.github/workflows/rhea-stage152-100-ultrashort-sandbox.yml)
- [Chronological checkpoint log](../NEXT_STEPS.md)

## Reading results correctly

A green GitHub regression job checks code, not blockchain economics. A real local Workspaces transaction is **genuinely executed**, but with zero-value test tokens. A loan principal returning to the temporary partner is **not equivalent** to the partner's original Rhea debt being repaid. A final zero borrowed-shares view is a stronger closure milestone; verifying the withdrawal of the partner's originally deposited collateral is a further separate milestone. No test result turns historical Sandbox tokens into real spendable LiNEAR.
