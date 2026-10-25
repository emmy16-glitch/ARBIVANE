# Stage49B — genuine local collateral funding after existing Stage49 route and storage preflight

## Why this is necessary

Stage37's historical `Borrow → Liquidate → Withdraw` call previously created a **brand-new Sandbox actor with no collateral**. The observed mainnet Rhea callback witness failed because its Borrow token was disallowed. A borrower having an apparently profitable liquidation opportunity does not mean a fresh actor can borrow capital for it. Submitting the route before checking loan funding or eligibility mostly exercises the failing callback path.

Stage49 adds actual disposable Sandbox-only financing, without inventing a Rhea borrower, pretending mainnet funds exist, or changing a copied balance directly.

## Real NEAR Sandbox action sequence

After the strict authentic Stage35 proposal gate and completed bounded source-state import, the runner:

1. Adds a pinned copy of **real `wrap.near` bytecode and storage**, in addition to Rhea lending, oracle and candidate FTs. It independently compares lending config, borrower positions and **all pool assets** between source pinned block and clone.
2. Creates `arbivane-replay` with **3 disposable local Sandbox NEAR**, never a mainnet key or wallet.
3. Requires `wrap.near` to have **`can_use_as_collateral: true`** in the source-cloned Rhea asset registry.
4. Registers the temporary actor in Rhea and wrapped NEAR storage where not already registered, with tightly bounded local-only registration deposits (each contract's verified NEP-145 minimum (capped at 0.1 Sandbox NEAR)).
5. Calls the actual imported `wrap.near.near_deposit` with **1 Sandbox NEAR** and verifies that its NEP-141 FT balance genuinely rose.
6. Calls actual imported `wrap.near.ft_transfer_call` with `receiver_id=contract.main.burrow.near`, `amount=10^24` and `msg='"OnlyIncreaseCollateral"'`; verifies successful callback receipt, reduced FT balance and new actual liquidator collateral recorded by cloned Rhea.
7. Independently tests that the repay asset is currently in `get_assets_paged`, `can_borrow === true`, its supplied-versus-borrowed internal pool headroom is sufficient for the exact proposed internal Borrow amount and that the new actor now has non-zero lending collateral.
8. Only when these checks pass, attempts the already gated **real local** `execute_with_pyth` route, and requires the existing Stage48 later-finalized persistence proof plus Stage41 borrower debt/collateral reduction, actor solvency and actual seized FT proceeds.

These are **real mutable operations on a disposable local Sandbox**, not mocked Rhea state. The unit tests use fixtures; the next qualified live Action run must provide the actual integration proof.

## Safety and limits

The workflow explicitly supplies both `STAGE37_ALLOW_SANDBOX_MUTATION=true` and `STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING=true`, and `NEAR_WORKSPACES_NETWORK=sandbox` with `EXECUTION_ENABLED=false`. The runner refuses missing flags and any public wallet private key. All external NEAR archival RPC calls are `view_account`/view functions/state reads, never signed sends.

**A WNEAR collateral deposit is not a verified borrowing limit**: the exact deployed Rhea health factor and price feed still govern the callback. Pool `supplied.balance - borrowed.balance` is a rough indicative upper bound, not a promise of available borrowed tokens. Stage49 conservatively refuses obvious capacity shortfalls or forbidden assets and treats any actual callback failure as failure.

One Sandbox NEAR of collateral may be insufficient for a particular borrower: **do not disable the capacity or actor health checks to force an apparent successful trade**. Unsupported token registry flags, missing storage, failed registration, reverted transfer, FT balance discrepancy or lending position mismatch block the attempt. No dummy token minting, direct state balance patching or impersonated mainnet holder is allowed.

**Still missing**: independently confirmed deployed liquidation action semantics, full imported trie-root parity, sufficient collateral for arbitrary repay amounts, genuinely current risk/price-positive candidates, a completed actual Rhea Sandbox liquidation receipt, real swaps/financing costs and net profit, approved signer/risk limits for mainnet. This stage does not authorize any live spending, transfers or withdrawals.

## Verification

Run `npm run check` and inspect the GitHub Safety Actions result. Later, for **authentic positive source evidence only**, inspect `stage49-sandbox-funding.json`, `stage37-sandbox-execution.json` and `stage41-sandbox-balance-settlement.json` from the Stage37/42/44 workflows. A missing Stage49 artifact, unverified collateral deposit or blocked capacity means **no Rhea liquidation**. Existing current-evidence scans continue with read-only mainnet queries.

This implementation builds upon merged Stage49 PR #71: its pinned permission gate and three-account NEP-145 storage registration remain in place. The real wrapper collateral seed is performed afterward, before the exact borrow-capacity preflight and Sandbox call. Tests and future live artifacts must establish outcomes separately.
