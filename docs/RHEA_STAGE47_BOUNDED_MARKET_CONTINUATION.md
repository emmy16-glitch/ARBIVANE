# Stage 47 — bounded real Rhea opportunity continuation

Stage 46 fixed the prior oversized full-state import code path, but a real Rhea liquidation has **not** been attested. Stage 47 advances *actual* NEAR mainnet read-only borrower screening, and preserves the strict Stage35/37 Sandbox-only execution gate.

## Start from the previously indexed borrowers

The immutable Stage30 historical mainnet snapshot (GitHub run `40128285853`) indexed 72,782 accounts and 7,801 with debt. Stage42's prior default screened debt-finding indices 972–1291. This stage starts at **1292** and uses the same 4 × 80 borrower sharded Stage32/38 pipeline:

- New finalized lending and Pyth reads; old account identities are only a candidate index.
- Source-reference repay/seize sizing only after an observed paper-at-risk result.
- An actual imported-contract `execute_with_pyth` **in local NEAR Sandbox only** for a qualified reference proposal; Stage46 now uses paginated storage clones instead of oversized full-state requests.
- Independently reconciled artifacts for all 320 historic findings. Incomplete RPC/oracle reads remain explicitly blocked, never healthy or eligible.
- Stage43 targeted retry and Stage44 refreshed sizing remain downstream of a successful Stage42 run on main.

## Bounded sequential run, not a blind daemon

Merging changes to the Stage42 workflow starts the first **1292–1611** window automatically. If reconciliation is complete and no source-positive plan needs review, GitHub's scoped token submits the immediately adjacent window through `workflow_dispatch`. At most **three more** windows are automatically dispatched: 1612–1931, 1932–2251, and 2252–2571.

The new `stage47-next-window.json` artifact records the precise predecessor cursor, validated end cursor, next cursor, source-plan count, blocked-read count and remaining auto-run budget. It refuses fabricated counters, unsafe signing flags, noncontiguous windows, incomplete shards and out-of-range requests. Failures do not trigger further dispatch.

A positive source-reference candidate **stops** the automatic chain for a real Sandbox receipt/settlement review; an exhausted budget or insufficient remaining accounts also stops it. A good source-reference plan is not proof of deployed Rhea liquidation eligibility, profitability or financing.

All historical windows are drawn from the *same* Stage30 snapshot; new current accounts created after the source block are not indexed and must eventually be covered by another full-market discovery refresh. Running 1,280 historical findings is NOT 1,280 currently priceable active borrowers and not full live market coverage.

## Operator controls

Workflow: [Stage42 verified Rhea borrower continuation](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage42-reconciled-continuation.yml).

A manual dispatch can select another non-overlapping base cursor and set `followups_remaining=0..3`; manually enter a cursor only after reviewing the previous completed artifact. For example, after the four planned windows complete successfully, the next cursor will be 2572. If a window fails, inspect its shard/blocked artifacts rather than skipping over it.

The GitHub Actions token is used solely for workflow dispatch and artifact retrieval. There are **no wallet secrets, mainnet signing calls, NEAR mainnet liquidation transactions or realized-profit claims**. The read-only scan can consume CI runtime and public RPC quota; the 4-window cap prevents infinite automatic scheduling.

## Honest proof boundary

A successful Stage47 run means **complete, reconciled visitation of one historical 320-finding window**. Only the independent Stage41 settlement artifact after a real Rhea Sandbox call can establish borrower debt/collateral reductions and received unsold NEP-141 tokens, and even that would not establish net trade profit. Mainnet trading stays disabled until independently verified risk, capital, pricing, execution and settlement controls exist.
