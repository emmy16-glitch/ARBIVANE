# ARBIVANE operator workflow contract

- **Identity:** Production requires a configured operator token. After authentication, the browser uses a signed, HttpOnly, same-site cookie; it does not persist the bearer secret in session/local storage. Invalid or expired sessions require a new login.
- **Modes:** Sandbox, Testnet and Mainnet are completely isolated: settings, events, transactions, available balances, network state and wallets never cross modes.
- **Start:** A valid positive USD ceiling and nonnegative source gross threshold are required. The server re-verifies source-sized repayment against the ceiling before local mutation. Only configured Sandbox may start. Testnet and Mainnet remain locked until actual funding/adapters and separate authorization exist.
- **Pause / Stop:** These prevent additional work, not cancellation of a financial transaction already in flight. UI communicates this distinction. Repeated starts are rejected.
- **Progress:** A persisted server event has a timestamp, sequence, status, environment and actual evidence. No log entry is synthesized. UI displays streaming/reconnecting truthfully, preserves original event order and supports expanding diagnostics.
- **Recovery:** Browser reload/reconnect uses the signed cookie and SSE cursor replay; long event histories are delivered in bounded forward batches. The browser shows recent entries and may request older entries from the server. Production history requires a persistent disk.
- **Accounting:** Unsold Sandbox collateral is explicitly not realized profit. No value is credited as net P&L until receipts and all financing/swap/gas costs are independently reconciled. Sandbox funds are not transferable to Testnet or Mainnet.
- **Withdrawals:** Disabled until environment-specific custody, destination ownership, settled available funds, atomic transfer authorization and idempotent reconciliation are implemented.
- **Errors:** Auth failure requests login; unavailable network surfaces clear status; rejected liquidations show their real source/clone mismatch; missing data never triggers decorative charts.
- **Accessibility:** All actions are keyboard operable, maintain clear focus state and tap targets, respond to reduced motion, and keep technical details available without color-only status.
