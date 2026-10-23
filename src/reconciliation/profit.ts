import { parseUnits, parseSignedUnits } from "../domain/money.ts";
export interface RealisedProfitEvidence {
  executionFinal: boolean;
  collateralSold: boolean;
  chain: string;
  txHash: string;
  settlementAsset: string;
  openingBalanceAtomic: string;
  closingBalanceAtomic: string;
  ownerDepositsAtomic: string;
  ownerWithdrawalsAtomic: string;
  outstandingBorrowedLiabilityAtomic: string;
  executionFeesAtomic: string;
}

/** Token-unit P&L after actual conversion only; this does not invent USD pricing. */
export function reconcileRealisedAtomic(e: RealisedProfitEvidence): bigint {
  if (!e.executionFinal) throw new Error("execution is not final");
  if (!e.collateralSold) throw new Error("inventory is not realised proceeds");
  if (!e.chain || !e.txHash || !e.settlementAsset) throw new Error("missing final chain evidence");
  // Closing - opening - deposits + withdrawals - unsettled debts - fees.
  return parseUnits(e.closingBalanceAtomic) - parseUnits(e.openingBalanceAtomic) -
    parseUnits(e.ownerDepositsAtomic) + parseUnits(e.ownerWithdrawalsAtomic) -
    parseUnits(e.outstandingBorrowedLiabilityAtomic) - parseUnits(e.executionFeesAtomic);
}

/** Balance deltas sometimes need to be signed (e.g. negative P&L). */
export function validateReportedProfit(profit: string, computed: bigint): boolean {
  return parseSignedUnits(profit) === computed;
}
