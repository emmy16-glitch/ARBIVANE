# Stage 42 — Reconciled, bounded Rhea mainnet borrower continuation

The Stage40 workflow refreshes four separate 80-borrower windows but does not produce an independently reconciled aggregate. Stage42 advances to historical Stage30 debt-finding indices **972–1291** and adds a fail-closed verification job.

## Actual workflow

`.github/workflows/rhea-stage42-reconciled-continuation.yml` downloads the immutable verified Stage30 historical registry from run [40128285853](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40128285853), then processes 4 × 80 non-overlapping debt findings at two runners maximum, with paced read-only NEAR RPC requests.

Each shard uses the existing Stage32 active-Pyth repricer, then rechecks only genuine paper-risk findings with Stage38/35 reference source sizing. If and only if a live positive source scenario passes the exact sandbox plan gate, it attempts the pre-existing **NEAR Sandbox only** replay and preserves any actual Stage41 post-balance evidence. Zero approved scenarios means **zero attempted transactions**. A failed read or sandbox call is never called healthy, completed liquidation or profit.

After all shards finish, the Stage42 `reconcile` job requires four artifacts and checks complete historical account coverage, source block/code-hash/total identity, all cursor boundaries, every borrower and position ID, risk-only fresh sample identities, and risk/blocked counts. Missing, partial, duplicate, mismatched, or wallet-authorizing evidence fails reconciliation; no aggregate is produced.

A successful `stage42-reconciled-window.json` proves only a **bounded historical debt window was visited** and classified into current observations. Different borrowers may be checked at different finalized blocks. If blocked RPC or oracle reads exist, `WINDOW_RECONCILED_WITH_BLOCKED_READS` documents them rather than implying live health coverage.

## Still blocked for real-money mainnet execution

Source-reference spreads are not deployed-Rhea liquidation eligibility, and Sandbox collateral receipts are unsold inventory, **not net profit**. Deployed contract rule parity, exact actual FT units, wallet financing, complete state import, callback success, swap execution, gas/storage/slippage, profit settled in one asset, and explicit owner-defined wallet/risk authorization are still needed. This workflow has no mainnet signer or trading authority. All real-money execution flags remain false.

Tests: `npm run check`; workflow results: [Stage42 Actions](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage42-reconciled-continuation.yml).
