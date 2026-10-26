# Stage146 — Actual NEAR Workspaces partner-to-liquidator funding experiment

**26 October 2026. This is an attempted real *local NEAR Workspaces* transaction route, NOT an uncollateralized mainnet flash loan. Status is determined only by the genuine post-merge [Stage146 GitHub Actions workflow](../.github/workflows/rhea-stage146-genuine-partner-sandbox.yml) and its real receipt artifact, never by tests alone.**

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
