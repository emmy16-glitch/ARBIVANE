# Stage 26 — Fresh, borrower-specific NEAR paper health and oracle blockers

Target: `tmp-owner.main.burrow.near`, whose recorded debt was reconfirmed in Stage 25 but whose Stage 22 paper health was historical.

Stage 26 retrieves a **new finalized block** and pins three deployed contract identities, lending config, asset pools, lending-owned Pyth feed mappings, and the target borrower's position detail to that block. All quotes come from `aggregate-oracle.near.get_price_no_older_than` for **direct Pyth** assets declared by the lending contract. A 60-second freshness, 2-second future-skew, and 150 basis point confidence policy is applied. Unsupported/default-priced/derivative assets are **blocked**, never valued using guessed mappings or a casual USD reference. Full share-balance and historical Burrow valuation parity are delegated to the existing `calculatePaperPositionHealth` implementation. Cross-block or changed-code evidence aborts.

A current undercollateralized **paper** position is not proven liquidatable, because the lending contract's execution-time price composition and liquidation code branches have not been attested to the actual deployed Wasm. A successful CI run can legitimately have `INCOMPLETE_PRICE_EVIDENCE`. Such a result identifies what Stage 27 must solve, rather than quietly reporting fake opportunities.

This stage **does not** execute, sign, simulate a state-mutating NEAR transaction, prove liquidator funds or calculate actual net realized profit. The real-money gate remains completely closed.

Run via `npm run probe:rhea:current-health` with `EXECUTION_ENABLED=false`, `NEAR_NETWORK=mainnet`, `NEAR_RPC_URL`, all three pinned code-hash environment variables and borrower account ID configured as shown in the CI workflow.
