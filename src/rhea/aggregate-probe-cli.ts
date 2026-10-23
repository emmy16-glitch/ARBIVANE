import {NearReadOnlyRpc} from "./rpc.ts";
import {probeRheaAggregateOracle} from "./aggregate-probe.ts";
import {validateVerifiedFeedMappings} from "./aggregate-oracle.ts";

/** This diagnostic never handles wallet keys or sends transactions. */
async function main() {
  const processRef = (globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
  const env = processRef.env;
  if (env.EXECUTION_ENABLED !== "false" || env.NEAR_NETWORK !== "mainnet") throw new Error("explicit read-only mainnet mode required");
  if (env.RHEA_ORACLE_CONTRACT !== "aggregate-oracle.near") throw new Error("this probe only supports explicitly selected aggregate-oracle.near");
  if (env.RHEA_LENDING_CONTRACT !== "contract.main.burrow.near") throw new Error("explicit documented lending contract required");
  if (!env.RHEA_OPERATOR_FEED_MAPPINGS_JSON) throw new Error("RHEA_OPERATOR_FEED_MAPPINGS_JSON required; no implicit token-symbol mapping");
  let parsed: unknown;
  try { parsed=JSON.parse(env.RHEA_OPERATOR_FEED_MAPPINGS_JSON); }
  catch { throw new Error("invalid feed map JSON"); }
  const feeds = validateVerifiedFeedMappings(parsed);
  if (env.RHEA_PYTH_READ_METHOD && !["single","batch"].includes(env.RHEA_PYTH_READ_METHOD)) throw new Error("invalid RHEA_PYTH_READ_METHOD");
  const rpc = new NearReadOnlyRpc(env.NEAR_RPC_URL ?? "https://rpc.mainnet.fastnear.com");
  const report = await probeRheaAggregateOracle(rpc,{
    lendingContract:env.RHEA_LENDING_CONTRACT,oracleContract:env.RHEA_ORACLE_CONTRACT,feedMappings:feeds,
    readMethod: env.RHEA_PYTH_READ_METHOD === "batch" ? "batch" : "single",
    expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
    expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
  });
  console.log(JSON.stringify(report,null,2));
  if (report.result === "INCOMPATIBLE_READS") processRef.exitCode=2;
}
main().catch((err:unknown)=>{
  console.error(JSON.stringify({mode:"RHEA_AGGREGATE_ORACLE_READONLY",executionEnabled:false,result:"ABORTED",
    error:err instanceof Error?err.message:"invalid probe"}));
  (globalThis as typeof globalThis & {process:{exitCode:number}}).process.exitCode=2;
});
