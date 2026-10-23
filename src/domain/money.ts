import type { FinancialEstimate, IntegerString } from "./types.ts";

const DECIMAL_UNSIGNED = /^(0|[1-9][0-9]*)$/;
const DECIMAL_SIGNED = /^-?(0|[1-9][0-9]*)$/;

/** Reject scientific notation, fractional values, whitespace and unsafe JS numbers. */
export function parseUnits(value: IntegerString, label = "amount"): bigint {
  if (typeof value !== "string" || !DECIMAL_UNSIGNED.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer string`);
  }
  return BigInt(value);
}

export function parseSignedUnits(value: IntegerString, label = "amount"): bigint {
  if (typeof value !== "string" || !DECIMAL_SIGNED.test(value)) {
    throw new Error(`${label} must be a signed decimal integer string`);
  }
  return BigInt(value);
}

/** Conservative expected net amount in micro-USD (may be negative). */
export function expectedNetUsdE6(input: FinancialEstimate): bigint {
  const proceeds = parseUnits(input.proceedsUsdE6, "proceeds");
  const costs: (keyof FinancialEstimate)[] = [
    "repayUsdE6", "networkFeesUsdE6", "routeCostsUsdE6",
    "financingCostsUsdE6", "storageCostsUsdE6",
    "raceRiskReserveUsdE6", "inventoryRiskReserveUsdE6",
  ];
  return proceeds - costs.reduce((total, field) => total + parseUnits(input[field], field), 0n);
}

/** Exact integer conversion with round-down (safe for proceeds valuations). */
export function mulDivFloor(a: string, b: string, denominator: string): bigint {
  const d = parseUnits(denominator, "denominator");
  if (d === 0n) throw new Error("denominator must not be zero");
  return parseUnits(a, "a") * parseUnits(b, "b") / d;
}

/** Exact integer conversion with round-up (safe for debts and fees). */
export function mulDivCeil(a: string, b: string, denominator: string): bigint {
  const d = parseUnits(denominator, "denominator");
  if (d === 0n) throw new Error("denominator must not be zero");
  const product = parseUnits(a, "a") * parseUnits(b, "b");
  return (product + d - 1n) / d;
}
