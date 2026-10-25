# Stage 52 — real cloned-Rhea Sandbox collateral funding, integrated with Stage 50/51

Stage 52 integrates the existing authentic wrapped-NEAR collateral funding work with the **latest main branch**, rather than overwriting the newer pinned FT reserve (Stage50) or active Pyth valuation parity (Stage51) safety gates. Stage49 already requires pinned borrow/withdraw permission and registers the isolated actor with cloned Rhea lending and repayment/collateral NEP-141 token contracts.

## What happens on a genuine source-positive borrower only

1. The existing Stage35/37 admission policy admits an actual source-positive historical Rhea liquidation candidate, without assigning any real wallet authority.
2. The runner verifies Rhea account/oracle code hashes, configuration, borrower positions and asset registry at the **exact same archived source block**. It requires a source-observed FT balance in the lender's actual repayment-token vault and sufficient reference capacity (Stage50).
3. Code and bounded paged state of Rhea lending, aggregate Pyth, legacy oracle, repayment token, seized token, and the real **`wrap.near`** contract are cloned into disposable local NEAR Workspaces Sandbox.
4. **Stage51 price-parity gate** requires the locally imported active Pyth feed, configured token metadata and supported token-derived price ratios to exactly match the pinned source views. A missing price view or divergence blocks *before collateral funding*.
5. A disposable Sandbox actor is created with 3 *local* NEAR and registered with lending and both token contracts, paying their actual bounded minimum Sandbox storage deposits.
6. The actor uses the genuine cloned `wrap.near.near_deposit` to wrap exactly 1 local NEAR, and `wrap.near.ft_transfer_call` with Rhea's `OnlyIncreaseCollateral` deposit message to provide the cloned lender with collateral. The code checks the real Sandbox transaction and callback outcomes, the received FT balance and actual lender collateral position. It does **not** directly patch the actor's collateral, lend shares or FT balances.
7. Independently inspect actual Sandbox actor positions and reference lending pool headroom, refusing disabled repay borrowing, nonexistent collateral or insufficient indicative liquidity. Only then may the Rhea `execute_with_pyth` Borrow → Liquidate → Withdraw call be **attempted locally**, subject to Stage41 debt and token delta checks and Stage48 later-finalized persistence.

The runner saves `stage52-sandbox-collateral-and-borrow-preflight.json` and preserves all Stage37, Stage41, Stage46, Stage49, Stage50 and Stage51 artifacts in the four actual conditional Sandbox GitHub workflows. The explicit `STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING=true` env gate is required in addition to the existing Sandbox-only and mainnet-disabled guards.

## Hard limits and execution proof

A single local NEAR of collateral is **not** proof that a chosen Rhea loan can be borrowed; full risk and share math remain unverified until the actual callback. It is also not a mainnet capital transfer. The archived borrower still needs a real Stage35 positive source reference, which has not yet been observed in this conversation. The work does not demonstrate full cryptographic storage trie parity, actual successful `execute_with_pyth` final settlement, executable swap/repayment, wallet approval, or verified net profit.

No mainnet signing, real-money spending, token minting or fake success receipts are introduced. A passing test suite validates the local runner gates; it is **not** evidence that a successful Rhea liquidation has occurred.
