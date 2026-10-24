import { parseUnits } from "../domain/money.ts";
import { priceUnitsUsdE6, type RheaAccount, type RheaMarket, type RheaPosition } from "./valuation.ts";

export interface ProposedTransfer { tokenId: string; atomicUnits: string }
export interface PaperLiquidation {
  repay: ProposedTransfer[];
  seize: ProposedTransfer[];
}
export interface LiquidationRuleAssessment {
  /** Not an executable instruction or contract equivalence proof. */
  mode: "PAPER_RULES_ONLY";
  satisfiesDocumentedRules: boolean;
  reasons: string[];
  repaidUsdE6: string;
  seizedUsdE6: string;
  grossIncentiveUsdE6: string;
  oldHealthFactorBps: string | null;
  newHealthFactorBps: string | null;
  discountBpsFloor: string;
  exactContractParityVerified: false;
}
const BPS = 10_000n;
function validateLegs(transfers: ProposedTransfer[], kind: "repay" | "seize", positions: Map<string, RheaPosition>, market: RheaMarket) {
  if (!Array.isArray(transfers) || transfers.length < 1 || transfers.length > 16) throw new Error(`${kind} must contain 1 to 16 assets`);
  const seen = new Set<string>();
  const updated = new Map(positions);
  let pricedUsdE6 = 0n;
  for (const transfer of transfers) {
    if (seen.has(transfer.tokenId)) throw new Error(`duplicate ${kind} token`);
    seen.add(transfer.tokenId);
    const amount = parseUnits(transfer.atomicUnits, `${kind} units`);
    if (amount === 0n) throw new Error(`${kind} amount must exceed zero`);
    const pos = positions.get(transfer.tokenId);
    const asset = market.assets.get(transfer.tokenId);
    const price = market.prices.get(transfer.tokenId);
    if (!pos || !asset || !price) throw new Error(`${kind} token is not a priced borrower position`);
    if (amount > pos.balanceAtomic) throw new Error(`${kind} exceeds available borrower balance`);
    const role = kind === "repay" ? "debt" : "collateral";
    pricedUsdE6 += priceUnitsUsdE6(amount, asset, price, role);
    const remaining = pos.balanceAtomic - amount;
    const remainingUsd = priceUnitsUsdE6(remaining, asset, price, role);
    const adjusted = role === "debt"
      ? (remainingUsd * BPS + asset.volatilityBps - 1n) / asset.volatilityBps
      : remainingUsd * asset.volatilityBps / BPS;
    updated.set(transfer.tokenId, { ...pos, balanceAtomic: remaining, pricedUsdE6: remainingUsd, adjustedUsdE6: adjusted });
  }
  return { updated, pricedUsdE6 };
}
/** Check documented on-paper protocol rules. NEAR contract must independently enforce final rules.
 * No transaction payload and no 'EXECUTION_ALLOWED' result are produced here.
 */
export function assessPaperLiquidation(account: RheaAccount, market: RheaMarket, proposed: PaperLiquidation): LiquidationRuleAssessment {
  const reasons: string[] = [];
  const r = validateLegs(proposed.repay, "repay", account.borrowed, market);
  const s = validateLegs(proposed.seize, "seize", account.collateral, market);
  if (!account.eligibleIndicative) reasons.push("BORROWER_NOT_LIQUIDATABLE");
  const repaidUsd = r.pricedUsdE6;
  const seizedUsd = s.pricedUsdE6;
  // Exact ratio inequality avoids premature rounding of the half-health discount.
  if (seizedUsd * (account.discountDenominator - account.discountNumerator) > repaidUsd * account.discountDenominator) {
    reasons.push("DISCOUNTED_COLLATERAL_EXCEEDS_REPAYMENT");
  }
  const adjustedCollateral = [...s.updated.values()].reduce((v, p) => v + p.adjustedUsdE6, 0n);
  const adjustedDebt = [...r.updated.values()].reduce((v, p) => v + p.adjustedUsdE6, 0n);
  if (adjustedDebt === 0n || adjustedCollateral >= adjustedDebt) reasons.push("FINAL_HEALTH_NOT_BELOW_ONE");
  // The fourth on-chain liquidation invariant requires health to strictly IMPROVE.
  // Compare exact adjusted ratios (not rounded displayed basis points).
  if (adjustedDebt > 0n && account.adjustedDebtUsdE6 > 0n &&
      adjustedCollateral * account.adjustedDebtUsdE6 <= account.adjustedCollateralUsdE6 * adjustedDebt) {
    reasons.push("FINAL_HEALTH_NOT_IMPROVED");
  }
  return {
    mode: "PAPER_RULES_ONLY", satisfiesDocumentedRules: reasons.length === 0, reasons,
    repaidUsdE6: repaidUsd.toString(), seizedUsdE6: seizedUsd.toString(),
    grossIncentiveUsdE6: (seizedUsd - repaidUsd).toString(),
    oldHealthFactorBps: account.healthFactorBps?.toString() ?? null,
    newHealthFactorBps: adjustedDebt === 0n ? null : (adjustedCollateral * BPS / adjustedDebt).toString(),
    discountBpsFloor: (account.discountNumerator * BPS / account.discountDenominator).toString(),
    exactContractParityVerified: false,
  };
}
