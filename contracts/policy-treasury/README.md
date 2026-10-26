# Proposed NEAR policy treasury — design only

This folder is **not a deployed smart contract**. It does not contain an audited or functioning Rust near-sdk treasury and cannot enforce any real NEAR account's spending limits. No ARBIVANE mainnet signer or wallet is connected.

## Why a treasury is proposed

ARBIVANE has already completed authentic Rhea liquidations in local NEAR Sandbox using a disposable actor. That actor has zero authority over owner funds. Stage138 can evaluate budgets and reject unsafe proposed opportunities, but a process holding an unrestricted NEAR Full Access key could ignore this policy and spend anyway. A future restricted executor needs a *real on-chain authority boundary* or equivalently enforceable key scope.

## Proposed controls

- Owner-controlled approved NEAR account, explicit payout destination and emergency pause.
- Allowlists of receivers, methods, token IDs and maximum attached deposits.
- Maximum per-trade capital, cumulative daily spend, maximum loss and minimum realized net-profit policy, expressed in verifiable asset units.
- Trusted authorized agent/attestation only if such a worker is later actually deployed.
- Expiring owner approvals, nonces and durable replay protection.
- In-flight transaction locks and callback reconciliation of partial or failed NEAR asynchronous receipts.
- Restricted treasury withdrawals, recoveries and on-chain owner revocation.
- No autonomous worker Full Access key capable of bypassing these controls.

## Before implementation

Prove that Rhea's real execute_with_pyth Borrow/Liquidate/Repay/Withdraw path and token storage registrations can originate from the proposed contract account with the proper loan/collateral ownership, permissions and attached NEAR. NEAR's asynchronous promises require careful accounting and callback failure handling. A policy cannot safely be added as an after-the-fact off-chain Allow switch.

The treasury should be tested on NEAR **testnet** first with unauthorized caller rejection, over-budget transactions, replay attempts, duplicate callback, paused execution, broken oracle/price and owner key revocation.

Do not deploy mainnet or fund this proposed contract based on this README. See [Wallet and mainnet](../../docs/WALLET_AND_MAINNET.md), [Security](../../docs/SECURITY.md), and [Roadmap](../../docs/ROADMAP.md).
