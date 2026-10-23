import { NearReadOnlyRpc } from "./rpc.ts";
import { parseRheaMarket } from "./valuation.ts";
import type { RheaRawSnapshot } from "./scanner.ts";

/** A diagnostic of public RPC schema compatibility; it is not evidence of safety or execution parity. */
export interface RheaProbeConfig {
  lendingContract: string;
  oracleContract: string;
  expectedLendingCodeHash?: string;
  expectedOracleCodeHash?: string;
  maxAssets?: number;
  maxOracleAgeMs?: number;
  nowMs?: number;
}
export type StepState = "PASS" | "FAIL" | "SKIP";
export interface ProbeStep { name: string; state: StepState; reason?: string }
export interface RheaProbeReport {
  mode: "PUBLIC_READONLY_COMPATIBILITY";
  executionEnabled: false;
  exactContractParityVerified: false;
  result: "COMPATIBLE_READS" | "INCOMPATIBLE_READS";
  network: "mainnet";
  blockHeight: string | null;
  lending: { accountId: string; observedCodeHash: string | null; pinnedToExpected: boolean };
  oracle: { accountId: string; observedCodeHash: string | null; pinnedToExpected: boolean };
  observedAssets: number | null;
  observedAccounts: number | null;
  oracleAgeMs: number | null;
  steps: ProbeStep[];
  warnings: string[];
}
const CONTRACT_ID = /^[a-z0-9._-]{2,64}$/;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const safeCount = (value: unknown): number => {
  if (!(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) &&
      !(typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) throw new Error("account count not integer");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid account count");
  return n;
};
const requireHash = (value?: string) => {
  if (value !== undefined && !HASH.test(value)) throw new Error("invalid pinned code hash");
};

/** Strictly read-only. Never uses RPC transaction methods and never outputs borrower identifiers. */
export async function probeRheaReadCompatibility(rpc: NearReadOnlyRpc, c: RheaProbeConfig): Promise<RheaProbeReport> {
  if (!CONTRACT_ID.test(c.lendingContract) || !CONTRACT_ID.test(c.oracleContract)) throw new Error("invalid contract IDs");
  if (c.lendingContract === c.oracleContract) throw new Error("lending and oracle must differ");
  requireHash(c.expectedLendingCodeHash);
  requireHash(c.expectedOracleCodeHash);
  const maxAssets = c.maxAssets ?? 128;
  const maxOracleAgeMs = c.maxOracleAgeMs ?? 60_000;
  if (!Number.isSafeInteger(maxAssets) || maxAssets < 1 || maxAssets > 256) throw new Error("invalid maximum assets");
  if (!Number.isSafeInteger(maxOracleAgeMs) || maxOracleAgeMs < 1 || maxOracleAgeMs > 600_000) throw new Error("invalid oracle age limit");
  const nowMs = c.nowMs ?? Date.now();
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) throw new Error("invalid clock");
  const report: RheaProbeReport = {
    mode: "PUBLIC_READONLY_COMPATIBILITY", executionEnabled: false, exactContractParityVerified: false,
    result: "INCOMPATIBLE_READS", network: "mainnet", blockHeight: null,
    lending: {accountId: c.lendingContract, observedCodeHash: null, pinnedToExpected: false},
    oracle: {accountId: c.oracleContract, observedCodeHash: null, pinnedToExpected: false},
    observedAssets: null, observedAccounts: null, oracleAgeMs: null, steps: [], warnings: [],
  };
  // Errors never include entire RPC response, account details, or token positions.
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      const result = await fn();
      report.steps.push({name, state: "PASS"});
      return result;
    } catch {
      report.steps.push({name, state: "FAIL", reason: "RPC_METHOD_OR_SCHEMA_INCOMPATIBLE"});
      return undefined;
    }
  };
  const lending = await step("lending_deployed_account", () => rpc.viewAccount(c.lendingContract));
  if (!lending) return report;
  report.blockHeight = lending.blockHeight;
  report.lending.observedCodeHash = lending.codeHash;
  const blockId = Number(lending.blockHeight);
  if (!Number.isSafeInteger(blockId)) throw new Error("unsafe block height");
  const oracle = await step("oracle_deployed_account", () => rpc.viewAccount(c.oracleContract, blockId));
  if (!oracle) return report;
  report.oracle.observedCodeHash = oracle.codeHash;
  report.lending.pinnedToExpected = lending.codeHash === c.expectedLendingCodeHash;
  report.oracle.pinnedToExpected = oracle.codeHash === c.expectedOracleCodeHash;
  if (!c.expectedLendingCodeHash || !c.expectedOracleCodeHash) report.warnings.push("CODE_HASHES_OBSERVED_BUT_NOT_APPROVED");
  if (c.expectedLendingCodeHash && !report.lending.pinnedToExpected ||
      c.expectedOracleCodeHash && !report.oracle.pinnedToExpected) {
    report.steps.push({name: "contract_identity", state: "FAIL", reason: "PINNED_CODE_HASH_MISMATCH"});
    return report;
  }
  report.steps.push({name: "contract_identity", state: "PASS"});
  const assets = await step("lending_assets_schema", async () => {
    const value = (await rpc.view<unknown>(c.lendingContract, "get_assets_paged", {}, blockId)).value;
    if (!Array.isArray(value) || value.length > maxAssets) throw new Error("bad assets");
    if (value.some(row => !Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string")) throw new Error("bad asset row");
    return value as [string, unknown][];
  });
  if (!assets) return report;
  report.observedAssets = assets.length;
  const count = await step("lending_count_schema", async () => safeCount((await rpc.view<unknown>(c.lendingContract,"get_num_accounts",{},blockId)).value));
  if (count === undefined) return report;
  report.observedAccounts = count;
  const ids = assets.map(row => row[0] as string);
  const price = await step("oracle_get_price_data_schema", async () => {
    const value = (await rpc.view<unknown>(c.oracleContract,"get_price_data",{asset_ids:ids},blockId)).value;
    const market = parseRheaMarket({blockHeight:lending.blockHeight,accountCount:0,assets,oracle:value,accounts:[],mode:"DISCOVERY_ONLY"} satisfies RheaRawSnapshot);
    if (market.prices.size < ids.length) throw new Error("missing prices");
    // Prices can be null for unsupported assets, but this probe will not claim pricing compatibility.
    if (ids.some(id => !market.prices.get(id))) throw new Error("unpriced market asset");
    const age = nowMs - market.oracleTimestampMs;
    if (age < 0 || age > maxOracleAgeMs) throw new Error("stale oracle");
    return age;
  });
  if (price === undefined) return report;
  report.oracleAgeMs = price;
  const firstPage = await step("lending_accounts_schema", async () => {
    if (count === 0) return 0;
    const value = (await rpc.view<unknown>(c.lendingContract,"get_accounts_paged",{from_index:0,limit:1},blockId)).value;
    if (!Array.isArray(value) || value.length !== 1) throw new Error("bad page");
    const account = value[0];
    if (!account || typeof account !== "object" || Array.isArray(account)) throw new Error("bad borrower");
    const record = account as Record<string, unknown>;
    if (typeof record.account_id !== "string" || !record.collateral || !record.borrowed || !record.supplied) throw new Error("bad account schema");
    return value.length;
  });
  if (firstPage === undefined) return report;
  report.result = "COMPATIBLE_READS";
  report.warnings.push("LIVE_READ_COMPATIBILITY_DOES_NOT_VERIFY_LIQUIDATION_MATH_OR_FUND_SAFETY");
  return report;
}
