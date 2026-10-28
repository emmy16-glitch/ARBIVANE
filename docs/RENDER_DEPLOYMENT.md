# ARBIVANE — Free dashboard on Render

Service: https://dashboard.render.com/web/srv-dbgr39uc6qcc73ce5el0
Live URL: https://arbivane-terminal-free.onrender.com
Git repository: emmy16-glitch/ARBIVANE, main
Instance: Render Free, no paid disk or resource. Build uses npm ci && npm run build:dashboard, with NODE_VERSION=22.16.0 and NPM_CONFIG_INCLUDE=dev.

## First login
A private initial operator token was generated and provisioned in Render at service creation, not printed or stored in Git. To sign in, replace it with a new unique 32+ character secret under Render > arbivane-terminal-free > Environment > ARBIVANE_DASHBOARD_TOKEN. Save and deploy, then enter that same private value in the app login. Never send your credential in chat or commit it. Changing the token invalidates old sessions.

## Free plan limitations
Render Free spins down on inactivity and consumes shared workspace free-instance hours. Its filesystem is ephemeral: /tmp/arbivane-dashboard and all locally recorded sessions/events disappear on spin-down, restart or redeploy. This is a functional dashboard preview, **not** a durable financial ledger, custody service or production liquidation engine.
Authentic Sandbox execution requires source evidence and near-workspaces prerequisites that are NOT provisioned on this instance. The unsupported Automate, withdraw, Mainnet and funding controls must stay disabled or report not configured; no fake earnings or blockchain activity should appear.

## Validate
Confirm Render deploy status live, built React assets and running Node server. Check /api/health returns 200 and mainnetExecutionEnabled=false. Confirm anonymous API requests are rejected. Enter your private token after rotating it; verify all three environment screens, their honest empty states and reconnect indications. A successful build alone is not proof of wallet integration.

Render source: https://render.com/docs/free


## Stage188 — execution host safety and deployment

The existing Render Free instance remains a view-only operations dashboard. A push to GitHub main can auto-deploy the UI and server code, but it does not create a durable Sandbox worker. Keep ARBIVANE_SANDBOX_AUTOPILOT_ENABLED=false on Free. Render Free spins down on inactivity and loses locally written evidence on redeploy, restart or spin-down. A successful /api/health is only an HTTP-server health signal, not execution proof.

The opt-in paid execution host example lives in render-autopilot.example.yaml and Dockerfile.autopilot at the repository root. It is deliberately not the default render.yaml and cannot auto-upgrade the existing Free service. Apply it only after the account owner approves the separately billed compute and persistent storage. It installs the native C toolchain and near-workspaces@5.0.0, and supplies a dedicated /var/data disk. Runtime readiness checks the cgroup-aware memory limit, compiler presence, and that the dashboard data directory is actually under a separate mounted volume.

On the dedicated worker host only: provision a strong login token, verified HTTPS source RPC, independently current deployed lender and oracle code hashes, then set ARBIVANE_SANDBOX_AUTOPILOT_ENABLED=true. Keep EXECUTION_ENABLED=false, NEAR_WORKSPACES_NETWORK=sandbox, and all Mainnet keys absent.

A genuine Sandbox result requires a fresh viable borrower, a real NEAR Workspaces execution and final receipts independently reconciled to debt/collateral/token deltas. An HTTP 202 Start and borrower scan are not evidence of profitable settlement. Testnet faucet funding and Testnet transaction execution are separate future integrations.


## Deployment identity

The public GET /api/health endpoint returns a non-sensitive deploymentRevision (12 hex characters from Render's RENDER_GIT_COMMIT, or null outside Render). Compare it with the current GitHub main commit to verify which backend is actually live. HTTP server health does not imply Sandbox execution readiness. Exact readiness and the blockers are available only on the authenticated Sandbox environment API.


## Stage190 — Demo, Testnet and Mainnet operator modes

The operator UI intentionally exposes three modes: Demo, Testnet, and Mainnet. Demo is a local event-driven scenario engine: no chain RPC, wallet signing, flash loans or blockchain settlement. Only the top mode strip says Interactive simulation. Its generated borrower positions, execution stages, receipts, portfolio and P&L are fictional and isolated in the demo data namespace, never copied to Testnet or Mainnet. Enter a financing limit and press Start; the server sends ordered events over SSE and updates the UI through the session's existing snapshot reconciliation. Pause/Resume/Stop work for the simulated worker. A complete run processes four scenarios and ends cleanly. Advanced real-source screening controls are hidden from Demo; Testnet and Mainnet are future authentic integrations and explicitly remain non-executable.

The historical source-pinned Sandbox scripts remain in the repository for research, but are not part of the three-tab operator UI. On Render Free, local demo history remains subject to ephemeral storage, and an interrupted simulation never resumes unverified operations on boot. A success event in Demo must not be treated as real on-chain evidence or profit.


## Stage191 public Demo without operator credentials

The browser Demo now runs independently of the protected Render backend. The former Stage190 frontend called authenticated demo API routes, leaving the public Demo stuck in AUTH_REQUIRED with Start disabled.

The frontend routes Demo load, start, pause, resume, stop and events through a browser-only scenario engine. It never calls a network API or shares state with other visitors. The session, progress checkpoint and events are saved in browser-tab sessionStorage, allowing active simulations to recover after refresh. Storage-restricted browsers retain in-memory functionality. The same standalone Demo works in Render Free and the static UI preview. Testnet and Mainnet retain their existing protected backend boundary, and neither has transaction execution enabled. No wallet, real funds, or blockchain transaction is involved.


## Stage192 — Live NEAR Testnet lending discovery

The Testnet tab now performs strictly read-only discovery of actual deployed Rhea/Burrow lending borrower positions, independently of Demo. It queries https://rpc.testnet.near.org through a fixed-origin public read-only bridge. A verified Testnet status response and pinned deployed code hash confirm the contract.burrow.testnet contract (hash: 5r4GsfdDATmriAdT6ZteFpPjDNSfPn4NneETiNuckUc6 as observed October 28, 2026). The lending configuration identifies mock-priceoracle.testnet as its price oracle. Any contract code change fails closed.

Public safe endpoints: GET /api/public/testnet/health and GET /api/public/testnet/positions?from=N&limit=20. They are bounded, rate-limited, and never accept user supplied RPC URLs, contract methods, signing keys or transaction parameters.

Start Testnet Scan / Pause / Resume / Stop streams actual source height, scanned account count, and borrower debt/collateral atomic amounts; it stores its own cursor and history in the browser tab. Borrower debt is NOT evidence of liquidation eligibility. No USD earnings, fabricated transaction receipts, approved flash loan, wallet signing or profit is available on Testnet yet. The genuine liquidation execution path remains blocked until a compatible funded Testnet account, oracle-linked liquidation route, and independent receipt verification are implemented.

The Testnet UI links to https://wallet.testnet.near.org/ to create an account and https://near-faucet.io/ to obtain test funds when available. Users should never paste private keys or seed phrases into the application. Mainnet remains separately authenticated and execution disabled.
