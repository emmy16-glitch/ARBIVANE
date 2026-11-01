# Stage199: user-owned NEAR Testnet onboarding and liquidation lab

This stage turns the earlier read-only Testnet inspector into a real, user-controlled
onboarding and verification flow. It does **not** ship a server-side signer, does
**not** use mainnet, and does **not** claim a liquidation that was never executed.

## What is implemented

- A deterministic lab specification (`scripts/testnet-lab/spec.mjs`) for an isolated
  owner account, lending contract, test oracle, borrower, liquidator, booster token,
  collateral token (`TCOLL`) and debt token (`TUSDC`).
- A plan generator (`scripts/testnet-lab/plan.mjs`) that writes Bash and PowerShell
  scripts plus `manifest.json`, `preflight.mjs` and a README. Scripts are write-once.
- A read-only verifier (`scripts/testnet-lab/verify.mjs`) that checks:
  - NEAR Testnet chain id and finality;
  - account existence and pinned code hashes;
  - lending config, assets, reserves, token metadata, storage and balances;
  - borrower and liquidator positions;
  - modeled health at the healthy and unhealthy test prices;
  - a final liquidation transaction's receiver, method, price data, message,
    asset IDs, amount bounds, logs and post-state;
  - an optional withdraw transaction.
- Browser wallet connection and owner-signed provisioning through NEAR Wallet
  Selector (`dashboard/web/src/near-wallet.ts`). Supported wallets: MyNear Wallet
  and Meteor. The server only returns unsigned intents; the wallet approves them.
- Stage199 dashboard sections (`dashboard/web/src/testnet-setup.tsx`): wallet,
  funding, lab deployment, test assets, modeled risk and liquidation receipts.
- Read-only backend endpoints:
  - `GET /api/public/testnet/lab/verify?owner=...&tx=...&withdraw=...`
  - `GET /api/public/testnet/lab/intents?owner=...&account=...`
  - `GET /api/public/testnet/token?contract=...&account=...`

## Pinned sources

Burrow source: `NearDeFi/burrowland` at
`0dbfa1803bf26353ffbee2ffd4f494bab23b2756`.

| Artifact | SHA256 | Code hash |
| --- | --- | --- |
| `burrowland.wasm` | `6b8aa59bbc20f08e8c6ef68fc992278e124f4d9dd83b2ba7afce466da4659f55` | `8EoF8mXSAYV3HTGyZkSJJJ65xPgzTuj9D442LAjXidXr` |
| `test_oracle.wasm` | `b775f0fade1d5b3197af2a5a81e9c9d951be268c8587f17d110dfa66a5ffd9e1` | `DM9vASPfsTAEWd72JSghTWFPx2vUuHTnojPZV33gp9Ke` |
| `fungible_token.wasm` | `4bc72fa1c23742d3e06bea47b424b6e2a3f962af606401828a5841c437f5bf65` | `66ojqJFVKGacHP6pBhwD5PqU3oMbevwuKmta6Xh3KcCC` |

The pinned test oracle is a pass-through oracle. It forwards `price_data` and `msg`
to the lending contract and does **not** store a price or expose a price view.
Prices in this lab are therefore labeled `TEST_PRICE_MODEL`, not on-chain market
data. The verifier proves the actual price arguments inside the approved
transaction; it cannot claim that a stored oracle price changed.

## Prerequisites

- Node.js 22 or newer.
- NEAR CLI (`near`), preferably near-cli-rs: <https://near.cli.rs/>.
- A NEAR Testnet account controlled by the user.
- Testnet NEAR from the official faucet: <https://near-faucet.io/>.
  Follow the browser instructions; there is no invented faucet API.
- A supported browser wallet:
  - MyNear Wallet: <https://testnet.mynearwallet.com/>
  - Meteor: <https://meteorwallet.app/>

Never put a private key, seed phrase or password into ARBIVANE, the generated
directory or a chat message. The generated scripts use the local NEAR CLI keychain.

## Generate a plan

Run from the repository root:

```bash
npm run lab:plan -- --owner yourname.testnet --out ./testnet-lab-yourname
```

This writes a new directory and refuses to overwrite it. Review `manifest.json`
and the scripts before running anything.

## Fund the owner

1. Open <https://near-faucet.io/> and request Testnet NEAR for the owner account.
2. Wait for finality.
3. Check the balance in the dashboard or with:

```bash
near account view-account-summary yourname.testnet network-config testnet
```

The owner needs at least 14 TNEAR for subaccounts, storage and fees.

## Deploy the isolated lab

```bash
cd testnet-lab-yourname
./setup-testnet.sh        # Windows: .\setup-testnet.ps1
```

Type `DEPLOY-TESTNET` when prompted. The script downloads the pinned WASM, verifies
SHA256 hashes, creates subaccounts, deploys the lending, oracle and token contracts,
initializes them, and registers storage.

## Provision the market

```bash
./setup-market.sh         # Windows: .\setup-market.ps1
```

Type `SETUP-MARKET`. The script adds the two market assets, funds the reserves,
mints test tokens, deposits borrower collateral, and creates the borrower debt at
the healthy test price.

## Run one bounded liquidation

```bash
./run-liquidation.sh      # Windows: .\run-liquidation.ps1
```

Type `LIQUIDATE-TESTNET`. The script:

1. deposits liquidator repayment tokens into lending;
2. calls the test oracle with the unhealthy test price and a single `Liquidate`
   action bounded by the scenario's repay/take limits;
3. withdraws the taken collateral from lending.

The script prints transaction hashes and writes `liquidation-tx.txt` and
`withdraw-tx.txt`. It does not claim success until the verifier checks finality,
arguments, logs and post-state.

## Verify

```bash
node scripts/testnet-lab/verify.mjs \
  --manifest ./testnet-lab-yourname/manifest.json \
  --tx <liquidation-tx-hash> \
  --withdraw-tx <withdraw-tx-hash>
```

In the dashboard Testnet workspace, enter the owner account, click **Inspect lab**,
then paste the same hashes into **Liquidation receipt** and click **Verify receipt**.
A hash alone is not proof. The receipt panel reports:

- readiness state;
- verified code, config, assets, reserves, metadata and storage;
- real token balances and positions;
- modeled healthy/unhealthy health;
- liquidation final status, arguments, bounds, event and withdraw status;
- modeled test notional, explicitly labeled as a test-price model.

## Owner wallet provisioning

When the connected wallet is the lab owner, the dashboard can prepare unsigned
owner transactions for missing assets, storage registration, minting and reserve
funding. The wallet must approve each transaction. The server never receives a
key and never broadcasts a transaction.

Borrower and liquidator actions still use the generated local scripts because the
dashboard must not custody their keys. The liquidation script is the only place
that sends the bounded liquidation.

## Honest status

The code and tests in this repository verify the implementation and the read-only
evidence model. This environment did **not** execute a real Testnet deployment or
liquidation because it has no user-owned owner key or funded account. A real
liquidation is reported as verified only after the user runs the scripts and the
verifier or dashboard checks a final transaction.
