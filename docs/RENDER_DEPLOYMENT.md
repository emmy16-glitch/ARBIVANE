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
