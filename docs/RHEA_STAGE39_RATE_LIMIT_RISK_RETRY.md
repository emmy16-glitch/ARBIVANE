# Stage 39 — Retry actual rate-limited Rhea borrower candidates before isolated liquidation replay

Stage 30 fully indexed 72,782 Rhea mainnet accounts and 7,801 borrowers with debt. Stage 38 examined debt finding indices 332–651 and recorded four reference-paper-risk borrowers. **All four failed fresh source sizing due to HTTP throttling or network timeouts**, not because their current liquidation rules were proven invalid:

- `sehir.near` at finding 415
- `reffer.near` at finding 427
- `nodeasy.near` at finding 575
- `colibri.near` at finding 587

The Stage 38 live run is [40136172144](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40136172144), and the original complete market scan is [40128285853](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40128285853).

Stage 39 automatically starts a one-job **serial** retry after merging its workflow. It downloads the *actual* Stage 30 verified index and all four Stage 38 shards; reconciles prior risk status, IDs, cursor coverage, source code hash, prior HTTP-failure reasons and no-mainnet permissions; and retries ONLY borrowers that were paper-at-risk but blocked in Stage 38 due to RPC timeout or rate limit. No hand-entered borrower identifiers are used in the runner.

Each borrower receives up to three separate new finalized-block valuation/size attempts, with bounded retry delay respecting the NEAR provider's Retry-After; no retry is made for stale quotes, missing metadata, cross-block mismatch, faulty contract math, forged source or other non-network reasons. It processes accounts serially to avoid compounding provider pressure. Every attempt uses Stage 38 active Pyth and Stage 35 full source-reference sizing, with only read-only mainnet RPC.

If and only if a **valid positive source-reference** Stage 35 plan passes the observed Stage 37 action shape gate, the workflow installs near-workspaces and attempts the three-action `Borrow → Liquidate → Withdraw` transaction against **local NEAR Sandbox** imported contract storage. It records all final receipts and callback failures. This is an isolated sandbox mutation, never mainnet. Import can fail; if so the workflow reports the blocker rather than a fictional profit.

No mainnet wallet, signing key, capital, transaction broadcasts, funded swaps or realized profit exist in this stage. Before a real-money mainnet operation, ARBIVANE must prove the deployed source-to-Wasm branch, actual atomic balances and storage effects, successful final callbacks, financing, slippage/gas/profit and explicit owner-specified spending and loss limits. **Never execute a mainnet liquidation solely because a position is below 100% reference health.**

Run `npm run check` and inspect [Stage 39 Actions](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage39-risk-retry-to-sandbox.yml) and its preserved JSON evidence. No PDF.
