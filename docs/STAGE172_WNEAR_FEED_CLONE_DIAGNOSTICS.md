# Stage172 — diagnose WNEAR Pyth clone mismatch and continue authentic large-source scan

## Original evidence, not an inferred profitable execution

Original Stage157 run [#40478396792](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40478396792), shard 0, artifact #12722194870, source block 221806672:
- Source-qualified `fukaih.near` for 59,641,842,460,156,907,838,294 lending-internal LiNEAR units.
- Exact source repayment USD-E27 was `378105424460410732931648642` (**$0.37810542446**), **not** a large USD liquidation.
- Original pinned Rhea/active-Pyth route parity, FT reserve and source/clone contract import completed. The local Sandbox WNEAR collateral was funded.
- Stage52 rejected `STAGE52_WRAPPED_PYTH_FEED_CLONE_MISMATCH` **before** any Rhea liquidation transaction. The original source and local oracle quote payloads were not preserved in the artifact, so the precise mismatch is not yet established. No real-money or successful large liquidation claim is justified.

## Changes

1. Stage52 compares all JSON quote fields with canonical object-key ordering. It no longer falsely rejects **identical** oracle output merely because a JSON object's property order differs. It still rejects any changed price, confidence, exponent, publication time or other quote value.
2. On original WNEAR source/clone feed checks, write `stage172-wnear-pyth-parity-diagnostics.json` with whether the source or clone quote was missing/expired, which public-value field differs, and exact safety flags. Original quote values, RPC endpoints, and credential material are not saved. This is not an oracle override. All inconsistent genuine quotes still fail closed; no price-age limits are relaxed.
3. Both Stage157 workflows rerun the Stage52 tests and archive diagnostic output from authentic Workspaces attempts.
4. The four-shard Stage157 source scanner no longer silently abandons the **other** borrower cohorts merely because the first source-qualified Sandbox replay honestly fails. It continues only after all four original shard source reports exist and prove no real local settlement witness. The search is still capped to four disjoint batches and retains all failed receipt artifacts. One genuine **verified local settlement** stops the search; a paper-positive proposal or a failed attempt does not.
5. No mainnet signer/spending, lender, external token swap, real-money gain, or actor funding economics is enabled. Strict source/clone parity and existing Rhea callback/zero-debt verifiers remain authoritative.

## Acceptance
- Adversarial tests: key reordering passes; real Pyth price or publication-time drift fails; altered oracle prices never grant larger borrowing.
- Validate workflow syntax and GitHub CI. Inspect the **next original Stage157 artifact**: distinguish local quote expiry from data drift, identify whether the bounded subsequent batch continues, and report the authentic Rhea stage/FINAL receipts.
- A failed Sandbox callback is an informative failure and **never** a profitable liquidation or verified wallet balance.
