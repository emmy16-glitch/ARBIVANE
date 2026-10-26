# Running and reviewing ARBIVANE

**Operator manual, 26 October 2026.** The default commands are offline or read-only. There is **no production mainnet execution mode**.

## 1. Install the project

Use Node.js **22.16+**, Git and a supported terminal (PowerShell on Windows, bash on Linux/macOS). Clone the repository and install only pinned development dependencies.

```bash
git clone https://github.com/emmy16-glitch/ARBIVANE.git
cd ARBIVANE
npm ci --ignore-scripts --no-audit --no-fund
node --version
npm run check
npm run demo
```

`npm run check` is `npm run typecheck && npm test`. The tests use Node's built-in test runner and TypeScript strip-types option. No wallet is necessary; no transaction is broadcast by the demo.

**Interpret results correctly:** Passing tests proves the covered code paths and fixtures, not that a borrower is liquidatable *today*, that current market depth is adequate or that a production transaction would make money.

## 2. Run a real-chain read-only probe

Verify your RPC service and the currently deployed Rhea accounts first. These documented IDs are the ones inspected in this repository's historical source-pinned evidence.

### Linux or macOS (bash)

```bash
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.near.org
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export EXECUTION_ENABLED=false
npm run probe:rhea
```

### Windows (PowerShell)

```powershell
$env:NEAR_NETWORK = "mainnet"
$env:NEAR_RPC_URL = "https://rpc.mainnet.near.org"
$env:RHEA_LENDING_CONTRACT = "contract.main.burrow.near"
$env:RHEA_ORACLE_CONTRACT = "aggregate-oracle.near"
$env:EXECUTION_ENABLED = "false"
npm run probe:rhea
```

The command reads public chain state. It is not a trader, does not request wallet access and should abort on mismatched data. Some RPC providers rate-limit or require a separate archival service; use a trusted alternative with the same block consistency guarantees instead of disabling verification.

### Useful package commands

| Command | Purpose | Network effect |
| --- | --- | --- |
| `npm run check` | Typecheck and tests | No chain transaction |
| `npm run demo` | Offline deterministic project example | No chain transaction |
| `npm run scan:readonly` | Read-only Rhea account discovery | Public `query`/views only |
| `npm run probe:rhea` | Contract/code-hash and method compatibility inspection | Public view calls |
| `npm run probe:rhea:metadata` | Lending configuration and token/Pyth metadata | Public views |
| `npm run probe:rhea:paged-position-index` | Resumable bounded bulk position review | Public views |
| `npm run probe:rhea:stage31-debt-queue` | Source/Pyth borrower risk batching | Read-only |
| `npm run probe:rhea:active-pyth-valuation` | Fresh quote validation with configured units | Read-only |
| `node scripts/stage137-proof-and-policy-cli.mjs proof input.json output.json` | Local Merkle-path consistency check | Offline |
| `node scripts/stage137-proof-and-policy-cli.mjs mainnet-policy-preview input.json output.json` | Mainnet budget/profit-policy dry run | Offline; never signs |

Run any additional `npm run probe:rhea:...` script only after reading its corresponding `docs/RHEA_STAGE*.md` notes. Some scripts need source-run evidence, explicit contract hashes or archival RPC settings; no common set of environment variables makes all historic stage CLIs immediately runnable.

## 3. How the full Sandbox run operates

The important workflow is [`rhea-stage93-borrower-settlement.yml`](../.github/workflows/rhea-stage93-borrower-settlement.yml). It uses carefully preserved source qualification from earlier scans, selects a real borrower index (historically 2579), checks its source-Pyth eligibility and then runs the imported local Sandbox execution.

This is not a plain `npm run` script. It uses GitHub Actions to obtain historical artifacts, construct the Workspaces environment, import the required contracts and state and preserve proof files at each phase. A local operator must independently satisfy all explicit Sandbox-only environment guards and source evidence, and should **not** improvise key or mainnet variables.

