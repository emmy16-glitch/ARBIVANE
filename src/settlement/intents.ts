import { parseUnits } from "../domain/money.ts";
/** No transfers, approvals, deposits or mainnet calls are performed here. */
export interface SettlementIntent {
  executionTxHash: string;
  reconciled: boolean;
  realisedAsset: string;
  amountAtomic: string;
  destinationAsset: string;
  recipient: string;
  refundTo: string;
  maxSlippageBps: number;
}
export function validateSettlementOrder(order: SettlementIntent): void {
  if (!order.reconciled || !order.executionTxHash) throw new Error("settlement requires reconciled execution");
  if (!order.realisedAsset || !order.destinationAsset) throw new Error("token metadata required");
  if (!order.recipient || !order.refundTo) throw new Error("recipient and refund address required");
  if (parseUnits(order.amountAtomic) <= 0n) throw new Error("settlement amount must be positive");
  if (!Number.isSafeInteger(order.maxSlippageBps) || order.maxSlippageBps < 0 || order.maxSlippageBps > 1_000) throw new Error("unsupported slippage limit");
}
