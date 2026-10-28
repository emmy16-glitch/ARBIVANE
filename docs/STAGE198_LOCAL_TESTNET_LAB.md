# Stage198 — User-owned NEAR Testnet lab bootstrap

## Purpose and current limit

Stage197 deployed an independent lending contract and test oracle to NEAR Testnet, but the disposable operator signing key was cleared and the lending contract was never initialized. Their code hashes remain verifiable, but those accounts must **not** be counted as a functioning liquidation market. The shared Rhea Testnet oracle still returns null prices on several legacy assets.

Stage198 replaces the lost-key deployment workflow with an **explicit user-owned, local-keychain** bootstrap generator and independent read-only verification. No ARBIVANE dashboard/API endpoint accepts or exports private keys. No program in Stage198 sends a transaction.

This is a setup prerequisite, not the completion of on-chain liquidation execution.

## Tested source binaries

The generator pins upstream **NearDeFi/burrowland** commit:

- \`0dbfa1803bf26353ffbee2ffd4f494bab23b2756\`
- Lending \`res/burrowland.wasm\` SHA-256: \`6b8aa59bbc20f08e8c6ef68fc992278e124f4d9dd83b2ba7afce466da4659f55\`
- Test oracle \`res/test_oracle.wasm\` SHA-256: \`b775f0fade1d5b3197af2a5a81e9c9d951be268c8587f17d110dfa66a5ffd9e1\`

The optional local PowerShell setup downloads these binaries from that exact commit, checks hashes before signing, creates independent lending/oracle/borrower/liquidator subaccounts under a Testnet wallet the operator controls, deploys the test oracle, and deploys+initializes a new lending contract in one transaction. It uses the **NEAR CLI keychain on the operator's computer**.

The setup is **not autonomous**: it requires the user's locally available signing key, a Testnet owner wallet with a verified balance of at least 9 TNEAR, and an explicit \`DEPLOY-TESTNET\` approval typed into PowerShell. If any wallet, checksum or command fails, the script stops. A partially completed script should be reviewed before retrying: it deliberately does not reuse unknown existing subaccounts.

## Windows instructions

Requirements: Node.js 22 or newer, PowerShell, and [NEAR CLI](https://near.cli.rs/) (\`near-cli-rs\`) installed so that the \`near\` command is available.

**Important wallet control:** \`arbivane-test-c9812a7f.testnet\` was previously created for Testnet and observed holding 10 TNEAR, but its public account ID does not grant signing access. The operator must first import/restore its Testnet-only signing key to their **local OS keychain** if they still possess the original backup. Never paste a seed phrase or secret key into GitHub, Render, ARBIVANE, or ChatGPT. If the backup is unavailable, create a **fresh Testnet account you control** with NEAR CLI and fund it using legitimate Testnet resources; then use that account as the owner.

From the ARBIVANE repo root, generate the plan:

\`\`\`powershell
node scripts/testnet-lab/plan.mjs --owner arbivane-test-c9812a7f.testnet --out .\local-testnet-lab
\`\`\`

Inspect \`local-testnet-lab/manifest.json\` and \`local-testnet-lab/setup-testnet.ps1\` yourself. The signed setup is NOT run by the generator.

After reviewing the exact Testnet subaccount names, costs and pinned binaries, execute **locally**:

\`\`\`powershell
powershell -NoProfile -File .\local-testnet-lab\setup-testnet.ps1
\`\`\`

The setup asks for \`DEPLOY-TESTNET\` and uses NEAR CLI's local keychain for each real Testnet transaction. Funding allocations are 6.5 + 1.5 + 0.4 + 0.4 = 8.8 TNEAR before network fees, so a 10 TNEAR owner account is intended to retain a small fee buffer. Actual costs can vary.

Then independently verify from the repo root:

\`\`\`powershell
node scripts/testnet-lab/verify.mjs --manifest .\local-testnet-lab\manifest.json
\`\`\`

The verifier only performs read-only RPC calls to \`https://rpc.testnet.near.org\`, validates source chain, required accounts, exact compiled code hashes, \`get_config\` and asset index state. It reports one of: \`OWNER_ACCOUNT_NOT_FOUND\`, \`ACCOUNTS_NOT_CREATED\`, \`CONTRACT_NOT_DEPLOYED_OR_CODE_MISMATCH\`, \`LENDING_UNINITIALIZED\`, \`LENDING_CONFIG_UNAVAILABLE\`, \`CONFIG_MISMATCH\`, \`INITIALIZED_AWAITING_ASSETS\`, or \`ASSET_SETUP_NEEDS_VERIFICATION\`.

**Passing deployment/initialization verification is not proof of liquidation.** Stage198 always reports \`verifiedLiquidations:0\`, \`executionEnabled:false\`, and \`realizedPnl:null\`. All Mainnet execution remains disabled.

## What remains

After owner-controlled setup is independently verified, the remaining genuine liquidation path requires controlled NEP-141 tokens and storage registrations, funded lending reserves, separate lending and liquidation actors, borrowing from a healthy position, a deliberately unhealthy borrower produced only within the isolated Testnet oracle fixture, a bounded liquidation action, and a full final-chain receipt/asset-balance reconciliation. No such transaction has been submitted or verified as part of Stage198.

**Do not submit fabricated or third-party token prices to the shared \`contract.burrow.testnet\` market.** This independently owned lab is separate from Rhea's shared Testnet pool.

References: https://github.com/near/near-cli-rs/blob/main/docs/GUIDE.en.md and https://github.com/NearDeFi/burrowland .

