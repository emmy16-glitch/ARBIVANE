# Stage 49 — actual Rhea asset permission preflight and disposable Sandbox account registration

## What this stage resolves

A real historical `execute_with_pyth` liquidation witness (Stage36) called `Borrow → Liquidate → Withdraw`, but the Pyth callback rejected it because the borrowed asset was not permitted. Additionally, the Stage37/48 real Sandbox runner previously created a fresh liquidator account but did **not** register it with Rhea lending or the relevant NEP-141 token contracts before attempting to borrow or receive seized collateral. Those are concrete, separate blockers from state import or callback finality.

Stage49 implements two independent prerequisites in the *existing real Rhea Workspaces executor*.

### 1. Current Rhea permissions, one authentic pinned block

After the existing Stage35-positive admission gate (no dummy account accepted), the runner reads the real lending deployed code hash, oracle code hash, configuration, borrower and `get_assets_paged` **at the proposal's exact source block**.

`inspectStage49RheaAssets` validates the token identities and rejects:

- Unknown, duplicate or malformed asset entries
- A repay asset whose active lending `config.can_borrow` is not exactly `true`
- A seized collateral asset whose active `config.can_withdraw` is not exactly `true`
- Zero or nonpositive `supplied.balance - borrowed.balance` for the repay asset, or malformed internal quantities
- Any cross-block evidence, altered execution authorization or inconsistent three-action route

The observed pool difference is an **indicative supply accounting value only**. It does not prove executable wallet liquidity, current reserves, lending share rounding, internal-to-NEP141 atomic conversion, or economic profitability. No proceeds or executable financing are claimed.

The preflight is performed **before** the costly archival clone and its result is saved to `stage49-sandbox-route-preflight.json`. After cloning, the runner independently confirms the cloned Rhea `get_assets_paged` matches the same pinned source.

### 2. Bounded NEP-145 storage registration, isolated NEAR Sandbox only

The runner creates a disposable local `arbivane-replay` account with **3 test NEAR** (Sandbox-native currency, not the operator's real funds). It registers the exact three required contracts: Rhea lending, repay NEP141 token, collateral NEP141 token.

For each, the runner calls `storage_balance_bounds` and `storage_balance_of` inside Sandbox, checks the contract's actual minimum and any pre-existing registration, and only then calls **local** `storage_deposit({account_id,registration_only:true})` with at most **0.1 test NEAR per contract**, **0.3 test NEAR total**. The full budget is checked before the first transaction. It requires an actual successful Sandbox receipt and independent post-call `storage_balance_of` visibility. Missing storage APIs, unbounded fees, failed callbacks, missing storage and mismatched contract identities **block** replay. Re-registrations do not repeat deposits.

Only after those checks pass does the runner take the initial actor/FT balance snapshots and invoke the existing real Rhea `execute_with_pyth` sequence. Existing Stage41 borrower debt/collateral/FT balance checks and Stage48 later-finalized persistence are unchanged.

Evidence is uploaded as `stage49-sandbox-registration.json` along with Stage37/41/46 artifacts. All data and registrations occur in a disposable local NEAR Sandbox. The public NEAR archival RPC is **read-only**.

## Boundaries

Stage49 removes two concrete execution prerequisites. It does not prove that Rhea will allow the actor to borrow without supplied collateral; whether the borrowed obligation is fully retired is checked only after the transaction by Stage41. Pool accounting is not spendable financing. `NEP-145` registration is not minting, buying or funding real FT inventory. Source-derived liquidation action units, Pyth callback parity, full cryptographic trie-state parity, swap/repayment economics, gas costs, competition and realized net profit remain unproven.

**No mainnet signer, private key or transaction broadcast. No genuine borrower automatically qualifies.** The known Stage35 run `40131111995` still correctly blocks due to no positive compliant source scenario. Do not count a passing unit test as a live liquidation.

Protocol references: [NEP-145 Storage Management](https://github.com/near/NEPs/blob/master/neps/nep-0145.md) and [Rhea lending asset configuration](https://pkg.go.dev/github.com/rhea-finance/lending-sdk-golang/common/lending). Run `npm run check`, then inspect any actual Stage42 and Stage37 Sandbox artifact to determine whether a real callback was attempted.
