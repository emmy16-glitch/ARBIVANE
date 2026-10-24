# Stage 33 — validate paper-risk borrower and diagnose blocked Pyth reads

Stage 30 scanned all **72,782** Rhea accounts at one finalized block and found **7,801** debt accounts. Stage 31 reviewed 12 with only 6 fully priced. Stage 32 screened debt finding indices **12–331**; results were **1 reference-at-risk, 43 reference-healthy and 276 blocked**. The one reference-at-risk observation was `godlike.near` at health **8908 bps**. This is NOT a verified liquidation.

**Stage 33** starts automatically on merge and reruns read-only current active-Pyth valuation for the observed candidate plus 3 previously blocked findings from each of four Stage32 shards. It downloads the actual *successful* Stage30 and Stage32 Actions artifacts, validates each shard's original source identifiers, pinned block, complete cursor and unapproved authority flags, and rejects incomplete or forged source data. It never asks for a signer, executes a transaction or fabricates profitability.

Unlike Stage31's generic `BLOCKED_RPC` catch-all, Stage33 uses only a fixed allowlist of error classifications: rate limit or timeout, stale/uncertain oracle, missing feed or metadata, derived-token ratio, contract drift, invalid position arithmetic, or unclassified error. Raw RPC exception messages, URLs or secrets never appear in reports. Every row has `executionEligible:false`.

**Why prioritize diagnosis before increasing the sweep?** With 276 of 320 Stage32 rows blocked, expanding to the remaining 7,469 without knowing whether the problem is unsupported assets, stale quotes or RPC throttling would yield many uninterpretable results. The Stage33 report establishes the next engineering fix from actual live evidence.

CI command: `npm run check`. Automatic workflow: `.github/workflows/rhea-stage33-oracle-failure-diagnostics.yml`. It emits a JSON summary and a bounded evidence artifact.

**Limits:** even repeated sub-100% *reference* health does not prove current deployed liquidation eligibility or repay limits, Sandbox execution, swap realization or net profit. Mainnet signing remains disabled.
