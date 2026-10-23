import type { NearReadOnlyRpc } from "./rpc.ts";
import {readAggregateOraclePriceBatch, validateVerifiedFeedMappings, type VerifiedFeedMapping} from "./aggregate-oracle.ts";

export interface AggregateProbeConfig {
  lendingContract: string;
  oracleContract: string;
  feedMappings: VerifiedFeedMapping[];
  expectedLendingCodeHash?: string;
  expectedOracleCodeHash?: string;
  nowMs?: number;
  readMethod?: "single" | "batch";
}
export interface AggregateProbeReport {
  mode: "RHEA_AGGREGATE_ORACLE_READONLY";
  executionEnabled: false;
  exactContractParityVerified: false;
  result: "PARTIAL_FEED_READS" | "ALL_LISTED_FEEDS_READ" | "INCOMPATIBLE_READS";
  lendingContract: string;
  oracleContract: string;
  lendingCodeHash: string | null;
  oracleCodeHash: string | null;
  blockHeight: string | null;
  observedAssets: number | null;
  readMethod: "single" | "batch";
  mappedAssets: number;
  sampledPriceAgesMs: Record<string, number>;
  failures: string[];
  warnings: string[];
}
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
/** Explicit operator-supplied feed map. Never autogenerates symbol-to-feed mappings. */
export async function probeRheaAggregateOracle(rpc: NearReadOnlyRpc, config: AggregateProbeConfig): Promise<AggregateProbeReport> {
  const feeds = validateVerifiedFeedMappings(config.feedMappings);
  if (!config.lendingContract || !config.oracleContract || config.lendingContract === config.oracleContract) throw new Error("invalid lending/oracle contracts");
  for (const hash of [config.expectedLendingCodeHash, config.expectedOracleCodeHash]) {
    if (hash !== undefined && !HASH.test(hash)) throw new Error("invalid expected contract code hash");
  }
  const report: AggregateProbeReport = {
    mode:"RHEA_AGGREGATE_ORACLE_READONLY", executionEnabled:false,exactContractParityVerified:false,
    result:"INCOMPATIBLE_READS",lendingContract:config.lendingContract,oracleContract:config.oracleContract,
    lendingCodeHash:null,oracleCodeHash:null,blockHeight:null,observedAssets:null,mappedAssets:feeds.length,
    readMethod:config.readMethod ?? "single", sampledPriceAgesMs:{},failures:[],warnings:["FEED_MAP_IS_OPERATOR_SUPPLIED_NOT_ONCHAIN_VERIFIED", "COMPATIBLE_READS_DO_NOT_PROVE_LIQUIDATION_PARITY"],
  };
  try {
    const lending = await rpc.viewAccount(config.lendingContract);
    report.lendingCodeHash = lending.codeHash;
    report.blockHeight = lending.blockHeight;
    const blockId = Number(lending.blockHeight);
    if (!Number.isSafeInteger(blockId)) throw new Error("invalid block height");
    const oracle = await rpc.viewAccount(config.oracleContract,blockId);
    report.oracleCodeHash = oracle.codeHash;
    if (config.expectedLendingCodeHash && config.expectedLendingCodeHash !== lending.codeHash) throw new Error("PINNED_LENDING_CODE_HASH_MISMATCH");
    if (config.expectedOracleCodeHash && config.expectedOracleCodeHash !== oracle.codeHash) throw new Error("PINNED_ORACLE_CODE_HASH_MISMATCH");
    if (!config.expectedLendingCodeHash || !config.expectedOracleCodeHash) report.warnings.push("CODE_HASHES_NOT_APPROVED");
    const raw = (await rpc.view<unknown>(config.lendingContract,"get_assets_paged",{},blockId)).value;
    if (!Array.isArray(raw) || raw.length > 256) throw new Error("unsupported Rhea asset response");
    const assetIds = new Set<string>();
    for (const row of raw) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || assetIds.has(row[0])) throw new Error("invalid duplicate/empty Rhea asset row");
      assetIds.add(row[0]);
    }
    report.observedAssets = assetIds.size;
    for (const {assetId} of feeds) if (!assetIds.has(assetId)) throw new Error("mapped token absent from Rhea lending assets");
    const batch = await readAggregateOraclePriceBatch(rpc,config.oracleContract,blockId,feeds,{
      nowMs:config.nowMs ?? Date.now(),maxAgeMs:60_000,maxFutureSkewMs:5_000,maxConfidenceBps:250,
    }, config.readMethod ?? "single");
    for (const [assetId,price] of batch.prices) report.sampledPriceAgesMs[assetId]=price.ageMs;
    report.result = assetIds.size === feeds.length ? "ALL_LISTED_FEEDS_READ" : "PARTIAL_FEED_READS";
    if (report.result === "PARTIAL_FEED_READS") report.warnings.push("PARTIAL_ASSET_COVERAGE_NOT_SUITABLE_FOR_MARKET_WIDE_VALUATION");
  } catch (err:unknown) {
    // No RPC payload, positions or private identifiers in diagnostic errors.
    const code = err instanceof Error ? err.message : "UNKNOWN_READ_FAILURE";
    const reason = code.startsWith("PINNED_") ? code
      : code.includes("no usable price") ? "PYTH_PRICE_MISSING_OR_STALE"
      : code.includes("confidence") ? "PYTH_CONFIDENCE_EXCEEDS_POLICY"
      : code.includes("stale or from the future") ? "PYTH_PRICE_OUTSIDE_FRESHNESS_WINDOW"
      : code.includes("NEAR RPC returned an error") ? "PYTH_ORACLE_METHOD_REJECTED_BY_RPC"
      : code.includes("oracle price map") ? "PYTH_ORACLE_RESPONSE_MAP_INVALID"
      : code.includes("invalid") || code.includes("missing") ? "INVALID_LENDING_OR_ORACLE_SCHEMA"
      : "AGGREGATE_ORACLE_RPC_OR_SCHEMA_FAILURE";
    report.failures.push(reason);
  }
  return report;
}
