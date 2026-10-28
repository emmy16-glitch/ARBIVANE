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
