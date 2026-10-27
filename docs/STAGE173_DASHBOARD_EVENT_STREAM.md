# Stage173 — truthful live operations streaming and compact dashboard states

## Diagnosed interface problems
The previous client re-fetched all dashboard environment state and replaced
its entire 100-event window **for every** incoming SSE event. High-frequency
real contract logs caused redundant requests and unstable event ordering.
The sidebar advertised a permanent "Standby" engine and "API connected"
regardless of actual environment/session status.

## Correction
- Show each original backend event immediately, once, sorted by its monotonic
  event sequence, and never combine Sandbox/Testnet/Mainnet event buffers.
  Retain at most 500 recent events in client memory; the server persists the
  original history separately.
- On live logs, throttle full backend accounting/readiness refreshes to no more
  than one every ~900 ms. Merge replayed events into the existing queue instead
  of replacing it with the most recent HTTP window.
- Reject stale HTTP responses after an environment switch, clear old session
  data during a mode change, and close old EventSource connections and timers.
- Distinguish Streaming, Connecting, Reconnecting, Idle and History. Do not
  present static pipeline LEDs or an unverified "API connected" status as live.
- Wallet-transfer and unsupported Mainnet execution gates from Stage171 remain
  unchanged; all balances and P&L still require actual verified evidence.

## Proof limits
React build and Node regression verify callback wiring, event dedupe,
ordering, bounded rendering and no Mainnet mutation. Real browser disconnect,
reconnect, long-session scrolling and event-history pagination still require
a deployed integration test. The backend holds append-only logs but currently
returns only limited history windows; this work does not claim arbitrary-lossless
backlog replay after extremely long outages.
