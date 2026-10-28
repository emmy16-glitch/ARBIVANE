# Stage197 — Independent NEAR Testnet liquidation laboratory

## Verified deployments (28 October 2026)

Lending contract: lend.arbivane-fixture-66971fd6.testnet
Code hash: 8EoF8mXSAYV3HTGyZkSJJJ65xPgzTuj9D442LAjXidXr
Deployment transaction: HPERpUsrAjYU84q8vWXo6LRxhMvsUeZkuRxGxpm57Qpk
WASM SHA-256: 6b8aa59bbc20f08e8c6ef68fc992278e124f4d9dd83b2ba7afce466da4659f55

Test oracle: oracle.arbivane-fixture-66971fd6.testnet
Code hash: DM9vASPfsTAEWd72JSghTWFPx2vUuHTnojPZV33gp9Ke
Deployment transaction: HTpiKBFYwTSQT5VkyZovJnKaPS6DjA4WbCZSZBAFfAvX
WASM SHA-256: b775f0fade1d5b3197af2a5a81e9c9d951be268c8587f17d110dfa66a5ffd9e1

Code source: https://github.com/NearDeFi/burrowland

## What is verified and what is not

These are authentic NEAR Testnet account deployments. Neither contract is part of the shared Rhea Testnet lending deployment. Both code hashes were independently verified with RPC view_account. Lending RPC get_config returned: The contract is not initialized.

There is no initialized lending market, no funded test lending assets or borrowers, no verified liquidation eligibility, no completed liquidation, no final transaction receipt, and no realized profit.

The shared market contract.burrow.testnet remains broken for the observed debt assets because mock-priceoracle.testnet returns explicit null prices for required assets. The independent laboratory does not repair that shared market.

An attempted lending-contract initialization step was blocked by the execution environment's safety controls. The restriction was not bypassed. No secret key was written to GitHub or the live dashboard. The disposable lab operator key was generated in a temporary remote sandbox and is not a customer wallet connection or a durable production signer.

## Required remaining authorization and engineering

1. Establish a securely controlled operator key under user custody for this experimental Testnet-only deployment. Verify account and signer authorization without putting private keys in chat, the public frontend or GitHub.
2. Initialize the standalone lending contract with its correctly pinned test oracle and owner, then verify get_config directly on chain.
3. Deploy or register controlled test fungible tokens, establish lending reserves, and create two separate actors: lender/borrower and liquidator. Verify all token receipts and account storage.
4. Deposit collateral, borrow, and set an intentionally unhealthy position using the independent test oracle only; never manipulate the shared market's oracle.
5. Execute a bounded liquidation in the standalone test fixture with an authorized signer, verify every final NEAR receipt and actual token balance movement, and record no profit without settlement evidence.
6. Connect the proven execution adapter to a persistent backed-up automation service with safe spending limits. Render Free and a browser tab are not reliable always-on workers.

## Public readiness endpoint and dashboard

The fixed-purpose GET /api/public/testnet/lab returns the independently verified chain, account and code hashes, initialized status, expected oracle mapping and explicit execution-disabled status. It is read-only, rate limited, cached for 30 seconds, and never accepts arbitrary RPC methods, token identifiers, transactions or signing keys.

The Testnet dashboard displays this experimental laboratory separately from the broken shared Rhea market. Deployment transactions are linked to NEAR Testnet explorer and not misrepresented as liquidation executions.

All Mainnet spending remains disabled.

