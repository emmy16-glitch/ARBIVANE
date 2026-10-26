# Owner wallet and mainnet readiness

**Current status:** No personal NEAR account is connected to ARBIVANE. The successful `arbivane-replay.test.near` actor is **only** a disposable local Sandbox account. It cannot receive withdrawable mainnet profits or spend a user's wallet funds.

The project owner must control the eventual wallet. A GitHub connection, local Sandbox signer or project collaborator is **not** that wallet.

## 1. Create or choose your own NEAR wallet

Start at the [NEAR wallet ecosystem directory](https://wallet.near.org/). **Important:** `wallet.near.org` is now a wallet **directory**, not the old hosted NEAR wallet account interface. For a straightforward browser/extension NEAR wallet, [Meteor Wallet](https://wallet.meteorwallet.app/) is a supported option. Its [account-creation guide](https://help.meteorwallet.app/en/articles/2-how-to-create-your-free-named-wallet-in-60-seconds) explains the steps. Rhea's own [wallet setup guide](https://guide.rhea.finance/getting-started/near-account) also lists supported wallet options.

To set up an account:

1. Open the wallet provider by typing the URL yourself. Check the domain and avoid sponsored lookalike links or wallet recovery “support” messages.
2. Select **Create new wallet** or import an existing one directly inside the provider's trusted application. Choose a NEAR account ID, normally something like `yourchosenname.near`.
3. Set a strong local unlock method, enable the wallet's available authentication protections and back up recovery information **offline in private**.
4. Locate the account's **public NEAR address/account ID**. That is the only wallet identifier needed for future ARBIVANE configuration and read-only verification.
5. Before putting capital at risk, verify the account can receive ordinary NEAR funds and that it is on **NEAR mainnet** rather than testnet or an EVM network.

For larger balances, consider a hardware wallet; [Meteor's Ledger setup guide](https://help.meteorwallet.app/en/articles/33-create-a-near-wallet-with-meteor-using-ledger) documents one method. A hardware wallet can approve owner transactions while keeping the signing secret under the owner's control.

**Never share your seed phrase, mnemonic, recovery phrase, full-access private key, wallet file or unlock password with the bot, ChatGPT, Codex, GitHub, a teammate or a website promising wallet verification.** Do not add them to `.env`, a screenshot, a GitHub Actions secret or a browser form linked from a stranger.

## 2. Owner wallet versus an execution account

For future production design, consider separating:

- **Owner/treasury wallet:** controlled by you, ideally hardware-secured, used to authorize policy changes and withdraw funds.
- **Restricted execution account or contract:** a separate, narrowly funded NEAR account or on-chain vault allowed to execute only audited, policy-limited Rhea calls. It should never receive the unrestricted owner Full Access key.
- **Sandbox test account:** disposable `arbivane-replay.test.near` created by NEAR Workspaces, with no authority on NEAR mainnet.

A NEAR `FunctionCall` access key can restrict receiver/methods and allowances, but do **not** assume that it alone enforces a complete per-trade loss budget, daily capital ceiling or independent custody constraints. Those require transaction design, durable checks and potentially a genuinely controlling on-chain policy contract.

The current repository has no deployed treasury/escrow contract or mainnet signer. `contracts/policy-treasury/README.md` is a design note, not a deployed wallet.

## 3. Information needed from the owner

The next implementation requires **public information and explicit risk decisions**, not secret keys:

| Item | Why it matters | Current status |
| --- | --- | --- |
| Public NEAR mainnet account ID | Identify the rightful owner and future payout destination | Not provided |
| Separate funded execution account choice | Limit the amount the automated process can ever affect | Not chosen |
| Maximum NEAR equivalent **per trade** | Prevent oversized capital exposure | Not provided |
| Maximum NEAR equivalent **per day** | Bound repeated losses and cumulative spend | Not provided |
| Maximum acceptable loss per trade/day | Decide when to refuse or stop | Not provided |
| Minimum *realized net* profit per transaction | Avoid trades with positive paper spread but negative costs | Not provided |
| Manual approval for each transaction or limited automation | Determine signer privileges and consent | Not chosen |
| Network gas/FT liquidity, safe swap route and fresh oracle proof | Establish actual executable profitability | Not independently established |
| Owner-approved on-chain custody/signing plan | Ensure software cannot bypass the limits | Not implemented |

You do not have to provide a seed phrase, nor should you pre-fund anything to prepare project documentation.

## 4. What the code presently allows

`scripts/stage138-mainnet-spending-admission.mjs` is a fail-closed **policy preview**. It evaluates explicitly provided wallet identity, capital/loss limits, quote freshness, unit-compatible costs, live Rhea/oracle criteria and profitable-route claims. Importantly, it **always returns** `admissibleForActualMainnetBroadcast: false`, `maySignMainnet: false` and `mayBroadcastMainnet: false` because these claims are not trusted on-chain approvals, and a production signer/broadcaster does not exist.

The example invocation below is an input you prepare yourself, not a wallet connection:

```bash
node scripts/stage137-proof-and-policy-cli.mjs mainnet-policy-preview mainnet-policy.json review.json
```

Do not change `EXECUTION_ENABLED=false` or insert keys into GitHub Actions thinking that will enable safe production trading. No current ARBIVANE command moves owner assets.

## 5. What must pass before the first actual funded transaction

The production checklist is explicit:

- Independently confirm **current** Rhea contract code, Pyth feed/configuration, borrower health and repay/seize permissions immediately before submission.
- Prove external token liquidity, realistic swap fills, network and storage costs, financing, slippage, competitor/race risk and final *positive net* proceeds in a common unit.
- Run the exact intended transaction in a state-faithful environment, with source/current-code-hash parity, full callback finality and balance reconciliation.
- Complete a narrowly scoped signer/owner-approval integration, with reviewed key custody, contract/allowance restrictions, a tested pause/kill switch, daily cap and durable idempotency.
- Obtain your explicit approval for the specified transaction or separately reviewed bounded automation, never an open-ended mandate inferred from a wallet address.
- Start with a small owner-authorized test; only increase limits after reviewing observed gas, token deltas and loss controls.

**No real trading is enabled as of this document.** Even a passing local Sandbox liquidation and an authenticated transaction signature do not establish transferable cash profit. Wallet setup is a prerequisite for eventual deployment, not permission to spend.

## 6. Profit destination and verification

After a genuine authorized future liquidation, verify the destination account's balance increase on canonical NEAR mainnet, reconcile actual swaps and fees, and record the transaction hash. The bot should never call borrowed capital or unsold collateral “your profit.” Keep the owner wallet separate from executor operating funds, and document any withdrawal/refund route before allowing it.
