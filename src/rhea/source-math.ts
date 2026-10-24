/**
 * READ-ONLY research model of arithmetic from NearDeFi/burrowland's PUBLIC source.
 * It is not a deployed-contract attestation, price oracle, executor, or audit.
 * The source rounds fixed-point values to 27 decimals, with half-up operations.
 * Deliberately keep this independent of Stage 2's micro-USD conservative math.
 */
import type { RheaAccount, RheaMarket, RheaPool } from './valuation.ts';

export const SOURCE_SCALE = 10n ** 27n;
const HALF = SOURCE_SCALE / 2n;
const UINT128_MAX = (1n << 128n) - 1n;
const BPS = 10_000n;
export interface SourceValuation {
  mode: 'UPSTREAM_SOURCE_MODEL_ONLY';
  accountId: string;
  adjustedCollateralE27: string;
  adjustedDebtE27: string;
  discountE27: string;
  healthFactorE27: string | null;
  sourceContractParityVerified: false;
}
function bounded(value: bigint, label: string): bigint {
  if (value < 0n || value > UINT128_MAX) throw new Error(`invalid ${label}: u128 bound`);
  return value;
}
function nonnegative(value: bigint, label: string): bigint {
  if (value < 0n) throw new Error(`invalid ${label}`);
  return value;
}
function divide(numerator: bigint, denominator: bigint, label: string): bigint {
  if (denominator <= 0n) throw new Error(`invalid ${label} denominator`);
  return numerator / denominator;
}
export function sourceMul(a: bigint, b: bigint): bigint {
  return divide(nonnegative(a, 'scaled a') * nonnegative(b, 'scaled b') + HALF, SOURCE_SCALE, 'mul');
}
export function sourceDiv(a: bigint, b: bigint): bigint {
  return divide(nonnegative(a, 'scaled a') * SOURCE_SCALE + HALF, b, 'div');
}
export function sourceMulRatio(value: bigint, ratio: bigint): bigint {
  if (ratio < 1n || ratio > BPS) throw new Error('invalid volatility ratio');
  return (nonnegative(value, 'scaled value') * ratio + BPS / 2n) / BPS;
}
export function sourceDivRatio(value: bigint, ratio: bigint): bigint {
  if (ratio < 1n || ratio > BPS) throw new Error('invalid volatility ratio');
  return (nonnegative(value, 'scaled value') * BPS + BPS / 2n) / ratio;
}
export function sourceSharesToAmount(shares: bigint, pool: RheaPool, roundUp: boolean): bigint {
  bounded(shares, 'account shares'); bounded(pool.shares, 'pool shares'); bounded(pool.balance, 'pool balance');
  if (pool.balance < pool.shares || shares > pool.shares) throw new Error('invalid upstream pool invariant');
  if (shares === 0n && pool.shares === 0n) return 0n;
  // Exact branch from upstream Pool::shares_to_amount. Full redemption always
  // returns the full pool balance (not a rounded proportional remainder).
  if (shares >= pool.balance || shares === pool.shares) return pool.balance;
  if (pool.shares === 0n) throw new Error('cannot redeem from empty pool');
  return (pool.balance * shares + (roundUp ? pool.shares - 1n : 0n)) / pool.shares;
}
export function sourceAmountToShares(amount: bigint, pool: RheaPool, roundUp: boolean): bigint {
  bounded(amount, 'amount'); bounded(pool.shares, 'pool shares'); bounded(pool.balance, 'pool balance');
  if (pool.balance < pool.shares) throw new Error('invalid upstream pool invariant');
  if (pool.balance === 0n) return amount;
  return (pool.shares * amount + (roundUp ? pool.balance - 1n : 0n)) / pool.balance;
}
export function sourceFromBalancePrice(balance: bigint, multiplier: bigint, decimals: number, extraDecimals: number): bigint {
  bounded(balance, 'token balance'); bounded(multiplier, 'price multiplier');
  if (multiplier === 0n || !Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36 ||
      !Number.isSafeInteger(extraDecimals) || extraDecimals < 0 || extraDecimals > 36) throw new Error('invalid price precision');
  const exponent = decimals + extraDecimals;
  const n = balance * multiplier;
  return exponent > 27 ? n / (10n ** BigInt(exponent - 27)) : n * (10n ** BigInt(27 - exponent));
}
export function sourceComputeDiscount(adjustedCollateral: bigint, adjustedDebt: bigint): bigint {
  nonnegative(adjustedCollateral, 'adjusted collateral'); nonnegative(adjustedDebt, 'adjusted debt');
  if (adjustedDebt <= adjustedCollateral) return 0n;
  const ratio = sourceDiv(adjustedDebt - adjustedCollateral, adjustedDebt);
  return sourceDiv(ratio, 2n * SOURCE_SCALE);
}
export function sourceValueAccount(account: RheaAccount, market: RheaMarket): SourceValuation {
  if (!/^[0-9]+$/.test(market.blockHeight) || !/^[a-z0-9._-]{2,64}$/.test(account.accountId)) throw Error('invalid source valuation identity');
  const sum = (positions: RheaAccount['collateral'], role: 'collateral' | 'debt') => {
    let total = 0n;
    for (const [id, position] of positions) {
      const a = market.assets.get(id), p = market.prices.get(id);
      if (!a || !p || a.volatilityBps < 1n || a.volatilityBps > BPS) throw Error(`missing or invalid source asset ${id}`);
      const pool = role === 'debt' ? a.borrowed : a.supplied;
      const units = sourceSharesToAmount(position.shares, pool, role === 'debt');
      const value = sourceFromBalancePrice(units, p.multiplier, p.decimals, a.extraDecimals);
      total += role === 'debt' ? sourceDivRatio(value, a.volatilityBps) : sourceMulRatio(value, a.volatilityBps);
    }
    return total;
  };
  const c = sum(account.collateral, 'collateral'), d = sum(account.borrowed, 'debt');
  const discount = sourceComputeDiscount(c,d);
  return {mode:'UPSTREAM_SOURCE_MODEL_ONLY',accountId:account.accountId,adjustedCollateralE27:c.toString(),adjustedDebtE27:d.toString(),
    discountE27:discount.toString(),healthFactorE27:d>0n?sourceDiv(c,d).toString():null,sourceContractParityVerified:false};
}