The major stages are:

```text
select candidate -> authenticate pinned data and Pyth prices
  -> import lending, oracle, wNEAR, LiNEAR state
  -> register/fund disposable Sandbox liquidator
  -> inspect Rhea borrower and actor before-state
  -> sign LOCAL Borrow/Liquidate/Repay/Withdraw
  -> recover original FINAL callbacks and transaction
  -> later finalized block and unmodified share/FT persistence
  -> calculate borrower, actor and token deltas
  -> reverify Ed25519/Borsh, original source plan and artifact hashes
  -> publish success only if ALL checks pass
```

The workflow serializes attempts. Do **not** dispatch duplicate expensive import jobs because one step appears slow. [Stage93 run #40320594342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594342) passed selection, candidate and verification; start there when auditing the pipeline.

## 4. Download and inspect real proof artifacts

Open a verified run in GitHub Actions and select its **Artifacts** section. Prefer `stage93-verified-rhea-sandbox-liquidation` for the approved summary and `stage93-authentic-borrower-2579` for complete source/raw transaction/snapshots.

Important files:

- `stage55-sandbox-phase-evidence.json`: terminal real execution phase.
- `stage37-sandbox-execution.json`: original `FINAL` and callback evaluation.
- `stage41-sandbox-balance-settlement.json`: actual token, borrower and actor differences.
- `stage129-finalized-transaction.json`: canonical original signed receipt set.
- `stage135-independent-proof.json`: cross-file hashes and recomputed balances.
- `stage136-borsh-preimage.json`: independently rebuilt transaction bytes and signature check.

The full inventory, exact milestone numbers and limitations are in [Status and evidence](STATUS_AND_EVIDENCE.md). Some artifact IDs expire after their GitHub retention period. A missing archive should be recorded as unavailable, **not** reconstructed synthetically.

## 5. Failure investigation

The project records structured machine-readable blockers instead of treating every error as a generic RPC issue.

| Symptom | Inspect first | Do not do |
| --- | --- | --- |
| `PRICE_STALE_OR_UNCERTAIN` or null Pyth quote | Pinned source block and `stage51-active-pyth-sandbox-parity.json`; historical clock | Replace authentic quote with a made-up price |
| Imported borrower missing/mismatched | Stage82/Stage88 clone witness and code hash | Invent state or downgrade a trie mismatch |
| Borrow or liquidation rejects | Source-sized action, share conversion, asset permission and actor collateral proof | Increase repayment beyond source-approved cap |
| Child callback failed | `stage129-finalized-transaction.json` receipt IDs and statuses | Count intermediate emitted events as settlement |
| Finality did not move | `stage134-finality-recovery.json` actual before/after local headers | Claim finality from requested target height |
| Shares/FT unexpectedly changed | Immediate and later account snapshots | Replace missing balances with zero |
| Actor still owes Rhea debt | `stage41-sandbox-balance-settlement.json`; self-`Repay` shares | Declare a profitable liquidation |
| Stage135/136 verifier fails | Original raw evidence, exact source route, Borsh reference block and hashes | Change signatures, supply alternative block hashes or skip verifier |
| GitHub CI is green but no settlement artifact | Stage93 verify job and proof artifact | Treat generic test success as chain success |

Historical failures and their fixes are documented in the evidence ledger, not erased. All mainnet signing, broadcast, wallet custody and production P&L remain disabled or absent.

## 6. Maintaining a safe workflow

Before merging a code change, run `npm run check` and verify a PR's exact GitHub check runs. Do not merge conflicting patches to the same Rhea replay logic without resolving them against current `main`.

Only modifications to watched paths automatically trigger Stage93. Changes to README or ordinary documents should not start expensive new liquidation replays. Preserve real failure witnesses before retrying.

For a live deployment, this manual is insufficient: see [Security](SECURITY.md) and [Wallet and mainnet](WALLET_AND_MAINNET.md). Neither wallet secrets nor production signer keys belong in this repository.
