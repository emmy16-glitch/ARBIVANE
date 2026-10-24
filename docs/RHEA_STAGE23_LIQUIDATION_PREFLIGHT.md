# Stage 23: deployed NEAR liquidation identity and four-rule source simulation

This stage is a deliberately **read-only** preparation for actual liquidation execution. It checks the live finalized NEAR lending contract account and oracle code hashes, then rechecks the code identities, asset pool registry, account count, and lending configuration at the same exact NEAR finalized block. A stale / cross-block / changed-code result fails closed. The output distinguishes `DEPLOYED_IDENTITY_OBSERVED` from **source/Wasm executable parity**. Neither contract hash observation nor static contract configuration proves execution rules.

The archived [NearDeFi/burrowland](https://github.com/NearDeFi/burrowland) upstream code/doc describes four liquidation checks (initial below 100%, collateral discount bound, final below 100%, final health improving). By contrast the public [Rhea lending liquidation guide](https://guide.rhea.finance/near-chain-guides/lending-and-borrowing/how-lending-and-borrowing-works/liquidations) lists three checks. The source repo was archived in 2023; source-math reproduction is NOT a build reproducibly matched to current `contract.main.burrow.near` Wasm, and docs do NOT override current deployed contract logic.

`simulateArchivedLiquidationRules` applies the four archived-source rules to user-supplied exact E27 hypothetical before/after amounts. Its documented 3,500/4,000 to 2,968/3,000 reference example is synthetic and is NOT any discovered real borrower. The calculation is only an offline source reference: **not** a NEAR transaction simulation, not a dry-run of state-mutating execution, and not profit after fees. No method name or encoded action is generated that could cause liquidation. Real-money execution remains disabled.

Remaining gates: independently match the deployed contract Wasm to a reproducible audited source, attest the exact live liquidation action/branches, run an actual non-mutating transaction simulator or isolated fork replay, check oracle and slippage parity, verify access keys / funding / transaction costs and an independent release. None is satisfied here.

Run `EXECUTION_ENABLED=false NEAR_NETWORK=mainnet NEAR_RPC_URL=https://rpc.mainnet.fastnear.com RHEA_LENDING_CONTRACT=contract.main.burrow.near RHEA_ORACLE_CONTRACT=aggregate-oracle.near npm run probe:rhea:liquidation-preflight`.

No PDF.
