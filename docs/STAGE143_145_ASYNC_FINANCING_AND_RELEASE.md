# Stages143–145 — recovery, financing simulation, production gate

**26 October 2026. These are executable offline engineering safeguards, NOT a real uncollateralized lender, not a new funded Rhea Workspaces transaction, and not an authorized mainnet trading deployment.**

The owner has no capital, so the only previously verified local Rhea liquidation used **1 NEAR of locally created wNEAR collateral in the disposable Sandbox**. The new stages must never present that capital source as a permissionless external flash loan.

## Verified GitHub execution (26 October 2026)

**PR [#217](https://github.com/emmy16-glitch/ARBIVANE/pull/217) merged** to main at commit `09d657d8e01e417e80fc205cd483ed9a19961044`. Its pull-request checks for the adversarial lifecycle tests and full repository safety/type checks both passed.

The genuine post-merge [run #40337081020](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40337081020) **passed both jobs**, including a real download and independent audit of the original successful Stage93 Rhea settlement and source funding evidence. The uploaded [artifact #12656484494](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40337081020/artifacts/12656484494) was independently downloaded and inspected.

The original JSON proves exactly:
- `authenticStage93RheaLiquidationObserved: true`
- `authenticStage93FundingClass: RHEA_OVER_COLLATERALIZED_BORROW`
- `authenticStage93DepositedSandboxCollateralYocto: 1000000000000000000000000` (disposable 1 NEAR equivalent Sandbox seed)
- `authenticStage93NetSeizedFtAtomic: 2531190098868`
- `stage144PartnerModelComplete: true` (**only synthetic accounting**)
- `modelSimulationNetAtomic: 97000` (**invented local token-atomic scenario, not monetizable proceeds**)
- `partnerFundsActuallyTransferredToRhea: false`
- `actualStage144PartnerFinancedWorkspacesLiquidation: false`
- `lenderPrincipalAndPremiumRepaidOnchain: false`
- `netRealizableNearTradingProfitProven: false`
- `ownerMainnetProfitPaid: false`
- `mainnetBroadcastPermitted: false`
- `productionStatus: BLOCKED_NO_VERIFIED_EXTERNAL_FINANCING_OR_SPEND_AUTHORIZATION`

**Consequently Stages143 and 145 implement robust local checks but Stage144's *external-financed on-chain acceptance* remains outstanding.** Passing CI alone does not upgrade that claim.

---

## Stage143 — asynchronous financing recovery

`scripts/stage143-async-financing-journal.mjs` implements a deterministic, hash-chained, append-only **simulation** of the NEAR promise financing lifecycle:

```text
CREATED -> FUNDS_ISSUED -> LIQUIDATION_CALLBACK_FINAL
        -> REPAYMENT_TRANSFER_FINAL -> ASSET_CONVERSION_FINAL -> RECONCILED
                     \            \                \          \
                      ---------------------------------> FAILED [halt]
```

- All transitions require unique monotonically numbered events, a matching previous journal SHA256 fingerprint, a unique receipt identifier, and a valid state edge.
- The journal rejects duplicate/out-of-order receipts, tampered outstanding debt, unauthorized transitions and an insufficient simulated repayment.
- A failed callback halts the lifecycle. If principal was issued and not repaid, the journal **retains the outstanding liability** instead of making a fake refund or retry. A failure after repayment remains halted, with payout blocked.
- **Every receipt name here is a synthetic simulation placeholder**, not a NEAR-validated on-chain receipt. Hashing is useful for checking local consistency; it does not make user-supplied evidence true or provide Ed25519 validator proof.
- Even a fully reconciled simulation has `realReceiptsCryptographicallyVerified:false`, `profitPayoutPermitted:false` and `mayBroadcastMainnet:false`.

## Stage144 — partner-funded accounting simulator and authentic Stage93 comparison

`scripts/stage144-partner-financing-simulation.mjs` implements **in-memory token-atomic accounting** for a separate partner escrow:

- The partner is presumed (not verified) to start with enough LiNEAR to front the principal and cover repayment terms; the owner's contribution is strictly zero.
- In a successful **simulation**, issue principal once, model a Rhea liquidation response, repay principal+premium, account for swap/gas/storage and compute the residual on the executor; journal all steps.
- Inject failure before liquidation, before repayment or before conversion and assert that liabilities remain open and no owner payout becomes possible.
- The account values are hypothetical **NEP-141 atomic token units**, not the observed Stage93 internal Rhea shares.

`scripts/stage144-authentic-bridge-cli.mjs` additionally validates the **original genuine Stage93 Rhea Workspaces artifacts**, independently using Stage139's historical funding classifier, and publishes an explicit two-column distinction: `authenticStage93RheaLiquidationObserved:true` vs. `actualStage144PartnerFinancedWorkspacesLiquidation:false`.

To repeat the original-evidence comparison:

```bash
node scripts/stage144-authentic-bridge-cli.mjs original-stage93 stage144-original-vs-financing.json
```

The GitHub Action [Stage143–145 recovery gate](../.github/workflows/rhea-stage143-145-recovery-readiness.yml) downloads actual Stage93 artifact `stage93-authentic-borrower-2579` from real successful [run #40317139342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342) and fails if the existing capital-backed route gets falsely labeled partner/flash-funded.

**Not implemented yet:** actual third-party liquidity transfer to a Workspaces actor, real Rhea liquidation paid by that external facility, external lender principal+premium repayment token receipt, locally observed post-gas/swap realized profit or capital protection under all asynchronous promise failures. Completing Stage144's *on-chain acceptance criteria* requires a real separately controlled provider/partner and code, not synthetic balances.

## Stage145 — fail-closed production qualification

`scripts/stage145-production-qualification.mjs` consumes a valid Stage142 hashed intent, Stage143 journal and Stage144 accounting simulation, then reports **a machine-readable, permanently blocked prototype status**. It contains no mainnet signer.

It lists ten independent external gates:
1. Audited real NEAR-native lender or genuine funded partner/vault
2. Authenticated third-party principal transfer
3. Safe asynchronous repayment and failure handling
4. Real partner/flash-financed Rhea Workspaces transaction
5. Original on-chain NEP141 FT receipts, balances and liabilities reconciled
6. Executable and actually settled swap, gas and final net economics
7. Independently funded gas/storage sponsor
8. Formal outside audit of vault/signing and external capital risks
9. Actual owner approval of limited custody and mainnet operations
10. Deployed and verifiable spend/loss/risk caps

Operator-supplied `true` flags are NEVER considered evidence. Even if every self-reported checkbox is checked and offline profit is positive, Stage145 returns `canActivateMainnet:false`, `maySignMainnet:false`, `mayBroadcastMainnet:false`, `canReleaseOwnerProfit:false`.

**Why the gate cannot become green now:** There is no verified native uncollateralized LiNEAR lender in the six surveyed deployments (Stage141) and no live external funding partner; these are dependencies outside this repository. Building a green flag in the absence of this evidence would be dangerously misleading.

```bash
node --test tests/rhea-stage143-145-financing-recovery.test.mjs
```

## Milestone state

| Milestone | Delivered in code | Real external-financed acceptance |
| --- | --- | --- |
| 142 — financing adapter input | Two strict offline intent modes, canonical hash, fixed units, no custody | **Blocked** — actual provider not attested |
| 143 — async recovery | Immutable journal, preserved debt on failure, adversarial replay tests | **Blocked** — no live loan/repayment receipts |
| 144 — partner funding Sandbox | Deterministic separate-partner simulated accounting, genuine Stage93 classification | **Blocked** — no authentic new partner-funded Workspaces call |
| 145 — production qualification | Ten independently auditable blocker gates, unconditionally denied mainnet authority | **Blocked** — no custody, sponsor, formal audit or real profit |

The next work should prioritize building a genuinely funded Workspaces harness with controlled third-party capital and a real provider vault, followed by an independently audited claim on the *actual* Rhea promise receipt tree. Do not request the owner to deposit capital merely to make Stage145 green.
