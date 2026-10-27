# ARBIVANE

**NEAR-native liquidation discovery, source-backed risk checks and verifiable Rhea execution**

ARBIVANE studies lending positions on NEAR, identifies candidate liquidations, checks protocol rules and available liquidity, and tests the complete transaction against an isolated copy of the real Rhea contracts. The emphasis is on proving what happened, not confusing a profitable-looking estimate with money actually earned.

**Current state — 26 October 2026:** The project has executed and independently verified genuine Rhea liquidation and separately financed repayment transactions **inside disposable NEAR Workspaces Sandbox**. The latest successful Stage93 verification is [run #40320594342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594342). It has **not** executed a funded mainnet liquidation, sold seized collateral for realized net profit, connected an owner's wallet or enabled production signing.

The responsive authenticated operations dashboard is documented in [docs/DASHBOARD.md](docs/DASHBOARD.md). It shows only persisted backend evidence, keeps all three environments separate, can invoke the existing genuine Workspaces runner when its source evidence is configured, and exposes no mainnet signing route.

**Stage171 dashboard enforcement:** [Budget admission](docs/STAGE171_DASHBOARD_BUDGET_ADMISSION.md) passes user-entered Sandbox financing and minimum profit targets into the original Stage37 source approval gate, rejecting over-cap source repayments *before* local funding and acknowledging that paper gross cannot attest net profit. Disabled custody functions and the one-run historical replay are not described as autonomous live trading. Mainnet remains disabled.\n\n## Capital-free funding is the next engineering objective

The owner has **no starting capital**. ARBIVANE is investigating genuine native NEAR flash liquidity or another independently verifiable, zero-collateral financing route. The successful Rhea Sandbox transaction was **not** a flash loan: it deposited **1 NEAR of disposable Sandbox wNEAR collateral** before Rhea `Borrow`. That was not the owner's money, but it would be a real capital requirement on mainnet.

Stage139 now audits the original successful funding receipts and refuses to mark collateral-backed borrowing as uncollateralized financing. The project has **not yet independently verified a live LiNEAR flash lender**, its safe asynchronous repayment model, or a gas sponsor. **Do not fund your wallet or enable mainnet signing to solve an unverified financing route.** See [Stage139 financing investigation](docs/STAGE139_FLASH_LIQUIDITY_FINANCING.md) and [Stage140 deployed provider discovery](docs/STAGE140_NATIVE_PROVIDER_DISCOVERY.md). Stage140 inspected **actual deployed NEAR mainnet** Rhea and Ref Wasm on 26 October 2026; each had **zero native flash-loan exports** after verifying its on-chain code hash. [Live proof run #40329051976](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40329051976). No compatible LiNEAR flash lender is verified or connected for trade execution. **Stage141** adds deployed-Wasm inspection of [six documented NEAR contracts](docs/STAGE141_LENDER_QUALIFICATION.md) and read-only LiNEAR metadata/candidate balance checks; even a token balance or method named `flash_loan` cannot establish lendable liquidity. The **live six-contract Stage141 scan passed**: all six deployed WASM hashes were verified, but no standard flash-loan entry points were exported. [Stage141 run #40334510592](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40334510592) and [original evidence](docs/STAGE141_LENDER_QUALIFICATION.md). Execution remains disabled.

## Financing recovery and production boundary (Stages142–145)

Stage142 implements an **offline** flash-versus-partner financing intent. Stages143–145 add a strict simulated asynchronous repayment state machine, deterministic third-party capital accounting, an original signed Stage93 proof contrast and a fail-closed production readiness checklist. **The original Stages143–145 partner scenario was only simulated at that stage; Stages146–152 later executed real *Sandbox* partner transfers and liquidations** and no genuine uncollateralized lender is connected. All signing, funding and payouts stay disabled. See [Stage142](docs/STAGE142_FINANCING_ADAPTER.md) and [Stages143–145](docs/STAGE143_145_ASYNC_FINANCING_AND_RELEASE.md).

## Verified Sandbox partner funding and debt repayment (Stages146–153)

**Stage146–148 are real *Sandbox* transactions, not mock accounting:** a separately created disposable Workspaces account financed the zero-collateral liquidator from Rhea using its own test wNEAR collateral. The liquidator transferred genuine cloned LiNEAR, reduced authentic borrowed/collateral positions, returned principal, and retired the partner's Rhea borrowed shares to zero. [Original full-cycle run #40347017312](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40347017312).

**Stage150 scaled the local loan to nearly 10 LiNEAR and succeeded**, including recovery of unused Rhea supply and partner repayment ([original run #40353279895](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40353279895)). **Stage151 scaled it to nearly 100 LiNEAR and FAILED to close the original lender's debt** ([run #40354682373](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40354682373)): `24,899,422,835,948` atomic LiNEAR of additional accrued liability remained, more than the tiny source borrower's liquidation surplus.

**Stage152** separately tried the 100-LiNEAR cycle under a **1,000× artificially compressed historical Sandbox clock**. Real Borrow/Withdraw events appeared, but canonical receipt verification stopped before the liquidation ([run #40357920852](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40357920852)). **Stage153** adds limited, read-only re-queries for original FINAL receipts for the *same transaction hash*, never repeats the borrow or weakens failed callback checks. See [current Stage153 rerun](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40361065214) for execution result; regression checks alone do not prove success.

**Stage153 actual result is FAILED**, not pending. [Run #40361065214](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40361065214) retried canonical FINAL receipts for original borrow transaction `nu5KxAbXhnNvn9n8rLUmzaNL9uiyPh2vXhraSnnZ9dT` four times; each attempt returned `STAGE124_FINAL_RECEIPT_QUERY_FAILED` (artifact #12667044973). No subsequent partner-to-liquidator transfer or repayment was proved. **Stage154** records the underlying FINAL RPC exception and tries a bounded 64-block local Sandbox finality advance between read-only same-hash queries. This is a hypothesis, **not a verified successful 100-LiNEAR cycle** until the new Actions artifact shows full original FINAL callbacks and final partner debt zero. No mainnet, no wallet signing, no economic profitability established.

The [complete Stage153 financing diagnosis and scale gate](docs/STAGE153_SCALED_FINANCING_DIAGNOSIS.md) covers genuine transaction proof, next-run prerequisites and all known financial/production limitations. The historical borrower is still the same small debtor. Borrowing 100, 200 or 1,000 LiNEAR does not automatically increase the value that can be liquidated, while fees and accrued interest grow.

**Original signed-receipt economics audit:** [Stage154 source-sized financing admission](docs/STAGE154_ORIGINAL_FINANCING_ECONOMICS.md) independently downloads the archived genuine 10- and 100-test-LiNEAR contract receipt sets, checks principal movement, original transaction hashes, Rhea liquidation/withdrawal events and outstanding debt. The completed 10-token cycle retained a small **unsold test-token** balance; the 100-token cycle was **economically short by 22,367,968,412,531 atomic LiNEAR** before mainnet costs. This is a funding-size rejection for the currently pinned borrower, not a fixable receipt-counting discrepancy. The separate Stage154 bounded-finality experiment remains a mechanics test, and does not invalidate the financial loss. New principal above 100 is blocked until a genuinely larger eligible borrower and conservative positive net economics are independently proved.

**Fresh post-repair executions:** [10-LiNEAR Stage150 run #40363964469](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40363964469) again completed actual Sandbox Borrow, FT transfer, liquidation, unused-supply withdrawal, full principal repayment and additional accrued-debt payment. Original artifact #12669397778 records `observedPartnerRemainingRheaDebtShares="0"`, `phase="FINISHED"` and `mayBroadcastMainnet=false`. However, [100-LiNEAR Stage151 run #40363964208](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40363964208) again finalized principal return but failed after genuine Rhea repayment with 24,864,254,208,765 atomic LiNEAR additional liability against 2,531,453,907,158 atomic available liquidation surplus: **22,332,800,301,607 atomic deficit** (original artifact #12668504902). The separate Stage152 artificial 0.001× replay is a *receipt-mechanics experiment*, not a way to erase this negative economics; its result must be assessed independently. Larger principals with this borrower must not be attempted as profitable trades.

**Stage156 original FINAL recovery checkpoint:** The artificial-clock 100-token [Stage154 run #40363964271](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40363964271) **FAILED**: original hash `BZEGQmc3jDRJYgScRTHQH7G1FXTaisYuZvKuRxJQbEW5`, `STAGE124_FINAL_RECEIPTS_TIMEOUT` on all four reads, and actual local `final` height **74** before and after each 64-block advance. No borrower liquidation or lender settlement followed. [Stage156 original failure, recovery and independent tests](docs/STAGE156_SANDBOX_FINALITY_RECOVERY.md) explain the new **Sandbox-only 64→10,000-block fail-closed recovery**. The fresh [Stage156 run #40366390552](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40366390552) is a new execution whose original artifact must be inspected; a successful original FINAL transaction still does not erase the verified 100-token loan cost deficit.

**Stage157 — next genuinely larger liquidation experiment:** Instead of scaling the test loan against historical borrower 2579, the new [source-backed larger liquidation screen](docs/STAGE157_LARGER_AUTHENTIC_RHEA.md) evaluates a separate authenticated list of up to **169 historically LiNEAR-indebted borrowers** against *fresh* Rhea/Pyth data. A source-backed same-asset liquidation must be at least **10× larger in Rhea internal repay units** than the original before an isolated Sandbox replay is attempted. Batches are finite and automatically continue if no larger account qualifies, with genuine blocked/failure evidence preserved. This is an **experiment**, not yet proof of a larger liquidation or profit. No mainnet signer, real lender or wallet spending is enabled.

**None of this is mainnet financing.** The Sandbox partner's collateral is disposable test NEAR; it is *not* a committed third-party investor, a permissionless flash loan, mainnet economic profit or money that can be withdrawn. Mainnet keys, wallet spending and owner payouts remain disabled.

## Stage157 — genuinely larger source liquidation search (Sandbox only)

The next experiment screens **new independently attested Rhea borrowers** rather than inflating the loan size against the historically tiny source liquidation. [Stage157](docs/STAGE157_LARGE_SOURCE_LIQUIDATION.md) queries fresh Rhea/Pyth source positions for 320 archived debt-index accounts across four windows. **Stage160 removes the $1,000 repay, $10 gross and 10× prior-size hard minima:** any genuinely source-qualified *positive* amount can be researched in Sandbox. Operators may set optional amount filters, which default to zero. Passing the sizing gate is **not** evidence of realized net profit, flash liquidity, external lender agreement or actual final settlement. No eligible source means **no transaction**. A fresh source still requires proof of spendable liquidity, original FINAL callbacks and all outstanding financing debt closed to zero. Mainnet spending stays disabled.

## Stage159 — choose executable LiNEAR liquidation sources first

The Stage157/158 larger-borrower search now has an explicit **LiNEAR/LiNEAR-only proposal selection** for the proven local Sandbox execution lane. A higher-gross WNEAR or other unsupported source cannot eclipse a genuine LiNEAR candidate in the same fresh source batch. Unsupported candidates remain recorded in the source evidence as non-executable, not silently discarded. Source admission also requires Rhea-internal repayment at least **10× the prior source size**, a strictly positive same-token liquidation remainder. **The former 10× and $1,000/$10 mandatory size floors were removed by Stage160.** See [Stage159 implementation and validation boundaries](docs/STAGE159_EXECUTABLE_LINEAR_SOURCE_PRIORITY.md).

This only improves opportunity selection and stops invalid replays: **a larger funded, fully repaid liquidation has not yet been proven**, and an estimated spread is not actual financing-covered profit. Mainnet execution remains disabled.

## Stage162 — diagnose genuine borrower eligibility and select supported LiNEAR pairs

The [Stage162 source-route diagnostics](docs/STAGE162_SOURCE_ROUTE_REJECTIONS.md) follow Stage161's completed four-batch review of 169 historic LiNEAR-debt candidates. **All 16 conditional Sandbox replays were skipped: no newly qualified liquidation, complete partner repayment or profit was proven.** Stage162 improves the next read-only scan by selecting LiNEAR/LiNEAR pairs *inside* each source-sized borrower, and recording explicit Stage35 healthy, route mismatch, source-rule, liquidity permission/headroom, oracle and read-failure categories rather than collapsing everything into one generic rejection. It does not loosen original protocol rules, funding settlement requirements or enable mainnet execution.

## Stage160 — any positive source-sized amount, no mandatory minimum

[Stage160](docs/STAGE160_ANY_SIZE_SANDBOX_LIQUIDATION.md) removes Stage159's arbitrarily fixed size floors in **both** Rhea borrower-discovery lanes. It also fixes the Stage157 regression workflow's Node TypeScript flag; the previous large workflow failed before any market scan. The original borrower, protocol risk rules, LiNEAR asset route, positive same-token remainder, FINAL callback/FT receipts, principal and financing-interest repayment and zero remaining debt still govern real Sandbox success. You cannot select an unsupported loan amount by overriding the source's real debt. **No mainnet signing, wallet spending or payouts.**

## Stage163 — fair RPC retry for blocked liquidation borrowers

[Stage163](docs/STAGE163_FAIR_RPC_RECOVERY.md) addresses a verified source-discovery issue: the 80-account shard with 11 paper at-risk LiNEAR borrowers recorded 11 RPC timeout/rate-limit blocks. The old recovery budget could retry only its first four accounts. Stage163 spreads retries across all blocked borrowers before second retries, raises the explicit large-shard budget to 40, reduces RPC concurrency, and reports deferred reads without treating them as liquidation failures or successes. **A provider outage remains a blocker, not permission to bypass Rhea rules.** No mainnet spending is enabled.

## Stage165 — borrower-scoped source pricing dependencies in Sandbox

[Stage165](docs/STAGE165_BORROWER_SCOPED_PRICE_DEPENDENCIES.md) corrects a Stage164 regression: scanning all market-wide Rhea derived-price tokens exceeded the six-contract Sandbox clone limit and blocked a previously successful Stage93 replay. The dependency closure now selects **only authentic pinned borrower debt/collateral tokens plus execution assets**, importing `meta-pool.near` when the particular borrower actually needs `get_st_near_price`. Missing prices and contracts continue to fail closed; no mainnet spending or profit claim.

## Stage164 — source-pinned collateral price dependencies in Sandbox

[Stage164](docs/STAGE164_DERIVED_PRICE_CLONE_CLOSURE.md) addresses the first genuine new-source LiNEAR attempt that reached Rhea's Sandbox callback: [run #40382961811](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40382961811) failed because **`meta-pool.near` was not cloned**, and the deployed Rhea contract invoked `get_st_near_price` when pricing collateral. Its prior LiNEAR oracle parity and actor funding checks passed, but no liquidation/repayment completed. The new clone closure imports all recognized source-declared derived pricing dependencies, compares each pinned source price with its original-code Sandbox clone, and refuses execution when any dependency is missing or mismatched. No fake contracts, prices, transaction approval or mainnet spending.

## Stage166 — source-pinned derived-price RPC recovery

[Stage166](docs/STAGE166_PINNED_DERIVED_PRICING_READ_RECOVERY.md) addresses the original [#40387459139](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40387459139) result: Stage165 successfully imported original deployed `meta-pool.near` with 62,971 storage keys and passed Stage51 LiNEAR Pyth parity, but a subsequent standalone derived-price read failed before the local transaction (`STAGE164_PINNED_SOURCE_RATIO_VIEW_FAILED`). An **independent archival, exact-block read fallback is now allowed only for classified transient RPC errors**. Real contract rejection, invalid oracle ratios, block drift or missing source data still block. Tests alone do not demonstrate actual settlement, real loan repayment or profit, and mainnet spending remains disabled.

## Stage168 — fail-closed wNEAR SDK import recovery

[Stage168](docs/STAGE168_WNEAR_PINNED_WASM_RPC_FAILOVER.md) addresses a verified original [Stage93 run #40400219939](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40400219939): source-backed candidate checks passed, but the NEAR Workspaces SDK failed to import pinned `wrap.near` code after provider **JSON-RPC -429 rate limiting**. The resulting clone failure was **before** local funding or liquidation. The new bounded SDK import fallback reads unchanged deployed code at the same pinned block from an independent archival endpoint, verifies the original code hash and all cloned FT state, and blocks on provider exhaustion. Its regression tests reject false success, changing contract code or deterministic source errors. No mainnet spending or realized profit is enabled.

## Stage169 — proportional source liquidation sizing and rounding protection

[Stage169](docs/STAGE169_SOURCE_REPAY_ROUNDING_HEADROOM.md) addresses the first genuine [larger-candidate Sandbox rejection #40402755800](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40402755800). The deployed Rhea callback rejected the original source-sized LiNEAR seizure because its **discounted collateral value exceeded the debt it actually repaid after share rounding** (about US$0.000000078 difference). The source scorer now holds back a **candidate-proportional, at-most-1-basis-point repayment margin** inside the source discount, selects only source-valid seized collateral and rechecks the four original rules. Exact original-callback and multi-size regression tests preserve original Pyth pricing and guard against artificial amounts. Stage93's completed small Sandbox liquidation remains the prior independent proof; new larger-financing and **positive realized net profit remain unverified**. Mainnet execution stays disabled.

## Stage170 — source-based larger LiNEAR opportunities, not oversized loans

[Stage170](docs/STAGE170_BOUNDED_SOURCE_SCALING.md) builds on the merged [Stage169 rounding headroom](https://github.com/emmy16-glitch/ARBIVANE/pull/259). Only the Stage157 same-token LiNEAR Sandbox research lane may now screen up to **10% of independently source-verified borrower debt** rather than 1%, still under original Rhea four-rule health/collateral constraints and Stage169's conservative repayment rounding reserve. It reports real reference USD E27 separately from internal LiNEAR units, keeps all actor-financing and FINAL receipt checks, and leaves other Stage38 callers at 1%. This **does not** grant 10% executable borrowing, access to any mainnet flash loan, or proven net profit.

## What works today

| Area | Verified capability | Boundary |
| --- | --- | --- |
| Market discovery | Read-only Rhea asset, account and debt pagination; bounded shards, cursors, checkpoints and RPC retries | A market scan is not liquidation eligibility |
| Valuation and rules | Same-block source checks, current Rhea configuration, active Pyth price evidence, fixed-point share/health and repay/seize sizing | Old prices and incomplete sources are rejected |
| Opportunity screening | Source-backed risk checks and a historical competition-pressure model | Competition is estimated, never known to be zero |
| Isolated execution | The real Rhea `execute_with_pyth` path: **Borrow → Liquidate → Repay → Withdraw** using imported contracts and state in local NEAR Sandbox | Only disposable Sandbox keys and tokens move |
| Transaction proof | Original signed transaction, canonical `FINAL` callbacks, independent before/after debt and FT checks, Borsh transaction preimage/Ed25519 verification | No independent canonical-mainnet receipt inclusion or full historical trie proof |
| Settlement evidence | Borrower debt and collateral decrease, net LiNEAR FT received, and zero remaining liquidator debt are independently checked | Received collateral is **unsold inventory**, not realized trading profit |
| Mainnet safeguards | Read-only outcome-Merkle-path consistency checker and spending-policy preview | No authenticated light-client head, live signer, wallet connection or mainnet broadcast |
| Automated checks | Node unit/adversarial tests, TypeScript typecheck and GitHub Actions evidence artifacts | Green CI is not evidence of profitable live trading |

A key result: Stage93 [run #40317139342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342) passed all three jobs. The archived proof independently records **1,858,489,628,732,367** internal lending units of borrower debt decrease, **1,861,021,454,676,401** internal collateral decrease, **2,531,190,098,868** atomic LiNEAR units received by the Sandbox liquidator, and **zero** remaining liquidator debt. These values are integer units; they are **not** USD or a cash profit figure. A subsequent execution also passed [#40320594342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594342).

## How liquidation works

1. Read a finalized NEAR block and discover accounts with genuine borrowing positions.
2. Recalculate prices, health, collateral and repayment limits using Rhea's lending configuration and active Pyth prices, with explicit token/share precision.
3. Reject candidates with invalid rules, unavailable reserves, stale data, insufficient liquidator capacity or unbounded economic risk.
4. Recreate the required lending, token and oracle contracts in NEAR Workspaces Sandbox, importing historical chain state and validating parity before calling anything.
5. Sign **one Sandbox transaction** that borrows temporarily, liquidates the selected borrower, repays the actor's borrowed shares and withdraws the remaining token balance.
6. Retrieve the original signed transaction and its actual asynchronous callback outcomes to `FINAL`. Advance the local finalized chain if necessary and independently read lending positions and NEP-141 wallet balances again.
7. Refuse to mark settlement successful unless **borrower debt and collateral both decrease, net seized FT increases, callbacks succeed and liquidator debt returns to zero**.

The temporary Borrow is a Rhea lending action backed by the Sandbox actor's collateral, **not** evidence that the protocol offers a zero-capital EVM-style flash loan. NEAR cross-contract calls and token transfers are asynchronous; callback and post-state proofs matter.

## Architecture at a glance

```text
Read-only NEAR RPC + Rhea/Pyth views
               |
      Pinned-block discovery
               |
    Deterministic health/sizing
               |
      Liquidity + risk gates
               |
    Source/price parity check
               |
   Local NEAR Workspaces Sandbox
               |
   Rhea execute_with_pyth + callbacks
               |
   FINAL receipts + borrower/FT deltas
               |
 Independent signature/Borsh verifier
               |
      Archived evidence artifacts

Mainnet signer and capital custody: NOT CONNECTED
Live swap / realized P&L:           NOT IMPLEMENTED
```

For the code-level data flow, see [Architecture](docs/ARCHITECTURE.md). For the precise distinction between a passing execution and trading profit, see [Evidence and status](docs/STATUS_AND_EVIDENCE.md).

## Run the project

**Requirements:** Node.js **22.16 or newer**, Git and a working command line. The default test/demo flow requires no wallet or RPC credentials.

```bash
git clone https://github.com/emmy16-glitch/ARBIVANE.git
cd ARBIVANE
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run demo
```

`npm run check` runs the TypeScript typecheck and Node test suite. `npm run demo` exercises offline, non-executable examples. A successful demo does not submit a NEAR transaction.

For public-chain **read-only** probes, use environment settings documented in [Operations](docs/OPERATIONS.md). `EXECUTION_ENABLED=false` is required. Example contract IDs below are the historically verified Rhea paths used by the replay; operators must still verify current deployment/code hashes:

```bash
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.near.org
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export EXECUTION_ENABLED=false
npm run probe:rhea
```

Some provider endpoints may require authorization or an archival alternative. The repository's full automated historical Sandbox replay runs through the deliberately gated [Stage93 GitHub Actions workflow](.github/workflows/rhea-stage93-borrower-settlement.yml), not `npm run demo`. See [Operations](docs/OPERATIONS.md) before reproducing it.

## Documentation

| Read this | For |
| --- | --- |
| [Documentation index](docs/INDEX.md) | Where to start, and how to navigate the earlier development stages |
| [System architecture](docs/ARCHITECTURE.md) | Modules, protocols, execution path and verification boundaries |
| [Verified milestones](docs/STATUS_AND_EVIDENCE.md) | Exact successful runs, receipts, what remains unproved |
| [Operating and reproducing](docs/OPERATIONS.md) | Setup, commands, workflows, artifacts and common failures |
| [Wallet and mainnet readiness](docs/WALLET_AND_MAINNET.md) | Supported wallets, owner authorization, capital controls and setup |
| [Security](docs/SECURITY.md) | Threat model, fail-closed design and unresolved custody risks |
| [Roadmap](docs/ROADMAP.md) | Implemented milestones and the next audited deliverables |
| [Protocol and economics](docs/PROTOCOL_AND_ECONOMICS.md) | Pyth/Rhea amounts, same-token routes, NEAR costs and realized profit |
| [Stage137 technical note](docs/STAGE137_OUTCOME_MERKLE_AND_MAINNET_POLICY.md) | Current Merkle-proof and mainnet admission code |
| [Source reuse](docs/REUSE.md) | Upstream research and license handling |

The `docs/RHEA_STAGE*.md` files preserve the engineering history. Their historical status labels are **not a replacement** for this README or the current evidence ledger.

## Your wallet, your funds

No user's NEAR account is configured. `arbivane-replay.test.near` is only a disposable Sandbox account. For a personal wallet, start with the [NEAR ecosystem wallet directory](https://wallet.near.org/) or [Meteor Wallet](https://wallet.meteorwallet.app/). **Do not enter a recovery phrase, private key or seed phrase in a GitHub secret, issue, pull request, chat or application config.** A future integration should require separate operator-controlled authorization and enforceable caps; current Stage138 is only a review tool.

## Non-goals and current limits

ARBIVANE is currently a research and local execution-verification system. It has **no deployed custody/treasury contract, production scheduler with persistent trade outbox, proven live competitor count, autonomous mainnet trader, realized swap execution, NEAR Intents settlement, working consumer dashboard, deployed Shade/TEE agent or production AI decision-maker**. The corresponding directories contain design or pure validation logic, not evidence those services are running.

**No mainnet trading is enabled. No profit is guaranteed.** Use the audit artifacts to evaluate what is actually demonstrated.
