# Stage 58 — exhaustive bounded live risk refresh before isolated Rhea execution

## The actual missed-candidate failure

The verified Stage42 borrower window contains **four shards of 80 historical debt findings**. Stage32 independently refreshes each position with active Pyth data, identifying a subset of borrower accounts that appear **paper at risk**. The Stage38 qualification stage previously configured `maxRiskCandidates:12` and categorically returned `BLOCKED_CANDIDATE_LIMIT` if 13–80 of an authentic shard's accounts appeared at risk. **None of those 13–80 accounts would be refreshed through Stage35 sizing, including any genuinely positive, executable source candidate**. The downstream Stage42 window reconciler properly rejected the incomplete cohort, preventing automatic continuation.

## Implemented

1. The CLI now permits **up to all 80** authentic at-risk accounts per independently bounded Stage32 shard. This is the exact underlying shard size; it is not an unlimited batch or an invented borrower list.
2. The core pipeline validates a caller-provided risk budget in `[1,80]`; a caller setting a smaller limit still **fails closed** if it cannot examine all risk findings. No silent truncation, no fabricated success.
3. Source evaluation concurrency stays **2**, with paced RPC reads and the existing retry limits. Source accounts are examined in authenticated Stage32 order; successes still go through independent Stage37 route gates.
4. Stage42 workflow now runs on changes to the qualification pipeline/CLI and enforces `refreshed == paperAtRiskFromPreviousScan`, `reviewed == 80`, `refreshed <= 80` and no `BLOCKED_CANDIDATE_LIMIT`. Its reconciler still attests each 320-borrower window, every account identity and restricted mainnet flags.
5. An authentic eligible source plan still triggers the existing Stage56 imported-state Workspaces Sandbox Rhea execution. Failures remain captured with Stage55 receipts and phase artifacts; zero eligible plans **means zero attempted liquidation transactions**, not fabricated proof.

## Evidence limitations

A historically debt-bearing account is not necessarily currently underwater. Source pricing and eligibility may legitimately reject every candidate; this release does not override pricing freshness, risk rules, can-borrow/can-withdraw permissions, vault reserves, Sandbox funding, actor health, callback finality or seized FT balance checks. Neither a passing test nor an unpriced historic borrower proves mainnet profit.

The original Stage35 run for `godlike.near` remained negative. The live Stage42 workflow is the route to *discover*, independently source-size and possibly execute an actual isolated Sandbox liquidation with authentic fresh evidence. Production wallet funding and mainnet signing remain disabled pending independent profitability proof and operator authorization.
