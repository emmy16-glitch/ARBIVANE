# Stage171 — dashboard limits reach the actual Workspaces runner

## Root cause
On main commit 23d7634, the dashboard validated `maxFinancingUsd` and forwarded
`ARBIVANE_MAX_FINANCING_USD`, but the Stage37 runner never consulted it.
A user entering $0.37 could unknowingly start an eligible ~$0.378 historical
repayment. Similarly, `minimumNetProfitUsd` was stored but not screened.

## Safe correction
- The authentic, unaltered Stage35 source proposal's `repay.referenceUsdE27`
is compared to the entered maximum in exact BigInt USD-E27 **before the
first source RPC, Sandbox clone, actor funding or liquidation call**.
- `paperGrossUsdE27` must at least equal the entered desired net-profit
target. This is a **necessary-only** check: paper gross is *not* realized net
earnings or a loan/gas/swap quote. No positive financial credit is created.
- Changed browser stream state must never overwrite financing values being typed.
- Start is disabled when selected environment is not ready; funding buttons
remain disabled until an actual wallet adapter exists. No fake success toasts.
- Legacy historical Workspaces CI runs without dashboard variables retain
their existing isolation and source guards.

## Known limitations
A dashboard start replays one separately attested Sandbox source. It is not
an autonomous current-market scanner; persistent discovery, automatic repeated
economic trades, on-chain liquidity/flash financing and transferable wallets
remain unimplemented. Mainnet remains completely disabled. Stage157's original
WNEAR Pyth feed mismatch is an independent root cause requiring verification.
