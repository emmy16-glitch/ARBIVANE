import { NearReadOnlyRpc } from "./rpc.ts";
import { probeRheaReadCompatibility } from "./probe.ts";

/** Safe public-RPC diagnostics; deliberately cannot sign, execute, or settle transactions. */
async function main() {
  const runtime = globalThis as typeof globalThis & {process: {env: Record<string,string|undefined>;exitCode:number}};
  const env = runtime.process.env;
  if (env.EXECUTION_ENABLED !== "false") throw new Error("EXECUTION_ENABLED=false required");
  if (env.NEAR_NETWORK !== "mainnet") throw new Error("This diagnostic only supports explicit NEAR_NETWORK=mainnet");
  const lending = env.RHEA_LENDING_CONTRACT;
  const oracle = env.RHEA_ORACLE_CONTRACT;
  if (!lending || !oracle) throw new Error("Explicit RHEA_LENDING_CONTRACT and RHEA_ORACLE_CONTRACT required");
  const rpc = new NearReadOnlyRpc(env.NEAR_RPC_URL ?? "https://rpc.mainnet.near.org");
  const report = await probeRheaReadCompatibility(rpc, {
    lendingContract: lending,
    oracleContract: oracle,
    expectedLendingCodeHash: env.RHEA_EXPECTED_LENDING_CODE_HASH || undefined,
    expectedOracleCodeHash: env.RHEA_EXPECTED_ORACLE_CODE_HASH || undefined,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== "COMPATIBLE_READS") runtime.process.exitCode = 2;
}
main().catch((err: unknown) => {
  console.error(JSON.stringify({mode:"PUBLIC_READONLY_COMPATIBILITY",result:"PROBE_ABORTED",executionEnabled:false,
    failure:err instanceof Error ? err.message : "probe failed"}));
  (globalThis as typeof globalThis & {process: {exitCode:number}}).process.exitCode = 2;
});
