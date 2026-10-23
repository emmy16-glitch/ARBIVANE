# Security posture and production blockers

## Current stage

**No live signing, no token custody, no liquidation execution, no Intents deposit.** `EXECUTION_ENABLED=false` is mandatory for the read-only CLI. RPC calls use `query` only. Every financial value is parsed as an exact decimal integer string; unknown/unsupported inputs abort or are rejected.

## Threat model

| Threat | Required mitigation before launch | Current status |
| --- | --- | --- |
| Stale indexed positions or oracle price | Protocol-equivalent revalidation at fresh final block | Only pinned raw reads exist |
| Compromised agent / manipulated AI output | On-chain executor custody, restrictive attested caller, owner pause | Not implemented |
| Replay and duplicated live order | Durable nonce/idempotency lock, callback guards, pending tracking | In-memory demo guard only |
| Secret exfiltration / phishing | No Full Access key in browser/TEE, keys scoped to receiver/method | No secrets are required yet |
| Failed async NEAR receipts | Promise/callback status, final balance/debt reconciliation | Not implemented |
| False profits from unsold collateral | Strict distinction between inventory and realized token balances | Pure rule implemented |
| Intents deposit loss/refund issues | Exact quote, token/chain/address validation, tiny-value test, refund state | Precondition validation only |
| Oracle manipulation / lending protocol exploits | Verify current Rhea deployments, oracle configuration and paused markets | Unverified |
| Hidden competitors | Unknown competition means unknown, not zero; conservative caps | Basic historical pressure logic |
| UI-to-backend authorization bypass | Server-side auth, on-chain owner checks, CSRF/origin controls | No API/UI yet |

## Mandatory gates before ANY real tokens

1. Verify the *current* Rhea lending and oracle contract IDs, protocol version, market status, and exact liquidation methods using official sources and live read-only inspection.
2. Validate share-to-atomic conversions, price decimals, volatility ratios, health/discount and repay/seize rounding against the deployed contract or verified exact fixtures.
3. Establish actual financing/collateral needs. No confirmed native Rhea flash loan was found during the initial research.
4. Design and test NEAR contract-controlled custody and callbacks. Do not use a separate unrestricted worker signing key.
5. Have contract and critical execution logic independently reviewed, including source and compiler dependencies.
6. Integrate a real TEE with attested immutable image, registration, bounded function-call key permissions and tested revocation.
7. Use durable DB transactions, outbox, idempotency, pending tx tracking, receipts and accounting reconciliation.
8. Implement failover RPC, circuit breakers, gas/daily loss limits, price freshness and pause, then adversarial integration tests.
9. Create a *separate* testnet contract demonstration and a very small, manually authorized NEAR Intents mainnet test. Intents has no public testnet deployment.
10. Require explicit owner opt-in and a maximum total loss budget; no autonomous mainnet mode by default.

## Disclosed dependency limitations

Upstream Shade Agent Framework documents an unaudited status. The archived old Morpho liquidation bot and legacy Rhea runtime must not be treated as secure drop-ins. The current codebase copies architectural ideas, not third-party executable source. All proposed extension interfaces require compatibility reviews at the exact version selected.

## Reporting issues

Do not post private keys, RPC credentials or real-account secret material in a GitHub issue. Use a minimal redacted reproduction. All test data in this stage are synthetic.
