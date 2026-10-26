# ARBIVANE — hackathon evidence and submission checklist

**Internal project checklist, updated 26 October 2026.** Check event dates, eligibility, track and required deliverables against [the official NEAR hackathon site](https://nearhackathon.com/) before making submission claims. This file is not organizer-issued rules.

## What we can honestly demonstrate

- [x] Read-only source-block Rhea asset and borrower discovery, exact BigInt math and Pyth validation
- [x] Authenticated historical candidate and **actual signed local NEAR Sandbox** Borrow → Liquidate → Repay → Withdraw execution
- [x] Original canonical FINAL async callback receipts, borrower debt/collateral decrease, actor FT increase and zero actor debt
- [x] Independent NEAR TransactionV0 Borsh preimage, SHA-256 and Ed25519 proof for the local transaction
- [x] Reproducible GitHub Actions run and downloadable evidence records: [Stage93 #40320594342](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594342)
- [x] Documented technical architecture, risk model, current status and known safety limitations
- [ ] Independent validator-approved NEAR mainnet light-client head / full imported-state trie proof
- [ ] Verified current profitable **mainnet** liquidation, owner wallet transaction and capital accounting
- [ ] Realized net profit after swap, finance, gas, storage and risk costs
- [ ] Production-custody/policy contract deployment, owner authorization and audited mainnet signer
- [ ] Production demo/video and any required hackathon presentation or screenshots
- [ ] Submit accurate lead contact, team details, selected track, repository/demo and owner-controlled public payout address

## Demonstration sequence for reviewers

1. Read the [README](../README.md) for the project's purpose, current state and claims.
2. Inspect the [evidence ledger](STATUS_AND_EVIDENCE.md); open each cited GitHub Actions run rather than accepting screenshots.
3. Examine the Stage93 authentic artifact and verified artifact: signed transaction, canonical FINAL receipts, before/after borrower/actor and FT state.
4. Re-run **npm run check** and the read-only Stage135/136 historical audit.
5. Read [architecture](ARCHITECTURE.md), [operations](OPERATIONS.md) and [security](SECURITY.md) for environment requirements and limits.
6. Explicitly state what is **local Sandbox**, what is **read-only mainnet**, and what is still **not implemented**.

Do not claim current mainnet trading, realized profits, deployed Shade/TEE, NEAR AI decision authorization, Intents settlement, impossible-to-observe zero competitor activity or secured full custody. Rhea same-token Borrow is not an assumed EVM-style zero-capital flash loan.

## Submission readiness

A public repository, a clean demo and independently verifiable artifacts are important. The current project repository may require a visibility review before submitting it publicly; do not assume CI being accessible to collaborators means external judges can read it. Confirm hackathon intellectual-property and open-source requirements before changing visibility.

The [roadmap](ROADMAP.md) separates completed isolated execution from pending mainnet authorization.
