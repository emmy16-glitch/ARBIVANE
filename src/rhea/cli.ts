import { NearReadOnlyRpc } from "./rpc.ts";
import { readRheaSnapshot } from "./scanner.ts";

/** A read-only CLI, with explicit deployment config and no signing capability. */
async function main(): Promise<void> {
  // Avoid accessing process without @types/node dependency in core TS package.
  const env: Record<string, string | undefined> = (globalThis as typeof globalThis & {process: {env: Record<string, string | undefined>}}).process.env;
  if (env.EXECUTION_ENABLED !== "false") throw new Error("EXECUTION_ENABLED must explicitly be false");
  if (env.NEAR_NETWORK !== "mainnet" && env.NEAR_NETWORK !== "testnet") throw new Error("explicit NEAR_NETWORK required");
  const lending = env.RHEA_LENDING_CONTRACT;
  const oracle = env.RHEA_ORACLE_CONTRACT;
  if (!lending || !oracle) throw new Error("set verified RHEA_LENDING_CONTRACT and RHEA_ORACLE_CONTRACT");
  const rpc = new NearReadOnlyRpc(env.NEAR_RPC_URL ?? "https://rpc.mainnet.near.org");
  const snapshot = await readRheaSnapshot(rpc, { lendingContract: lending, oracleContract: oracle, maxAccounts: 50, pageSize: 20 });
  const data = { mode: snapshot.mode, blockHeight: snapshot.blockHeight, totalAccountsReported: snapshot.accountCount, accountsRead: snapshot.accounts.length, assetsRead: snapshot.assets.length };
  // Intentionally omit raw target-account information from console output.
  (globalThis as typeof globalThis & {console: Console}).console.log(JSON.stringify(data, null, 2));
}
main().catch((error: unknown) => {
  (globalThis as typeof globalThis & {console: Console}).console.error(error instanceof Error ? error.message : "unknown error");
  (globalThis as typeof globalThis & {process: {exitCode: number}}).process.exitCode = 1;
});
