# Stage 32 — coherent finalized-block active-Pyth borrower batches

Stage 30 supplies a complete, **historic** same-block borrower index. Stage 31 reprices a bounded set of its debt findings but previously let each account independently pick a fresh finalized block. Those outputs cannot safely be treated as a shared snapshot.

Stage 32 changes the read-only Stage 31 CLI to select **one current finalized lending height** per batch. It checks the lending code hash before initiating repricing, then passes the pinned height to each evaluation. The Stage 29 evaluator already passes its pinned height to lending configuration, account position, asset pools, lending-owned Pyth metadata, oracle quote and derivative ratio calls and rejects inconsistent code hashes or response heights.

The Stage 31 report now records `pricingBlockHeight`; any evaluator responding with a different height is classified as **blocked** with `CROSS_BLOCK_REPRICE` and is not counted as paper-healthy or paper-at-risk. The workflow validates that unblocked items refer to the batch pin and records it in the job summary.

## Guarantees and limits

- A successful batch has coherent **read-only data at one finalized block**; the old complete-index source block may differ.
- A batch is limited to at most 12 findings in the existing workflow. It does **not** re-index all borrowers or prove the whole debt market was repriced.
- Even a paper-at-risk result is not established liquidation eligibility. Deployed liquidation contract rules, replay, funding, swap liquidity, current competition, gas and realized profit remain unverified.
- There is still no signing, wallet, transaction broadcast or real-money execution.
- Failed or cross-block accounts are marked blocked and must be retried, never silently counted as completed screening.

## Verification

```bash
npm run check
```

New regression tests cover same-block acceptance, cross-block rejection, invalid height and the explicit unpinned legacy report. The Stage 31 GitHub Actions workflow runs the updated code and validates the persisted artifact's block evidence.

## Follow-on work

Implement stateful NEAR sandbox replay against verified deployed Wasm and current liquidation paths, with financing, transaction receipts, and profit settlement all separately attested. **Do not enable mainnet signing on the basis of this batch alone.**
