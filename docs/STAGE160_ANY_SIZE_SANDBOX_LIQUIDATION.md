# Stage160 — remove arbitrary minimum size and repair the fresh source scan

## User intent and result

There is **no platform-imposed minimum liquidation size** for the Stage157 read-only search or the isolated NEAR Workspaces Sandbox route. A source-qualified Rhea liquidation can be examined even when its reference repay/gross is below $1,000/$10, or below 10x the original Stage93 internal repayment. The amount **cannot be invented or forced**: borrower debt, Rhea liquidation constraints, reserve liquidity, exact protocol units and current Pyth prices determine executable source size. This is a sandbox discovery policy, not a promise to lend unlimited money.

Source screening accepts any strictly positive repayment, positive reference gross and positive same-token collateral remainder. Optional **user-supplied** `STAGE157_MIN_REPAY_USD_E27` and `STAGE157_MIN_GROSS_USD_E27` filters default to **0** and can be omitted completely. They are search preferences, not mandatory protocol limits; integers use E27 USD reference units, not LiNEAR atomic units. The Stage38 search-specific paper-gross floor is just `1` E27 atomic reference unit, ensuring a positive nonzero proposal rather than imposing any practical USD minimum. The existing 100-basis-point reference repay sizing cap is a risk/reference modeling choice, not an imposed minimum; no amount above the authentic source approval is authorized.

### Failure diagnosed

The merged Stage159 post-push [Stage157 search #40372238960](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40372238960) failed **before searching borrowers**. Its `source_gate_regression` job executed `node --test` without the TypeScript stripping flag, and Node 22.16.0 rejected `src/rhea/rpc.ts` with `ERR_UNKNOWN_FILE_EXTENSION`. Corrected CI runs `node --experimental-strip-types --test` for the Stage157 gate *and* Stage38 pipeline suite. This is an engineering bug; it is not evidence of no liquidatable borrower.

### Two independent search lanes corrected

1. The 320-account, four-shard Stage157/158 LiNEAR priority workflow passes `RHEA_STAGE38_SANDBOX_MIN_PAPER_GROSS_USD_E27=1`, no longer $10, and Stage157's source gate has zero mandatory USD floors or 10x internal repay floor.
2. The separately implemented 4-by-12 archived LiNEAR recheck path (`stage157-large-source-candidates.mjs`) also admits any positive source-sized repay amount. Its independent workflow records zero minimum and refuses unsupported assets, spoofed eligibility, zero same-token remainder and mainnet keys.
3. New tests cover source repayments smaller than the previous source amount, arbitrarily tiny positive references, zero amounts, negative same-token remainder, configurable optional search filters and unchanged no-mainnet permissions.

### Economic and security acceptance

A proposal passing the Stage160 size admission is *not* a profitable liquidation. Independent full-cycle approval still requires **original FINAL NEAR Workspaces receipts**, deployed-code identity, fresh oracle and true borrower balance/rule parity, genuine seized FT transfers, enough transferable token value to cover the lender's principal **plus accrued borrowing interest, fees, any swaps and safety headroom**, and zero outstanding borrowing shares. The historical 100-test-LiNEAR loan was **loss-making** against its tiny borrower. Stage160 does not erase that deficit or claim a permissionless flash provider.

`EXECUTION_ENABLED=false`. Mainnet spending, signing, transfers, owner profit payout, uncollateralized flash liquidity and arbitrary source-state modifications are all still disabled. The next merged main-branch Stage157/Stage157-larger workflows must be judged by their **actual source artifacts and repayment receipts**, not CI test counts or optimistic source price valuations.
