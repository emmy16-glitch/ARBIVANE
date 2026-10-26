# Stage166 — recover source-pinned collateral pricing read without weakening Pyth parity

## Confirmed original source failure

On 26 October 2026, [Stage157 genuine large-source run #40387459139](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40387459139), batch 0 shard 0, original artifact #12683120600, included one qualified LiNEAR/LiNEAR reference candidate: `fukaih.near`. Its source reference repayment was `5964184207567719603706` lending internal units and gross was `774324379340112383344140` USD-E27 (**about $0.000774**, not dollars of realized revenue).

The Stage165 borrower-scoped closure successfully imported the original code/state of lender, aggregate oracle, WNEAR, LiNEAR and `meta-pool.near` at the **same historical pinned source block** (221732739; original hash `EU1ouKQxFVyPNjVHPSsvHo3ntqUfRTxLYfULtk9bp3wo`). The original Stage88 witness recorded all five dependencies, including `meta-pool.near`'s **62,971 read and patched storage records**, complete pagination, and no mainnet mutation. Stage51 original selected-asset Pyth price and LiNEAR derived ratio parity also passed.

**The attempt failed before local funding and before Rhea transaction** in Stage164's extra derived-price proof with `STAGE164_PINNED_SOURCE_RATIO_VIEW_FAILED`. Stage164 performed an additional direct source RPC read even though Stage51 already used classified retries and an independent archival fallback. The original generic error only shows that this read failed. It does **not** establish that the RPC failed transiently rather than the contract rejecting the view; Stage166 must preserve that distinction. A new Sandbox receipt is required to confirm successful recovery.

## Exact implementation

- Stage164 now accepts a separate, read-only `fallbackRpc` for `get_st_near_price`, `ft_price` and other source-defined derived pricing methods in the borrower closure.
- Only a `NearRpcHttpError` with HTTP 429/5xx, abort/timeout or classified transient transport failure may switch endpoints. An original contract error, invalid schema, missing method or inconsistent pinned response must **fail closed**.
- Both the primary and secondary use the **same exact source block ID**; no final/latest view, no rewritten price, no fabricated account or oracle field.
- If the archival endpoint fails, record `STAGE166_PINNED_ARCHIVAL_RATIO_FALLBACK_FAILED`. If it responds at another block, `STAGE164_PINNED_SOURCE_RATIO_BLOCK_DRIFT`; if the local imported value differs, `STAGE164_DERIVED_PRICE_SOURCE_CLONE_MISMATCH`.
- The archival adapter uses already available `ResilientNearReadOnlyRpc` and `NearReadOnlyRpc`, with bounded retries and pinned memoization. Secrets and raw provider URLs never enter report evidence.
- Stage164 publishes `sourceFallbackReads` to differentiate original primary observations from safely recovered historical reads.

## Scope and honest acceptance

The new branch tests transient 429/503 fallback, identical block, unchanged ratios, source contract errors, archival failure, forged blocks and mainnet broadcast absence. Success in unit tests **does not** establish a live Sandbox settlement. After merge inspect a new archived Stage157 source result and original Stage55/56/FINAL callback receipts. A successful imported quote does not pay a lender.

Stage160 no arbitrary positive amount floor remains intact, while actual Rhea debt, pool liquidity, reserve, contract rules, exact pricing and financing economics still cap execution. **No mainnet private keys, real funds, trading authorization, guaranteed profits or external flash lender are introduced.**
