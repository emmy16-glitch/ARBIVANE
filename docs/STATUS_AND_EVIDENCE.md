## Verified test-money funding scale (26 October 2026)

- **Stage148:** successful end-to-end original genuine Sandbox Rhea liquidation and *separately funded* temporary partner repayment, zero partner debt. [Source run #40347017312](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40347017312).
- **Stage150:** approximately **10 full disposable LiNEAR** borrowed/withdrawn, transferred, source-sized liquidation, unused supply reclaimed, principal returned and partner Rhea debt zero. [Source run #40353279895](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40353279895).
- **Stage151:** approximately **100 full disposable LiNEAR** actually borrowed/transferred and liquidation executed, but partner Rhea loan remained **24,899,422,835,948 atomic LiNEAR** in debt after the returned principal. A larger loan did *not* enlarge the eligible historical borrower. [Failed source run #40354682373](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40354682373).
- **Stage152:** ultra-short **1,000× compressed historical local clock**; real 100 LiNEAR Rhea borrow/withdrawal logs succeeded, but FINAL callback attestation blocked at the funding stage. Do not call this a funded liquidation or repayment. [Failed run #40357920852](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40357920852).
- **Stage153:** [actual rerun #40361065214](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40361065214) **FAILED**: original Rhea events show the 100-LiNEAR borrow/withdrawal happened, but all four same-hash `FINAL` receipt queries returned `STAGE124_FINAL_RECEIPT_QUERY_FAILED`. No liquidator transfer/liquidation/repayment was verified in that rerun. [Stage154 source-receipt economics](STAGE154_ORIGINAL_FINANCING_ECONOMICS.md) separately measures the documented **100-token financing deficit** and blocks unsafe scaling.

All test funding is entirely local; **no external real lender, real mainnet capital or realized net economic profit** has been proven. Accelerating a historical local clock does not make mainnet settlement genuinely instantaneous or financially viable.

# Verified milestones and evidence

**As of 26 October 2026.** This is the authoritative, current execution ledger for ARBIVANE. The `NEXT_STEPS.md` file preserves engineering chronology, including unsuccessful intermediate runs.

## Funding-source correction

The archived genuine Stage93 #40317139342 `stage49-sandbox-funding.json` reports `wrappedNativeSandboxYocto=1000000000000000000000000`: the disposable local actor wrapped and deposited **1 NEAR of Sandbox capital** into Rhea. After that collateralized Borrow, liquidation and full debt repayment, the actor gained LiNEAR. This was **not a flash loan** and it was not executed with the owner's own funds. The Stage139 verifier now cross-checks this historical funding with source plan and actual settlement. Capital-free execution remains **unverified**. See [Stage139](STAGE139_FLASH_LIQUIDITY_FINANCING.md).

## Current stage

The project has passed complete Rhea liquidations in a **local NEAR Sandbox**, with real imported lending/token/oracle contracts, authentic signed transaction receipts and independently checked end-state balances. It is **not** a verified profitable mainnet trading system.

### Successful executions

| Execution | Outcome | Public run / evidence |
| --- | --- | --- |
| Stage93 #40315134156 | PASS: source selection, actual Rhea Sandbox candidate execution, final verification | [Actions run](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40315134156), evidence artifact `12646443058` |
| Stage93 #40317139342 | PASS: all three jobs; independent source, receipts and zero-actor-debt balance proofs | [Actions run](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40317139342), verified artifact `12647108895`, full signed/state artifact `12647761105` |
| Stage93 #40320594342 | PASS: selection, candidate and verification under Stage135/136 signed Borsh check | [Actions run](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594342), authentic artifact `12649380423`, verified artifact `12648883516` |

The historical block/position sampled is **borrower index 2579**. This was a source-authenticated candidate, not a fabricated “underwater” account. Subsequent runs may use distinct pinned source heights or different execution identifiers.

### Exact observed accounting: Stage93 #40317139342

| Measure | Independently observed result |
| --- | ---: |
| Borrower debt reduction | 1,858,489,628,732,367 internal lending units |
| Borrower collateral reduction | 1,861,021,454,676,401 internal lending units |
| Liquidator net token inventory received | 2,531,190,098,868 LiNEAR atomic units |
| Liquidator remaining borrowed balance | 0 |
| Canonical `FINAL` receipt outcomes | 12 successful, 0 failed |
| Successful Rhea async callback | 1 verified |
| Sold collateral / converted proceeds | **Not demonstrated** |
| Realized profit after execution, financing and gas | **Not demonstrated** |
| Owner's actual NEAR wallet balance change | **None; Sandbox only** |

**Amounts are not interchangeable.** Lending internal units include share/index conversions and are not the same unit as atomic LiNEAR held in the actor wallet. No dollar value or realized profit should be inferred merely by dividing by a token's decimal count without authenticated current prices and the complete actual settlement route.

### Cryptographic evidence

Stages 116, 124, 130, 135 and 136 preserve the original transaction identity, valid signed Ed25519 transaction hash, authentic `FINAL` callback chain, and post-execution lending/FT state. Stage136 independently builds NEAR legacy TransactionV0 Borsh bytes (654 bytes in the verified archived example), checks SHA-256 matches transaction `5RoWymuFi91VqRzCDAWkNCMa1bEFpeHDxWKYHfHfgeiu`, and verifies Ed25519 over that recomputed digest. Reference block height 86, hash `95pztv4K3C5BRdtQRi65qPG6G1zxMgc3YCQrpA4rrSzx`.

[Stage135/136 historical proof audit](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40320594331), artifact `12648129912`, passed and includes SHA-256 file fingerprints. These are proofs of the recorded local outcome's internal consistency and transaction authorship, **not** fully independent validator-certified canonical mainnet outcome inclusion.

Stage137 parses NEAR outcome and block Merkle paths and compares them with a **supplied** light-client-head root. The supplied head has not independently passed validator approval and epoch-boundary trust validation, so the module explicitly does **not** certify canonical mainnet inclusion. See [Stage137 note](STAGE137_OUTCOME_MERKLE_AND_MAINNET_POLICY.md).

## Why older runs failed, and what fixed them

| Blocker | Evidence-driven correction |
| --- | --- |
| Historical Pyth quote expired after import | Historical clock and temporal accrual parity; current pinned source/Pyth checks remain |
| Rhea borrow/collateral share or exact action rounding | Protocol-capped `max_amount` liquidation/withdraw semantics and full borrowed-share repayment |
| Standalone Borrow produced no external FT in actor wallet | Returned to genuine atomic Borrow → Liquidate → Repay → Withdraw inside one Rhea transaction |
| `EXECUTED` SDK response missing callback declarations | Recover canonical original `FINAL` receipt definitions with original signed identity |
| Large local finality advance changed displayed accrued balances | Compare authenticated shares, token IDs and FT balances; do not confuse accrued displays with changed ownership |
| Bounded local advance did not move finality | Preserve actual finality reads, use a known local Workspaces fallback and independently revalidate subsequent state |
| Stage135 step lacked `verified` shell variable | Transfer the selected original evidence into a stable path before the independent verifier runs |
| Signature was checked only against an existing hash | Independently Borsh-serialize the TransactionV0 preimage and verify its computed hash and signature |

Failed runs were **not** successful liquidations. The final successful runs are authoritative for those milestones; neither proves a future live trade will succeed.

## Where the proof files live

Download the verified artifacts through the GitHub Actions links, or locate each source file in the corresponding `stage93-authentic-borrower-2579` artifact.

| File | What it establishes |
| --- | --- |
| `stage38-positive-stage35-evidence.json` | Historical source-approved borrower, pinned block and repayment sizing |
| `stage116-raw-transaction.json`, `stage129-finalized-transaction.json` | Original signed transaction and canonical final receipt outcomes |
| `stage116-signed-transaction.json` | Signed identity, signature and raw receipt digest |
| `stage116-before-state.json` | Pre-execution borrower/actor/FT positions and local reference block |
| `stage131-immediate-finalized-state.json`, `stage116-after-state.json` | Immediate vs later-finalized ownership, debt and FT values |
| `stage134-finality-recovery.json` | Actual local finality advancement and fallback |
| `stage37-sandbox-execution.json` | Original callback and receipt reconciliation |
| `stage41-sandbox-balance-settlement.json` | Independent debt/collateral/FT delta calculation and zero actor debt |
| `stage55-sandbox-phase-evidence.json` | Overall success or blocked execution phase |
| `stage135-independent-proof.json`, `stage136-borsh-preimage.json` | Reverified signed source bundle and independently reconstructed transaction preimage |

GitHub Actions artifacts can expire; the repo records run/artifact IDs so missing archives can be reported accurately. An expired artifact must not be reconstructed from guesses.

## Not yet proven

No canonical **mainnet** liquidation or token transfer; no realized swap, gas-adjusted net profit or owner's wallet credit; no independent full imported source-state trie attestation; no externally trusted validator-approved NEAR light-client root; no audited on-chain custody policy; no production scheduler/outbox or autonomous trading authorization. The historical successful Sandbox run can be rerun, but live source state and liquidity will change.

Success here means *the protocol and the local end-state verification path have genuinely executed*. The remaining work is capital custody, live economics and authenticated canonical inclusion, not redoing already-verified basic liquidation actions.
