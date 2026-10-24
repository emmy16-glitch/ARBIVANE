# Stage 41 — observe genuine local Sandbox liquidation balance changes

The Stage37 `execute_with_pyth` runner checked callback finality, but callback success did not show whether the borrower's position had actually changed, the sandbox actor had acquired the seized NEP-141 collateral, or an unsettled loan was left in the actor's account. Stage41 now performs these independently observable checks **around the actual Sandbox transaction**.

### Actual behavior

When the Stage37/38/39/40 **verified live source proposal** passes the existing Stage35 admission gate, the isolated Workspaces runner:

1. Imports lending, configured oracle, active Pyth aggregate and borrowed/seized FT contracts at the same archival block using `withData:true`. Refuses missing or mismatched cloned borrower/config views.
2. Creates a disposable Sandbox-only actor. Captures its lending debt positions and both `ft_balance_of` balances before calling `execute_with_pyth`. The pinned borrower account snapshot is already captured.
3. Calls the real imported lending contract using `callRaw`, capturing finalized receipt status including the Pyth callback.
4. Captures the **same four account/token views after execution**. Requires the planned position's debt and collateral lending balances to **both decrease**, no existing/outstanding actor borrow liabilities, and a **positive increase in seized FT balance** in the actor's Sandbox account.
5. Records exact integer native FT token units and lending-internal balance deltas separately in `stage41-sandbox-balance-settlement.json`. A zero delta, a failed callback, malformed snapshots, missing token storage or a residual liability blocks even if the initial entry receipt succeeded.

This is a proof of *local Sandbox state movement only*, not completed financing, a sold collateral swap, or realized profit. Positive native FT collateral inventory is **unsold** and the internal lending amount is not assumed to equal FT token units. The report always sets `positiveNetProfitVerified:false`, `mainnetExecutionEnabled:false`, `maySignMainnet:false` and `mayBroadcastMainnet:false`. Missing/full-clone keyset parity also remains unverified.

### CI, reproducibility and limits

`tests/rhea-stage41-sandbox-settlement.test.mjs` covers success-shaped mocked evidence, failed callback, no debt/collateral delta, unsold collateral, residual/preexisting actor debt and malformed exact amounts. These fixtures **do not** constitute any successful live Sandbox execution. The existing workflow artifact uploads have been updated to preserve the balance attestation if an actual qualified candidate reaches the isolated runner.

The currently queued Stage40 scan may still produce no qualifying positive source plan. In that case, no Sandbox transaction will occur, and no successful replay will be claimed.

**Still needed for real-money execution:** real current price/method parity against deployed Wasm, wholly imported and independently attested storage, finalized successful live-like Sandbox callback **and** fundable/repayable token balances, actual executable financing and collateral swap, gas/storage/competition/slippage-adjusted *realized* profit in one settlement asset, independent limits and explicit owner-controlled signer authorization. No credentials are present or requested in CI.
