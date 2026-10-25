# Stage 50 — actual pinned FT reserve preflight before Rhea Sandbox liquidation

The Stage49 deployment path validates whether the repay asset can be borrowed, checks a coarse pool supplied-minus-borrowed balance, and registers a disposable local actor with lending and the two NEP-141 token contracts. It does **not** verify that the lending vault actually holds enough transferable repay tokens. A large pool balance alone is not proof of an available token reserve or usable actor funding.

## Implemented guard

Before cloning or mutating any Sandbox contract, `scripts/stage37-workspaces-sandbox-replay.mjs` now calls `readStage50PinnedRepayReserve`:

1. From the original pinned Rhea `get_assets_paged` it selects the verified repay token, pool supplied and borrowed balances and configured `extra_decimals`.
2. On **the same block** it queries the repayment FT contract's `ft_metadata` and `ft_balance_of({account_id:'contract.main.burrow.near'})` using a read-only public mainnet RPC. Both RPC responses must report the expected block height.
3. It declines to assert a raw FT conversion unless the FT's reported decimals and Rhea's extra decimals normalize to 24; it uses integer math and rounds up the amount needed.
4. It fails before Sandbox cloning if the candidate repay amount is greater than the observed lending pool capacity, greater than the observed token reserve, if loan borrowing is disabled, or if exact-unit arithmetic cannot be established from these public read APIs.
5. It saves `stage50-pinned-repay-reserve.json` and rechecks the cloned local NEP-141 lending-vault balance against the exact source FT balance after code/state import. It fails rather than treating an inaccurate clone as a valid execution environment.

The stage saves this report even though a positive balance is **not** sufficient to establish that a trader can borrow or that the real Rhea liquidation callback will succeed. It is deliberately source-only and cannot authorize a mainnet transfer.

## Accounting boundaries

A read-only liquidator preflight cannot establish an actor's real collateral or funding, tradability of seized collateral, exchange depth, private liquidity, fees, callback finality, competition, current mainnet eligibility, or profit. Pool and vault balances can change after a pinned block. The external public code hash pin and an exhausted provider storage cursor do not independently prove the deployed Wasm and storage trie.

Stage50 keeps these indicators false: `exactTokenConversionVerifiedAgainstDeployedWasm`, `actorCollateralAndFundingVerified`, `guaranteedExecutionLiquidity`, `liquidationEligibilityVerified`, `positiveNetProfitVerified`, `executionEnabled`, `maySignMainnet`, `mayBroadcastMainnet`.

The real remaining blockers are sourcing a current positive, verifiably permissible borrower and establishing funded solvent liquidation execution followed by a realized net-profit transfer. No synthetic borrower or counterfeit liquidation is introduced.

## Validation

Run `npm run check`. The new regression suite covers sufficient/insufficient FT reserves, mismatched Rhea pool capacity, disabled borrowing, precision mismatch, corrupt token balances, pinned-block drift, and actual runner integration.
