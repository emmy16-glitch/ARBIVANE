import { NearReadOnlyRpc } from "./rpc.ts";

/** Do not treat old Burrow addresses or RPC methods as verified deployments. */
export interface RheaReadConfig {
  lendingContract: string;
  oracleContract: string;
  maxAccounts: number;
  pageSize: number;
}
export interface RheaRawSnapshot {
  blockHeight: string;
  accountCount: number;
  assets: unknown[];
  oracle: unknown;
  accounts: unknown[];
  /** Raw indexed positions are not eligibility-verified candidates. */
  mode: "DISCOVERY_ONLY";
}

/** Pin all reads to one final NEAR block. Cap account pagination to avoid uncontrolled calls. */
export async function readRheaSnapshot(rpc: NearReadOnlyRpc, config: RheaReadConfig): Promise<RheaRawSnapshot> {
  if (!config.lendingContract || !config.oracleContract) throw new Error("verified contract IDs required");
  if (!Number.isSafeInteger(config.maxAccounts) || config.maxAccounts < 1 || config.maxAccounts > 10_000) throw new Error("invalid scan cap");
  if (!Number.isSafeInteger(config.pageSize) || config.pageSize < 1 || config.pageSize > 100) throw new Error("invalid page size");
  const a = await rpc.view<unknown[]>(config.lendingContract, "get_assets_paged", {});
  if (!Array.isArray(a.value)) throw new Error("unsupported assets response");
  const blockId = Number(a.blockHeight);
  const ids = a.value.map(x => {
    if (!Array.isArray(x) || typeof x[0] !== "string") throw new Error("unrecognised Rhea asset schema");
    return x[0];
  });
  const [count, oracle] = await Promise.all([
    rpc.view<string | number>(config.lendingContract, "get_num_accounts", {}, blockId),
    rpc.view<unknown>(config.oracleContract, "get_price_data", { asset_ids: ids }, blockId),
  ]);
  const accountCount = Number(count.value);
  if (!Number.isSafeInteger(accountCount) || accountCount < 0) throw new Error("invalid account count");
  const limit = Math.min(accountCount, config.maxAccounts);
  const accounts: unknown[] = [];
  for (let i = 0; i < limit; i += config.pageSize) {
    const response = await rpc.view<unknown[]>(config.lendingContract, "get_accounts_paged", { from_index: i, limit: Math.min(config.pageSize, limit - i) }, blockId);
    if (!Array.isArray(response.value)) throw new Error("invalid paginated account response");
    if (response.value.length > Math.min(config.pageSize, limit - i)) throw new Error("account page exceeds requested limit");
    accounts.push(...response.value);
  }
  return { blockHeight: a.blockHeight, accountCount, accounts, assets: a.value, oracle: oracle.value, mode: "DISCOVERY_ONLY" };
}
