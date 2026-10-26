## Full local financing and repayment verified — Stage148

The [genuine post-merge Workspaces run #40347017312](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40347017312) passed. [Downloaded original artifact #12661728104](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40347017312/artifacts/12661728104) proves the original local signed transaction hashes: partner Rhea Borrow `J88jAVnjocsunNfAMBdPxfhpdi9JNsYqS8FDbMLkxr4R`, partner LiNEAR FT transfer `gLWjqUR38e9uyYByLjS2838op9zgi3qkuxSqnuHBUER`, liquidator Rhea supply `DM6rcFknrTqJzjYshCykKEW25Rpofz94fWr6Scq938sq`, genuine borrower Rhea liquidation `4qcfWvK3kHx8Y2UNMHKT2cVY3cREi6S25vZfMMxcaXrq`, partner principal return `EC1VpwqRsHBMeH1BvcHrURQwEUH9uYBz9qZb2TNp1WiU`, partner Rhea Repay `3mpf9E5hzJVPTPHwztGci3qYuxEkZjXL4wGaLQsWk7Gs`, final real supplementary LiNEAR transfer `tWFGripdBxqYgPy8VdC5BvEn16sAnv8DnXEzaS11oHH`, and final Rhea dust Repay `6pMbefwGqadbakvwucQurMLzNt9Tqr4GUDrzoMUpzozB`. All these preserved receipts are FINAL and verified, with successful callback outcomes.

Independent final views: partner initially financed the zero-collateral liquidator with **1858490264605800 atomic LiNEAR**, liquidator actually liquidated source borrower (borrowed shares down **1848889647386444**, collateral shares down **1860647237424468**), returned the original principal, paid extra **320 atomic LiNEAR** from its own remaining test inventory and cleared partner Rhea borrowed shares from **286 down to 0**. Remaining local actor wallet balance: **2531190098551 atomic LiNEAR**.

**Not a spendable success:** the funding partner is a disposable local account, itself backed by 1 test wNEAR in Rhea. The actor's remaining funds are unsold **Sandbox tokens**, not realized profit; actual mainnet liquidity, lender premium agreement, gas sponsor and collateral-withdrawal proof are missing. The historical local execution used Stage147 wall-clock compression to keep a pinned **authentic historical** Pyth quote within its unchanged freshness constraint; that is NOT realistic current-mainnet settlement evidence. Stage149 will preserve the correct compressed-time clock details in the uploaded evidence rather than overwriting them.

---

## Stage148 — original local liquidation succeeded; 286 borrowed shares remain to settle

[Real Stage146 run #40345647795](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40345647795) and [original artifact #12661771274](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40345647795/artifacts/12661771274) contain genuine signed FINAL receipts for real Rhea Liquidate→Withdraw, reducing borrower borrowed shares by **1,848,889,647,386,442** and collateral shares by **1,860,647,237,424,468**. The zero-collateral liquidator actually withdrew **1,861,021,454,704,671 atomic LiNEAR** and transferred the entire **1,858,490,264,605,800 principal** back to the separate local partner. The partner's original Rhea `ft_transfer_call` `Execute/Repay` succeeded but left **286 borrowed shares**, due to accrual/conversion rounding across the multi-transaction experiment. **That run failed its zero-debt acceptance gate** and no actual mainnet profit exists.

Stage148 adds limited, original-receipt-verified local token compensation for the remaining partner debt. It derives the amount from the actual `get_account_all_positions` borrowed balance (not a guessed value), uses only verified remaining liquidator LiNEAR inventory, and permits at most three real additional NEP141 transfer/repay sequences with **at most 100,000 atomic LiNEAR total**. Success still requires the original Rhea contract to report zero remaining borrowed shares and a positive local actor inventory. No owner collateral, mainnet signing, exchange swap or real monetary payoff is enabled. The price quote remains original; the test uses the previously disclosed local clock compression and is **not mainnet oracle timing evidence**.

---

## Stage147 — constrained historical local oracle test

Run [40344009735](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40344009735) and [original evidence](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40344009735/artifacts/12659763226) show the real partner borrow, transfer and Rhea supply succeeded with FINAL Sandbox receipts. The next Rhea Liquidate transaction rejected the original imported Pyth quote: **publish_time is too stale**. No borrower liquidation or partner repayment completed.

Stage147 allows the **explicitly gated local Sandbox** replay to advance its historical wall clock at **0.05x** during the extended funding and liquidation experiment, while retaining the original oracle price bytes, contract WASM and expiry rule. It is not realistic mainnet timing, does not prove current market quote freshness, and is not a lender repayment guarantee. The Stage93 execution mode remains normal speed. The uploaded historical-clock evidence must disclose this experiment. Mainnet spending and payouts remain disabled.

# Stage146 — Actual NEAR Workspaces partner-to-liquidator funding experiment

**26 October 2026. This is an attempted real *local NEAR Workspaces* transaction route, NOT an uncollateralized mainnet flash loan. Status is determined only by the genuine post-merge [Stage146 GitHub Actions workflow](../.github/workflows/rhea-stage146-genuine-partner-sandbox.yml) and its real receipt artifact, never by tests alone.**

## Native Rhea Liquidate JSON encoding correction

Authentic post-merge [run #40342808946](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40342808946) independently verified a complete local Sandbox partner-to-liquidator token transfer and deposit: **1,858,490,264,605,800** LiNEAR atomic credited, **1,858,116,556,301,499** account-level Rhea supplied shares, **0** token wallet balance after deposit. Actual artifact [#12659183550](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40342808946/artifacts/12659183550).

The first real separate liquidator `execute_with_pyth` attempt then returned a genuine contract parse failure: `unknown variant account_id; expected ... Liquidate ...`. This was NOT a liquidation, because Stage146 mistakenly submitted `actions:[{account_id,...},{Withdraw:...}]` instead of `actions:[{Liquidate:{account_id,...}},{Withdraw:...}]`. The new `stage146BuildPartnerFundedLiquidationActions` preserves the **original source-approved Liquidate inner fields** and wraps them in the required enum variant, with an explicit test checking exact ABI output. Re-run needed; do not claim successful liquidation or lender repayment until real final receipt/state checks pass.

---

## Actual lender issue, executor transfer and Rhea supply — FINAL receipt proof

Live Workspaces [run #40341498348](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40341498348) passed the authenticated historical import. The preserved [artifact #12659333146](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40341498348/artifacts/12659333146) independently establishes *FINAL* original signed receipt references for:

- Rhea partner Borrow→Withdraw: `CRttpqVd9iEyHAiiT8URDXEzw2PUXzW9tT4y8pFQdV79`, 12 successful final receipt outcomes
- Real LiNEAR NEP-141 partner→liquidator `ft_transfer`: `FCHPrB1sNgUZ8EjeSx6c6LHDoC1YhCSCe3fSDgrmeh54`, two successful final outcomes
- Real LiNEAR `ft_transfer_call` supplied to Rhea: `CC3no1rQ3P6TALdwVkNRBboAMRQ4hJWinfG8Kv3HgSRf`, six successful final outcomes, with Rhea `deposit` event

The local lender issued **1,858,490,264,605,800 atomic LiNEAR** to the fresh zero-collateral executor. It was actually transferred into Rhea. **The run is still BLOCKED before Liquidate**: the verifier erroneously searched `position.supplied`, but authenticated deployed Rhea's `get_account_all_positions` places deposited uncollateralized assets in `account.supplied` and only `borrowed` / `collateral` inside `positions.REGULAR`. Corrected the role-specific parser and now save the post-deposit actual supplied-share count and remaining wallet FT balance *before* applying the strict deposit proof gate.

Original actual successful Stage93 `stage116-before-state.json` and `stage116-after-state.json` independently confirm this exact account layout. No borrower liquidation or external lender repayment has been verified yet; Stage145 is BLOCKED.

---

## Genuine run evidence and known blocker (26 October 2026)

The live push-to-main [Stage146 run #40340360901](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40340360901) **failed** after clearing all pinned source imports, Pyth view parity and initial wNEAR collateral funding. Genuine artifact `stage146-real-local-partner-to-rhea-financing-attempt` [#12658428585](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40340360901/artifacts/12658428585) preserves the phase.

The local Sandbox actually registered a new zero-collateral `stage146-liquidator.test.near` and Rhea emitted `borrow`, `withdraw_started`, `withdraw_succeeded` and genuine NEP-141 `ft_transfer` events for **1,858,490,264,605,800** LiNEAR atomic units to the separate `arbivane-replay.test.near` partner. **However, Stage146's initial wrapper prematurely rejected the SDK's EXECUTED asynchronous response before consulting the original FINAL callback receipt.** Therefore the actual Stage146 workflow was **not completed**, and lender-to-liquidator FT transfer, the follow-on Rhea liquidation, lender repayment, and zero final liabilities remain **unverified**.

The next patch resolves each signed Rhea promise chain through the original Stage124 FINAL callback resolver *first* and similarly resolves NEP-141 FT transfers using the local Sandbox `txStatusReceipts(...,'FINAL')` before allowing successful transfer/balance reconciliation. No extra transaction is resubmitted to rescue an uncertain callback. The [Stage146 CI workflow](../.github/workflows/rhea-stage146-genuine-partner-sandbox.yml) must be rerun and the new actual artifact inspected before declaring any completed financed liquidation.

---

## Why this is different from Stage144

Stage144 modeled money flows in JavaScript memory, but never moved fungible tokens. Stage146 forks the original verified [Stage93 Rhea Sandbox historical replay](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342) to attempt genuine token and contract transactions **inside a disposable NEAR Workspaces chain**.

1. Verify authentic Rhea lending, Pyth oracle, wNEAR and LiNEAR deployed code and original historical borrower at one pinned source block; import the contract code and relevant historical storage into an isolated Sandbox.
2. The **separate local Sandbox partner** receives disposable wNEAR from the Workspaces root and deposits it as collateral into imported Rhea. Only the *partner*, not the liquidator, posts this temporary **Sandbox** collateral.
3. The partner tries a real source-capped **Rhea Borrow → Withdraw** to obtain genuine wallet-level LiNEAR NEP-141 from the imported contract. Record the original signed transaction and callback receipts, and independently observe increased partner FT balance and borrowed shares. A failed first borrow is an **attempt failure**, not proof.
4. A freshly registered **zero-collateral liquidator** receives an actual `ft_transfer` of LiNEAR from the partner. The original NEP-141 token contract must record matching before/after balances.
5. The liquidator uses a real `ft_transfer_call` to **supply** those borrowed tokens to Rhea, without posting any wNEAR as collateral. Rhea supplied shares and actual wallet FT decrease must both be observed.
6. The liquidator invokes the real deployed `execute_with_pyth` liquidation + withdraw route, with independently verified borrower debt/collateral share decreases and **zero** executor borrowed shares.
7. Only if genuine seized FT is sufficient, execute `ft_transfer` returning the partner's principal. Verify partner's token balance increase. Then the partner attempts `ft_transfer_call` with `Execute.Repay` to extinguish its own collateralized Rhea Borrow; require all outstanding partner borrowed shares to reach zero.
8. Only after every original receipt and before/after FT/balance check pass can the *local* result say `ACTUAL_LOCAL_PARTNER_FINANCED_RHEA_AND_FT_REPAYMENT_VERIFIED`. No owner wallet transaction or mainnet profit is authorized.

This is **not an atomic flash loan**, because these are different NEAR asynchronous transactions; a failure after a partner transfer may expose the lender to temporary or permanent loss. Source collateral is created inside the Workspaces Sandbox, not acquired from a real partner, and there is no paid gas sponsor, real swap, mainnet deployment or verified tradable profit.

## Execution gates and real evidence

The new `scripts/stage146-real-workspaces-partner-lender.mjs` is ONLY callable when `NEAR_WORKSPACES_NETWORK=sandbox`, `STAGE146_ALLOW_LOCAL_NEAR_LOAN=true`, `EXECUTION_ENABLED=false`, and no mainnet private key/account variables are present. It refuses unsupported assets and methods. The Stage146 Workspaces runner is an independent copy of the successful Stage37 importer so prior Stage93 real-liquidation workflows remain undisturbed.

The [Stage146 workflow](../.github/workflows/rhea-stage146-genuine-partner-sandbox.yml) downloads genuine Stage93 `stage38-positive-stage35-evidence.json`, verifies the previously proven Rhea historical proposal and imported-collateral source, installs `near-workspaces@5.0.0`, and uses the verified nearcore **2.13.4** Sandbox artifact. It then attempts the actual local partner-funded transaction path.

On every success/failure it preserves `stage146-actual-partner-evidence.json`, original executed-transaction receipt references, phases and the pinned import source. **A skipped loan, failed callback, stale oracle, insufficient live NEP-141 liquidity or unpaid partner debt must fail the real-workflow job**. An isolated JavaScript success/unit test is not accepted as an on-chain achievement.

Use:
```bash
node --test tests/rhea-stage146-local-partner-loan.test.mjs
```

Do not upload any NEAR owner wallet private key or fund `okunlola_labs.near` or `sillywiki4201.near`. Stage146 is disposable local-only work.

## Remaining production blockers

Even a completed local Stage146 is **not permissionless flash liquidity**. Before it can become a real funded liquidation, an independent capital provider needs to authorize/fund a secure lender vault with repayment enforcement, audited custody and clear terms; failed callbacks must not force that lender to absorb unbounded risk. Actual profitable mainnet trading additionally requires live executable swaps, gas/storage financing, genuine net profitability, current borrower eligibility, enforced onchain loss caps and explicit owner approval. The existing Stage145 deny-by-default status remains unchanged.

**The goal:** move from code-only book-keeping to truly observed funds leaving a separate Sandbox partner, financing an actual Rhea liquidation, and returning by authentic token receipts. No claim that the provider is real until a separate independently funded, audited deployment exists.
