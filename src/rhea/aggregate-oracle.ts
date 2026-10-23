import type { NearReadOnlyRpc } from "./rpc.ts";
import type { RheaPrice } from "./valuation.ts";

/**
 * Rhea's current aggregate-oracle.near exposes Pyth-compatible feed IDs and
 * price/conf/expo/publish_time, NOT the legacy Burrow `get_price_data` response.
 *
 * Everything here is READ ONLY. Mapping an asset to a Pyth feed must be reviewed
 * against the deployed lending contract; never infer it from its symbol.
 */
export interface VerifiedFeedMapping { assetId: string; priceId: string }
export interface AggregateOracleOptions {
  maxAgeMs: number;
  maxFutureSkewMs: number;
  maxConfidenceBps: number;
  nowMs: number;
}
export interface AggregateAssetPrice {
  assetId: string;
  priceId: string;
  price: RheaPrice;
  publishTimeMs: number;
  ageMs: number;
  confidenceBps: bigint;
}
export interface AggregateOracleBatch {
  blockHeight: string;
  oldestPublishTimeMs: number;
  prices: Map<string, AggregateAssetPrice>;
}

const ACCOUNT_ID = /^[a-z0-9._-]{2,64}$/;
const FEED_ID = /^[a-f0-9]{64}$/;
const safeUInt = (input: unknown, what: string): bigint => {
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input) || input < 0) throw new Error(`invalid ${what}`);
    return BigInt(input);
  }
  if (typeof input !== "string" || !/^(0|[1-9][0-9]*)$/.test(input) || input.length > 32) throw new Error(`invalid ${what}`);
  return BigInt(input);
};
const signedInt = (input: unknown, what: string): bigint => {
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input)) throw new Error(`invalid ${what}`);
    return BigInt(input);
  }
  if (typeof input !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(input) || input.length > 32) throw new Error(`invalid ${what}`);
  return BigInt(input);
};
export function validateVerifiedFeedMappings(input: unknown): VerifiedFeedMapping[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 64) throw new Error("feed mappings must be a nonempty bounded list");
  const assets = new Set<string>();
  const priceIds = new Set<string>();
  return input.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid feed mapping");
    const {assetId, priceId} = item as Record<string, unknown>;
    if (typeof assetId !== "string" || !ACCOUNT_ID.test(assetId)) throw new Error("invalid mapped asset ID");
    if (typeof priceId !== "string" || !FEED_ID.test(priceId)) throw new Error("invalid Pyth feed ID");
    if (assets.has(assetId) || priceIds.has(priceId)) throw new Error("duplicate asset/feed mapping");
    assets.add(assetId); priceIds.add(priceId);
    return {assetId, priceId};
  });
}
function optionsOK(opts: AggregateOracleOptions): void {
  if (!Number.isSafeInteger(opts.maxAgeMs) || opts.maxAgeMs < 1 || opts.maxAgeMs > 600_000) throw new Error("invalid maxAgeMs");
  if (!Number.isSafeInteger(opts.maxFutureSkewMs) || opts.maxFutureSkewMs < 0 || opts.maxFutureSkewMs > 60_000) throw new Error("invalid maxFutureSkewMs");
  if (!Number.isSafeInteger(opts.maxConfidenceBps) || opts.maxConfidenceBps < 1 || opts.maxConfidenceBps > 10_000) throw new Error("invalid maxConfidenceBps");
  if (!Number.isSafeInteger(opts.nowMs) || opts.nowMs <= 0) throw new Error("invalid nowMs");
}
/** Strict parser: the Pyth result must be an object keyed by the exact 64-character feed IDs. */
export function parseAggregateOraclePrices(raw: unknown, mappings: VerifiedFeedMapping[], opts: AggregateOracleOptions): Omit<AggregateOracleBatch, "blockHeight"> {
  optionsOK(opts);
  const feeds = validateVerifiedFeedMappings(mappings);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("oracle price map missing");
  const rows = raw as Record<string, unknown>;
  if (Object.keys(rows).length !== feeds.length) throw new Error("oracle price map is incomplete or contains unexpected feeds");
  const prices = new Map<string, AggregateAssetPrice>();
  let oldestPublishTimeMs = Number.MAX_SAFE_INTEGER;
  for (const {assetId, priceId} of feeds) {
    if (!Object.hasOwn(rows, priceId)) throw new Error("requested oracle price feed missing");
    const result = rows[priceId];
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("oracle feed has no usable price");
    const data = result as Record<string, unknown>;
    const rawPrice = signedInt(data.price, "oracle price");
    const rawConfidence = safeUInt(data.conf, "oracle confidence");
    const exponent = signedInt(data.expo, "oracle exponent");
    const publishSeconds = safeUInt(data.publish_time, "oracle publish_time");
    if (rawPrice <= 0n || exponent < -36n || exponent > 36n) throw new Error("oracle nonpositive price or invalid exponent");
    // Require conservative confidence bounds, using integer ceiling so there is no rounding optimism.
    const confidenceBps = (rawConfidence * 10_000n + rawPrice - 1n) / rawPrice;
    if (confidenceBps > BigInt(opts.maxConfidenceBps)) throw new Error("oracle confidence exceeds policy");
    const publishMsBig = publishSeconds * 1000n;
    if (publishMsBig > BigInt(Number.MAX_SAFE_INTEGER) || publishMsBig < 1_500_000_000_000n) throw new Error("invalid oracle publish timestamp");
    const publishTimeMs = Number(publishMsBig);
    const ageMs = opts.nowMs - publishTimeMs;
    if (ageMs > opts.maxAgeMs || ageMs < -opts.maxFutureSkewMs) throw new Error("oracle price stale or from the future");
    const multiplier = exponent >= 0n ? rawPrice * 10n ** exponent : rawPrice;
    const decimals = exponent < 0n ? Number(-exponent) : 0;
    prices.set(assetId, {assetId, priceId, price:{multiplier,decimals},publishTimeMs,ageMs,confidenceBps});
    oldestPublishTimeMs = Math.min(oldestPublishTimeMs, publishTimeMs);
  }
  return {prices, oldestPublishTimeMs};
}
export async function readAggregateOraclePriceBatch(
  rpc: NearReadOnlyRpc,
  oracleContract: string,
  blockId: number,
  mappings: VerifiedFeedMapping[],
  options: AggregateOracleOptions,
): Promise<AggregateOracleBatch> {
  if (!ACCOUNT_ID.test(oracleContract) || !Number.isSafeInteger(blockId) || blockId < 1) throw new Error("invalid oracle read target");
  const feeds = validateVerifiedFeedMappings(mappings);
  const response = await rpc.view<unknown>(oracleContract, "list_prices_no_older_than", {price_ids: feeds.map(x => x.priceId)}, blockId);
  const result = parseAggregateOraclePrices(response.value, feeds, options);
  return {blockHeight: response.blockHeight, ...result};
}
