import { mulDivCeil, mulDivFloor, parseUnits } from "../domain/money.ts";
import type { RheaRawSnapshot } from "./scanner.ts";

/** Stage 2: conservative USD micro-unit valuations for documented Burrow-style reads.
 * Financial data must never pass through JS floating point.
 * This module does NOT attest parity with the currently deployed Rhea contract.
 */
const USD_SCALE = 1_000_000n;
const BPS = 10_000n;

type RawRecord = Record<string, unknown>;
export interface RheaPool { shares: bigint; balance: bigint }
export interface RheaAsset {
  tokenId: string;
  supplied: RheaPool;
  borrowed: RheaPool;
  volatilityBps: bigint;
  extraDecimals: number;
  canBorrow: boolean;
}
export interface RheaPrice { multiplier: bigint; decimals: number }
export interface RheaMarket {
  blockHeight: string;
  oracleTimestampMs: number;
  assets: Map<string, RheaAsset>;
  prices: Map<string, RheaPrice | null>;
}
export interface RheaPosition {
  tokenId: string;
  shares: bigint;
  balanceAtomic: bigint;
  pricedUsdE6: bigint;
  adjustedUsdE6: bigint;
  volatilityBps: bigint;
}
export interface RheaAccount {
  accountId: string;
  collateral: Map<string, RheaPosition>;
  borrowed: Map<string, RheaPosition>;
  adjustedCollateralUsdE6: bigint;
  adjustedDebtUsdE6: bigint;
  /** Null for a debt-free account. */
  healthFactorBps: bigint | null;
  /** A ratio represented as numerator/denominator, not prematurely rounded BPS. */
  discountNumerator: bigint;
  discountDenominator: bigint;
  eligibleIndicative: boolean;
}
function object(value: unknown, label: string): RawRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as RawRecord;
}
function field(r: RawRecord, snake: string, camel: string = snake): unknown {
  if (snake !== camel && Object.hasOwn(r, snake) && Object.hasOwn(r, camel)) {
    throw new Error(`ambiguous ${snake} / ${camel} field`);
  }
  return r[snake] ?? r[camel];
}
function unsigned(value: unknown, label: string): bigint {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isSafeInteger(value))) throw new Error(`${label} must be integer string`);
  return parseUnits(String(value), label);
}
function smallInt(value: unknown, label: string, maximum: number): number {
  const parsed = unsigned(value, label);
  if (parsed > BigInt(maximum)) throw new Error(`${label} exceeds bound`);
  return Number(parsed);
}
function pool(raw: unknown, label: string): RheaPool {
  const r = object(raw, label);
  const shares = unsigned(r.shares, `${label}.shares`);
  const balance = unsigned(r.balance, `${label}.balance`);
  if (shares === 0n && balance !== 0n) throw new Error(`${label} has balance without shares`);
  return { shares, balance };
}
function accountId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length < 2 || value.length > 64 || !/^[a-z0-9._-]+$/.test(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}
function oracleTime(value: unknown): number {
  const nanos = unsigned(value, "oracle timestamp nanoseconds");
  const ms = nanos / 1_000_000n;
  if (ms < 1_500_000_000_000n || ms > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("invalid oracle timestamp");
  return Number(ms);
}

export function parseRheaMarket(snapshot: RheaRawSnapshot): RheaMarket {
  const assets = new Map<string, RheaAsset>();
  for (const [index, rawAsset] of snapshot.assets.entries()) {
    if (!Array.isArray(rawAsset) || rawAsset.length !== 2) throw new Error(`asset ${index} is not [tokenId, asset]`);
    const tokenId = accountId(rawAsset[0], "asset token ID");
    if (assets.has(tokenId)) throw new Error(`duplicate asset ${tokenId}`);
    const a = object(rawAsset[1], `${tokenId} asset`);
    const config = object(a.config, `${tokenId} config`);
    const volatilityBps = unsigned(field(config, "volatility_ratio", "volatilityRatio"), `${tokenId} volatility ratio`);
    if (volatilityBps === 0n || volatilityBps > BPS) throw new Error(`${tokenId} invalid volatility ratio`);
    const extraDecimals = smallInt(field(config, "extra_decimals", "extraDecimals"), `${tokenId} extra decimals`, 36);
    const canBorrow = field(config, "can_borrow", "canBorrow");
    if (typeof canBorrow !== "boolean") throw new Error(`${tokenId} missing can_borrow flag`);
    assets.set(tokenId, {
      tokenId, supplied: pool(a.supplied, `${tokenId} supplied`), borrowed: pool(a.borrowed, `${tokenId} borrowed`),
      volatilityBps, extraDecimals, canBorrow,
    });
  }
  const rawOracle = object(snapshot.oracle, "oracle");
  const oracleTimestampMs = oracleTime(rawOracle.timestamp);
  if (!Array.isArray(rawOracle.prices)) throw new Error("oracle prices must be a list");
  const prices = new Map<string, RheaPrice | null>();
  for (const [index, row] of rawOracle.prices.entries()) {
    const p = object(row, `price row ${index}`);
    const tokenId = accountId(field(p, "asset_id", "assetId"), "price token ID");
    if (prices.has(tokenId)) throw new Error(`duplicate price ${tokenId}`);
    const price = p.price;
    if (price === null) { prices.set(tokenId, null); continue; }
    const value = object(price, `price ${tokenId}`);
    const multiplier = unsigned(value.multiplier, `${tokenId} price multiplier`);
    const decimals = smallInt(value.decimals, `${tokenId} price decimals`, 36);
    if (multiplier === 0n) throw new Error(`${tokenId} zero price multiplier`);
    prices.set(tokenId, { multiplier, decimals });
  }
  return { blockHeight: snapshot.blockHeight, oracleTimestampMs, assets, prices };
}

/** Shares -> raw asset units. Supplies round DOWN, debt rounds UP. */
export function unitsFromShares(shares: bigint, p: RheaPool, kind: "collateral" | "debt"): bigint {
  if (shares === 0n) return 0n;
  if (p.shares === 0n) throw new Error("nonzero account shares with empty pool");
  return kind === "collateral"
    ? mulDivFloor(shares.toString(), p.balance.toString(), p.shares.toString())
    : mulDivCeil(shares.toString(), p.balance.toString(), p.shares.toString());
}

/** Floor valued proceeds, ceil valued debts. Does not include swap execution prices. */
export function priceUnitsUsdE6(units: bigint, asset: RheaAsset, price: RheaPrice, kind: "collateral" | "debt"): bigint {
  const denom = 10n ** BigInt(price.decimals + asset.extraDecimals);
  const numerator = units * price.multiplier * USD_SCALE;
  return kind === "collateral" ? numerator / denom : (numerator + denom - 1n) / denom;
}

function readSharesMap(value: unknown, label: string): Map<string, bigint> {
  const r = object(value, label);
  const out = new Map<string, bigint>();
  for (const [tokenId, value] of Object.entries(r)) {
    accountId(tokenId, "position token ID");
    const shares = unsigned(value, `${label} shares for ${tokenId}`);
    if (shares > 0n) out.set(tokenId, shares);
  }
  return out;
}
function valuePositions(raw: unknown, market: RheaMarket, kind: "collateral" | "debt"): Map<string, RheaPosition> {
  const result = new Map<string, RheaPosition>();
  for (const [tokenId, shares] of readSharesMap(raw, kind)) {
    const asset = market.assets.get(tokenId);
    const price = market.prices.get(tokenId);
    if (!asset) throw new Error(`missing asset ${tokenId}`);
    if (!price) throw new Error(`missing or null oracle price ${tokenId}`);
    const balanceAtomic = unitsFromShares(shares, kind === "collateral" ? asset.supplied : asset.borrowed, kind);
    const pricedUsdE6 = priceUnitsUsdE6(balanceAtomic, asset, price, kind);
    const adjustedUsdE6 = kind === "collateral"
      ? pricedUsdE6 * asset.volatilityBps / BPS
      : (pricedUsdE6 * BPS + asset.volatilityBps - 1n) / asset.volatilityBps;
    result.set(tokenId, { tokenId, shares, balanceAtomic, pricedUsdE6, adjustedUsdE6, volatilityBps: asset.volatilityBps });
  }
  return result;
}

/** Health and discount are indicative until parity-tested against the live Rhea contract. */
export function valueRheaAccount(raw: unknown, market: RheaMarket): RheaAccount {
  const r = object(raw, "borrower account");
  const id = accountId(field(r, "account_id", "accountId"), "borrower account ID");
  const collateral = valuePositions(r.collateral, market, "collateral");
  const borrowed = valuePositions(r.borrowed, market, "debt");
  const adjustedCollateralUsdE6 = [...collateral.values()].reduce((x, v) => x + v.adjustedUsdE6, 0n);
  const adjustedDebtUsdE6 = [...borrowed.values()].reduce((x, v) => x + v.adjustedUsdE6, 0n);
  const deficit = adjustedDebtUsdE6 > adjustedCollateralUsdE6 ? adjustedDebtUsdE6 - adjustedCollateralUsdE6 : 0n;
  const discountDenominator = adjustedDebtUsdE6 > 0n ? 2n * adjustedDebtUsdE6 : 1n;
  const discountNumerator = deficit;
  return {
    accountId: id, collateral, borrowed, adjustedCollateralUsdE6, adjustedDebtUsdE6,
    healthFactorBps: adjustedDebtUsdE6 > 0n ? adjustedCollateralUsdE6 * BPS / adjustedDebtUsdE6 : null,
    discountNumerator, discountDenominator,
    eligibleIndicative: adjustedDebtUsdE6 > adjustedCollateralUsdE6 && adjustedDebtUsdE6 > 0n,
  };
}

/** Read-only bounded aggregation. Malformed or partially priced accounts fail the entire run. */
export function assessRheaSnapshot(snapshot: RheaRawSnapshot): {
  mode: "INDICATIVE_ONLY";
  blockHeight: string;
  oracleTimestampMs: number;
  assessed: number;
  unhealthyIndicative: number;
  accounts: RheaAccount[];
} {
  const market = parseRheaMarket(snapshot);
  const accounts = snapshot.accounts.map(raw => valueRheaAccount(raw, market));
  const unique = new Set(accounts.map(a => a.accountId));
  if (unique.size !== accounts.length) throw new Error("duplicate borrower account in snapshot");
  return {
    mode: "INDICATIVE_ONLY", blockHeight: snapshot.blockHeight, oracleTimestampMs: market.oracleTimestampMs,
    assessed: accounts.length, unhealthyIndicative: accounts.filter(a => a.eligibleIndicative).length, accounts,
  };
}
