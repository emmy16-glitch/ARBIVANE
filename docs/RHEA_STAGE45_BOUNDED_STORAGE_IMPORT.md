# Stage 45 — bounded archival Rhea state reconstruction into isolated Sandbox

The verified Stage 44 Sandbox run executed a real local contract transaction, but its separate full-data Rhea import failed with `RPC_RESPONSE_OR_CONTRACT_STORAGE_TOO_LARGE`. NEAR Workspaces `importContract({withData:true})` issues one root `view_state` request for the complete contract. The archival provider does not return that oversized response.

Stage 45 addresses the **import mechanism**, not the economic feasibility of a liquidation.

## What it does

The Actions workflow `.github/workflows/rhea-stage45-bounded-state-import.yml` reads the real mainnet `contract.main.burrow.near` contract at **block 221433162**, verifies its deployed code hash and `get_config` on that exact block, and attempts archival `view_state` queries using **read-only** JSON RPC calls pinned to the same `block_id`. When the provider explicitly rejects an oversized prefix response, the scanner subdivides the prefix into 256 disjoint byte-prefix descendants. Every returned storage key is checked against its requested prefix; it rejects noncanonical base64, duplicate keys, inconsistent block hashes or heights, untrusted shapes and resource-budget exhaustion. It emits a deterministic keyed record-stream digest and an honest count of all successfully observed records.

After traversal, the worker starts a disposable local NEAR Workspaces Sandbox, imports only the *deployed Rhea contract code and account* (`withData:false`), and applies the observed, base64-encoded contract data records to the **local Sandbox account only** in bounded `patchStateRecords` batches. It then compares the patched contract's `get_config` result to the real pinned archival source.

Its output `stage45-rhea-paged-state-import.json` distinguishes a successful bounded traversal, successful patching, and a matching functional config view from complete deployed contract parity. The workflow saves an artifact regardless of whether the RPC operation succeeds or hits a budget/blocker.

## Important completeness limitation

**An oversized prefix split cannot recover or rule out a key whose byte sequence equals the split prefix itself.** If prefix P is too large and divided into P+00 through P+FF, an exact key P is not returned by any child query. The root prefix has the same issue for a possible empty key. Consequently, every split increments `unresolvedExactBoundaryPrefixCount`, and `completePrefixCoverage=false`. Even when the full recursive partition traversal and `get_config` comparison succeed, the result is labeled `SANDBOX_CONFIG_MATCH_WITH_SPLIT_PREFIX_GAPS`, **not** complete state attestation. A cryptographic trie-root proof and all required dependent oracle/NEP-141 contracts remain additional gates.

`SANDBOX_CONFIG_MATCH_WITH_ROOT_STORAGE_RESPONSE` is possible if the root response fits; this still does not provide an independently validated trie-root proof.

## Resource limits and failure behavior

Default budgets: 1,536 archival prefix requests, at most four bytes of prefix recursion, at most 180,000 records, at most 128 MiB of raw key/value bytes, 220 ms minimum gap between calls, and 32 KB local patch payloads. GitHub Actions has a 55-minute job timeout. When any limit or RPC problem is hit, the diagnostic saves `BLOCKED_IMPORT_OR_INCOMPLETE_PREFIX_COVERAGE`, the safely classified error, partial observed counts, and disabled-trading flags. Unknown RPC errors do **not** produce synthetic price or liquidation evidence.

Run automatically by merging the workflow into `main`, or manually with the query and depth budgets at [Stage 45 workflow](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage45-bounded-state-import.yml). Always inspect the JSON artifact before interpreting the run.

## Follow-on verification

Even if Rhea lending code, storage and config can be reconstructed in Sandbox, a credible Rhea liquidation replay still requires current borrower risk, real active Pyth quotes, the relevant oracle and FT storage, the exact `execute_with_pyth` ABI, callbacks, successful borrower/actor balance deltas, and complete native-unit settlement accounting. No mainnet wallet keys, signing, broadcast, real liquidation, financing, swap profit or withdrawal are enabled in Stage 45.

Stage 45's local-state patches are deliberately **not** a liquidation transaction. The full liquidation replay remains conditional on genuine eligible borrower evidence rather than a fabricated success path.
