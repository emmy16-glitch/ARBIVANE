# ARBIVANE — Render hosting and verification

The checked-in render.yaml defines one **paid** Node web service, a 1 GB persistent disk, HTTPS edge and a health check at /api/health. Committing a Blueprint does not create a service.

## Initial deployment
1. Confirm the Render workspace belongs to you before authorizing billed resources.
2. Open https://dashboard.render.com/blueprint/new?repo=https://github.com/emmy16-glitch/ARBIVANE and link the GitHub repository. Review paid plan and disk before Apply.
3. Enter a unique high-entropy ARBIVANE_DASHBOARD_TOKEN privately when Render prompts. Do not commit or share it in chat. Keep it in a password manager.
4. Verify the deployed service's **live** status, HTTPS domain and /api/health response (200, Mainnet execution false). Verify ARBIVANE_DASHBOARD_DATA_DIR points to /var/data/arbivane and the disk is attached.
5. Login using the operator token; afterwards the app uses an HttpOnly signed cookie, not a browser-stored bearer token.
6. Verify unauthenticated API access fails, and Testnet/Mainnet execution and wallet transfer remain unavailable.
7. Verify events survive a redeploy. The data disk protects recorded evidence, but attaching a disk disables zero-downtime deployments.
8. Authentic Sandbox execution requires separately configured archival NEAR_RPC_URL, near-workspaces runtime and original Stage35 evidence. The Render service does not automatically receive these. Do not pretend that Start Automate already performs continuous fresh market discovery.

## Security and behavior
- Production /api/health fails closed with HTTP 503 if operator authentication is absent.
- The checked-in config binds HOST=0.0.0.0 and uses Render's PORT. NODE_ENV is production; Mainnet spending stays disabled.
- Signed cookies expire after 12 hours. TLS-proxy requests get Secure cookies. API requires authenticated sessions and same-origin mutation checks.
- CI-gated auto deployments are configured. The paid single-instance disk-backed service is a temporary deployment architecture, not a distributed financial ledger.
- Expensive historical Pyth/Rhea cloning should eventually run in a separate background worker. A small web instance is not guaranteed to support a 20-minute Sandbox replay and thousands of archive state records.
- Realized P&L, withdrawable funds, genuine flash loans, and Mainnet signing remain unimplemented and must be presented as such.

## Verification
Run npm ci, npm run check, and (with the authenticated Render CLI) render blueprints validate render.yaml. Then monitor the actual Render deploy until live, inspect runtime logs, check /api/health, load the signed-in UI, and test streamed event recovery. CI alone does not prove hosting.

Applying the Blueprint incurs charges for the web service and persistent disk. Review Render's current prices before approving.