/** Corresponds to the four explicit checks in upstream internal_liquidate,
 * on independently supplied pre/post snapshots, NOT to a transaction simulator.
 */
export function sourceCheckLiquidationRules(input:{beforeCollateralE27:bigint;beforeDebtE27:bigint;afterCollateralE27:bigint;afterDebtE27:bigint;repaidE27:bigint;seizedE27:bigint}) {
  for (const [k,v] of Object.entries(input)) nonnegative(v,k);
  const initialDiscount=sourceComputeDiscount(input.beforeCollateralE27,input.beforeDebtE27);
  const nextDiscount=sourceComputeDiscount(input.afterCollateralE27,input.afterDebtE27);
  const reasons:string[]=[];
  if(initialDiscount===0n)reasons.push('INITIAL_POSITION_NOT_AT_RISK');
  if(sourceMul(input.seizedE27,SOURCE_SCALE-initialDiscount)>input.repaidE27)reasons.push('DISCOUNTED_COLLATERAL_EXCEEDS_REPAYMENT');
  if(nextDiscount===0n)reasons.push('FINAL_POSITION_NOT_AT_RISK');
  if(nextDiscount>=initialDiscount)reasons.push('BORROWER_HEALTH_NOT_IMPROVED');
  return {mode:'SOURCE_FORMULA_ONLY' as const,validBySourceRules:reasons.length===0,reasons,
    initialDiscountE27:initialDiscount.toString(),newDiscountE27:nextDiscount.toString(),approvedForExecution:false as const};
}
