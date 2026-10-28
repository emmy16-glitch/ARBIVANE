# ARBIVANE operations dashboard

## Status

The dashboard is an authenticated operations surface around the existing Rhea engine. It never fabricates balances, transactions, opportunities, or P&L. Unknown values render as an em dash and unsupported actions report `Not configured` or `Unavailable`.

| Capability | Sandbox | Testnet | Mainnet |
| --- | --- | --- | --- |
| Durable, isolated state/event history | Yes | Yes | Yes |
| SSE replay after refresh/reconnect | Yes | Yes | Yes |
| Live RPC readiness | Local runner prerequisites | Chain-ID and finalized-height status | Read-only chain-ID and finalized-height status |
| Start automation | Genuine Workspaces runner, when evidence and RPC are configured | Unavailable pending a supported adapter and test wallet | Disabled server-side |
| Wallet transfers | Not exposed | Not configured | Not exposed |
| Signing/spending | Disposable local Sandbox actor only | Not configured | Disabled |
| Financial credit | Unsold token inventory only after four independent evidence gates | Not configured | Not configured |

The verified historical Stage93 Sandbox evidence documented in [STATUS_AND_EVIDENCE.md](STATUS_AND_EVIDENCE.md) is not silently imported as a current wallet balance or current-session profit. A completed dashboard-run Sandbox session is admitted only when Stage37 callback evidence, Stage41 debt/collateral/FT deltas, the terminal Stage55 phase witness, the original FINAL transaction, and the source proposal all agree. The importer hashes this bundle, deduplicates by transaction ID, and records the final token inventory as non-transferable outside Sandbox.

Unsold token inventory is never converted into USD or P&L. Gross proceeds, financing fees, gas, swap costs, and cumulative net P&L remain empty until a future settlement route supplies independently verifiable same-denomination evidence for every field.

**Stage173 streaming UX:** [Incremental event updates](STAGE173_DASHBOARD_EVENT_STREAM.md) deliver actual events immediately, merge authenticated replay without duplicate rows, throttle full backend refresh, discard obsolete responses after network-mode switches, and distinguish reconnection from confirmed live streaming. Recent client history is intentionally capped; old events remain in the backend store.\n\n## Hosted deployment

The repository includes a [Render Blueprint and deployment runbook](RENDER_DEPLOYMENT.md). A paid service, persistent disk, and private access token require workspace confirmation before applying the Blueprint. Configuration in Git is not proof of hosting; verify the actual Render deploy and secure /api/health separately.

**Stage175 detailed routes:** The Live Operations page now subscribes to genuine SSE events rather than displaying a frozen initial snapshot. Opportunities show compact source-status cards with expandable original evidence; Wallet and Settings show actual asset identifiers, atomic balances and readiness capabilities without dumping raw JSON across the screen. Unsupported execution and transfers remain disabled.

## Running locally

Use two terminals:

```bash
npm run dev:api
npm run dev
```

The API binds to `127.0.0.1:8787` by default. With no `ARBIVANE_DASHBOARD_TOKEN`, session creation is accepted only from loopback. For a shared deployment, set a strong token, set `ARBIVANE_DASHBOARD_ORIGIN` to the exact HTTPS dashboard origin, and place the service behind TLS. Production assets are built with `npm run build:dashboard` and served by the API process. State defaults to `.arbivane-dashboard/{sandbox,testnet,mainnet}`; set `ARBIVANE_DASHBOARD_DATA_DIR` for a persistent volume.

## Genuine Sandbox execution

Start is fail-closed until `ARBIVANE_SANDBOX_EVIDENCE_PATH`, `NEAR_RPC_URL`, `near-workspaces`, and the existing Sandbox runtime are configured. The server launches only `scripts/stage37-workspaces-sandbox-replay.mjs` with `EXECUTION_ENABLED=false`, clears mainnet account/private-key variables, and forces `NEAR_WORKSPACES_NETWORK=sandbox`. Browser input cannot select an executable.

Pause and Stop do not kill an in-flight financial operation. They record a durable request and prevent follow-up work; the current Sandbox process is allowed to settle. Resume is admitted only after the prior process reaches `paused`.

## API trust boundary

- `POST /api/auth/session` creates an HttpOnly, SameSite session after token validation (or loopback-only local admission).
- `GET /api/environments/:environment` reads only that environment's state and recent events.
- The same response includes current readiness. Public-network RPC status is accepted only over credential-free HTTPS when the returned chain ID and block-height schema match the selected environment. Provider errors are reduced to bounded codes.
- `GET /api/environments/:environment/events` uses SSE with `Last-Event-ID`, monotonic ordering, keep-alive, and client deduplication.
- Command routes are same-origin checked and session-state guarded.
- No route accepts a private key, mnemonic, arbitrary executable, mainnet transaction, or claimed P&L.

## Implementation checklist

- [x] Responsive dashboard shell matching the supplied desktop reference.
- [x] Working navigation, environments, financing validation, operation filters, and diagnostics drawer.
- [x] Environment-backed Live Ops, Opportunities, Performance, Wallet, Transactions, Analytics, and Settings pages with real search filtering.
- [x] Production access-token prompt; tokens stay in session storage and are exchanged for HttpOnly same-site sessions.
- [x] Durable environment state and append-only events.
- [x] Authenticated commands and replayable SSE.
- [x] Existing genuine Sandbox runner adapter with mainnet-signing denial.
- [x] Live Sandbox prerequisite, Testnet RPC, and Mainnet read-only readiness checks.
- [x] Fail-closed evidence importer for original receipt identity, source block, callback, balance deltas, actor debt, and unsold token inventory.
- [ ] Sale/settlement importer for realized proceeds, financing fees, gas, swap costs, and net P&L.
- [ ] Supported Testnet wallet/transfer adapter.
- [ ] Deposit/withdrawal custody adapters with authorization and audit trails.
- [ ] Mainnet readiness adapter; execution remains disabled.
- [x] Chromium interaction and responsive QA at 1280×720, 820×900, and 390×844 with no console errors or horizontal overflow.

## Validation

The production server integration suite checks loopback/token authentication, HttpOnly SameSite cookies, same-origin mutation rejection, isolated initial state, missing Sandbox configuration rejection, unconditional Mainnet execution denial, CSP, and MIME hardening. The production dependency graph reports zero known `npm audit` vulnerabilities. The client bundle is approximately 94 KiB gzip; no sample financial data or external font/runtime requests are shipped.
