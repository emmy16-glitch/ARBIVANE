import { NearReadOnlyRpc } from "./rpc.ts";
import { readRheaSnapshot } from "./scanner.ts";
import { assessRheaSnapshot } from "./valuation.ts";

/** Never send account-level insights to an executor. Read-only diagnostic command. */
async function main(): Promise<void> {
  const runtime = globalThis as typeof globalThis & { process: { env: Record<string, string | undefined>, exitCode: number } };
  const env = runtime.process.env;
  if (env.EXECUTION_ENABLED !== "false") throw new Error("EXECUTION_ENABLED=false is mandatory");
  if (env.NEAR_NETWORK !== "mainnet" && env.NEAR_NETWORK !== "testnet") throw new Error("explicit NEAR_NETWORK required");
  if (!env.RHEA_LENDING_CONTRACT || !env.RHEA_ORACLE_CONTRACT) throw new Error("configure independently verified contract IDs");
  const rpcUrl = env.NEAR_RPC_URL ?? (env.NEAR_NETWORK === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org");
  const snapshot = await readRheaSnapshot(new NearReadOnlyRpc(rpcUrl), {
    lendingContract: env.RHEA_LENDING_CONTRACT, oracleContract: env.RHEA_ORACLE_CONTRACT,
    maxAccounts: 50, pageSize: 20,
  });
  const result = assessRheaSnapshot(snapshot);
  const nowMs = Date.now();
  if (result.oracleTimestampMs > nowMs || nowMs - result.oracleTimestampMs > 60_000) throw new Error("oracle price timestamp not fresh enough for diagnostic");
  console.log(JSON.stringify({
    mode: result.mode, executionEnabled: false, blockHeight: result.blockHeight,
    oracleTimestampMs: result.oracleTimestampMs,
    assessed: result.assessed, unhealthyIndicative: result.unhealthyIndicative,
    warning: "No execution readiness or exact deployed contract parity is claimed. No positions or transactions are emitted.",
  }, null, 2));
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "unknown scanner failure");
  (globalThis as typeof globalThis & {process: {exitCode: number}}).process.exitCode = 1;
});
