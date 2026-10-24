# Stage 25 — Real Rhea liquidation routing evidence and unsigned action preview

**Scope:** the shortest defensible step toward live liquidation, but still **no funding, signing, broadcast, or execution**.

## Primary implementation references
- Rhea lending guide: https://guide.rhea.finance/near-chain-guides/lending-and-borrowing/how-lending-and-borrowing-works/liquidations
- Public [Burrow liquidation bot](https://github.com/burrowHQ/burrowland-liquidation-bot/blob/main/src/libs/account.js): builds `Borrow`, `Liquidate`, `Withdraw` actions, wrapped in `Execute`, then sends the message to configured `priceoracle.near` via `oracle_call`.
- Rhea official SDK: https://github.com/rhea-finance/lending-sdk-golang (illustrates `execute` and `oracle_call` for other action classes).

Stage 24 exposed the actual **distinct** execution-oracle and aggregate-price-reader contracts. Stage 25 verifies the **deployed export surfaces** at a fresh finalized block: `execute` on the lending contract and `oracle_call` on the *configured* price oracle, not on the unrelated `aggregate-oracle.near` price reader. The live CI evidence is no stronger than this exported-method proof; it does not confirm on-chain liquidation branch logic or accepted argument schema.

`prepareReferenceLiquidationPreview(stage24, proposal, currentFinalizedHeight)` produces an **unsigned, nonauthorizing** shape from the archived bot for independent source review. Input must bind to a ≤10-block-old Stage 24 witness; match lending and configured oracle code hashes; supply bounded nonzero u128 token-atomic amounts, unique assets, borrower/liquidator identities, matching borrow and repay tokens and a ≤0.1% *reference-only* borrow buffer. A failed bound rejects the preview. These constraints are defensive validation, **not claims that the amount bounds are economically safe or that these actions will succeed**. No signer/gas/deposit fields are included in the preview.

**Critical unresolved work:** obtain current independently audited source or reverse-analyze deployed Wasm to confirm `Liquidate` and its current collateral/health/price branches; verify asset decimals, balance shares, current wallet supply/borrow capacity and token registrations; simulate the complete oracle-routed transaction against identical pinned state; obtain executable swap route and worst-case price-impact/fees; check net **realized** positive profit and potential losses; add isolated small-capital account, limits, independent review and explicit release approval. The archived example bot is *not* safely reusable as a live executor without those tests.

To run the live contract *route inspection* (no trade):
`EXECUTION_ENABLED=false NEAR_NETWORK=mainnet NEAR_RPC_URL=https://rpc.mainnet.fastnear.com RHEA_LENDING_CONTRACT=contract.main.burrow.near RHEA_ORACLE_CONTRACT=aggregate-oracle.near npm run probe:rhea:liquidation-route`

No PDF.
