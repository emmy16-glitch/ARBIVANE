# Stage169 — Scale liquidations without exceeding real Rhea repayment after rounding

## Exact failing original execution

[Stage157 run #40402755800](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40402755800), original shard-0 artifact #12691066664 (not synthetic).

- Original borrower: `fukaih.near`, original source block `221744041`.
- Original Pyth parity, deployed code/state imports, genuine wNEAR Sandbox collateral and Stage52 actor borrow-capacity all passed.
- A real Sandbox `execute_with_pyth` callback borrowed LiNEAR then rejected the liquidation at deployed `actions.rs:652`:
  `Not enough balances repaid: discounted collateral 0.037959128341869451899819931 > borrowed repaid sum 0.037959050421204388719231544`.
- The source sizing engine had selected the **maximum** collateral amount that passed the reference check, leaving effectively no margin for different Borrow/debt share conversions at the execution block. The callback failure is genuine, and the financing did **not** settle.

## Scoped repair

Stage35 computes source-valid repay/seize quantities from the actual verified borrower and pool. Stage169 does **not** multiply an arbitrary requested loan amount into a proposal. It adds a **discounted-repayment headroom** at *candidate construction time*, before any Stage37 plan:

1. Use only the original active-Pyth-reconciled source **repay USD E27**, original **health-derived discount E27**, and real collateral pricing.
2. Keep a repayment reserve equal to at most **one basis point** (0.01%) of that specific candidate's source repayment, further capped at **one quarter of the candidate's theoretical discounted gross**. These are **maximum relative safety allowances**, not transaction minimums or guaranteed execution spreads.
3. Set the source collateral upper bound to `floor((referenceRepay - reserve)/(1 - discount))` using exact integer arithmetic, then binary-search exact collateral internal units as before.
4. Recalculate the source USD value and assert the Rhea-derived discounted seized value is no more than `repayment - reserve`, and **re-run all four original liquidation checks** on the selected amount. Borrower must remain at risk, must improve health, and discounted seizure must not exceed repayment. Only a **positive reference-gross** source candidate can be selected.
5. Persist `referenceRepayRoundingReserveUsdE27` on the selected source proposal so downstream evidence shows the precise reference margin. This is **not** the actual repayment deficit or confirmation of live economic profitability.

The two alternative safety outcomes are explicit: a source proposal with adequate net margin proceeds to the unchanged authentic, pinned-state, Sandbox-only route; a proposal whose tiny discount/available collateral cannot afford even a minimal E27 integer rounding reserve **does not execute**. This does not impose a minimum trade size across borrowers.

## Scope of scaling

The same source formula operates on all genuine supported repay sizes with no fixed 10x requirement. Sizing is still bounded by **the target borrower's actual source debt**, the current lending pool headroom, its liquidation health, original token price/decimals, route permissions and the Stage50 actual vault check. An external 100-LiNEAR financing amount is **not** permission to liquidate 100 LiNEAR from an account with a smaller debt.

**The original Stage157 candidate's recorded principal was about US$0.038; internal token integers must not be labeled dollars or meaningful profit.** Gross reference spread is not net profit, and no promise of a larger funded transaction, flash lending source or positive economics follows from passing source rules.

## Validation required

- Exact recorded failure regression: unbuffered discounted collateral exceeds original realized repayment; the conservative proposed upper bound is less than the original realized repayment in the reference test.
- Small/large scale checks, precision/discount boundary checks, and existing Stage35/37/41/49/157 tests.
- Full repository safety/type CI and original Sandbox callback receipts. A real successful larger liquidation requires original finalized successful child receipts, borrower debt/collateral deltas, an increase in the liquidator's *actual* liquidated FT holdings, **zero new remaining debt**, fully repaid financing principal and all fees, and a source-verified net return exceeding costs before any positive economic result.
- No mainnet private key, signer, transaction broadcast, provider-funding claim or wallet profit movement. `EXECUTION_ENABLED=false` remains in force. Existing lending financing is **collateralized**, not a proven atomic flash loan.
