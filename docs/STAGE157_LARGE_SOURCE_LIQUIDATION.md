# Stage157 — discover and attempt a genuinely larger Rhea liquidation

**26 October 2026.** This is an explicit *new borrower* investigation. It does **not** increase the principal against Stage93 historical borrower 2579 or repay Stage151's loss with fake tokens. The previous 100-test-LiNEAR financing cycle had a negative actual financing surplus despite original Rhea liquidation receipts; continuing to borrow larger against that same source debtor is uneconomic.

## Verifiable source and search scope

- Original GitHub Actions full mainnet debt index: [run #40128285853](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40128285853), 72,782 source accounts, 7,801 indexed borrowers, a single historic block **221436207**, public contract code hash `6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa`.
- Independent local review of that actual archived original index found **170 distinct LiNEAR-debt borrowers**. Debt presence alone does not prove liquidation eligibility or exact debt size. Source index age means all candidates must be refreshed at new final blocks and priced with authentic active Pyth before sizing.
- Initial four nonoverlapping, high-LiNEAR-density 80-borrower windows are indices `2537–2616`, `4989–5068`, `7671–7750` and `2986–3065`. This covers 320 historical debt findings, **not the entire market**; no broad completeness or absence-of-opportunity claim is permitted.
- The executable [Stage157 workflow](../.github/workflows/rhea-stage157-large-source-liquidation.yml) runs the existing unchanged Stage32 same-block read-only valuation and Stage38 fresh source sizing, then the new adversarially tested [size gate](../scripts/stage157-large-source-admission.mjs). It saves source indices, candidate reasons, original Pyth read evidence and any actual execution artifacts.

## Strict admission for a *large liquidation*

A candidate is admitted **only for an isolated NEAR Workspaces Sandbox call**, and only when all the following hold:

1. The original source-backed, freshly priced Stage38 liquidation plan is positive under the deployed lending rules. Its borrower identity and observed block match a successful fresh classification row.
2. The original source-sized **repay reference amount is at least $500** (`500 × 10^27` USD units). This amount comes from the borrower's source debt, **not** the size of the loan available to ARBIVANE.
3. Its original protocol liquidation *paper gross* is at least **$5**, independently source-priced. This is a *minimum theoretical discount*, **not** realized profit. Actual funding interest, gas, swaps, storage and slippage may still make it negative.
4. Both actual repay and seize token IDs are `linear-protocol.near`, the only currently implemented and tested Stage37 route for this investigation. Different collateral routes are rejected, not falsely marked executable.
5. Mainnet signing, user-wallet keys, external funding and owner payout all stay **disabled**. An independently verified no-debt local outcome is still required before even claiming success in Sandbox.

If there is no qualifying borrower, the workflow records `NO_VERIFIED_LARGE_LIQUIDATION` and **does not call any liquidation transaction**. If a candidate does clear the source gate, the workflow runs authentic imported Rhea/Pyth/NEP-141 Workspaces code and insists on original callback receipts, real borrower debt/collateral reductions, actual token transfer and actor settlement. Any oracle, RPC, route, interest or finality failure fails closed and is archived. A successful *local liquidation* is not actual mainnet profit, actual mainnet flash financing or capital-free execution.

## Evidence interpretation

The source old borrower 2579 liquidation was tiny and independently verified in Stage93; the 100-test-LiNEAR financed run suffered an interest shortfall because it did **not** enlarge the source debtor's actual liquidatable amount. Candidate 2594's previously observed `wrap.near` paper liquidation was around $0.44 repay and $0.0035 gross; it is **neither a large liquidation nor an implemented LiNEAR/ LiNEAR route**, and must not be substituted to manufacture a larger result.

After a Stage157 run, check **all four shard artifacts**, including `stage157-large-source-admission.json`, `stage37-sandbox-execution.json`, `stage41-sandbox-balance-settlement.json` and `stage55-sandbox-phase-evidence.json`. A green job with `NO_VERIFIED_LARGE_LIQUIDATION` demonstrates honest screening, *not* an executed liquidation. A signed event without canonical successful FINAL receipts and settled balances is not success.

**Important:** The 4-window scan does not exhaust all 7,801 borrowers. If it finds none, the next investigation should refresh further LiNEAR debtor windows and consider independently implemented/verified other-token Rhea routes rather than forcing a large principal into a tiny source candidate.
