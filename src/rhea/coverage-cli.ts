import {NearReadOnlyRpc} from './rpc.ts';
import {inspectRheaCoverage} from './coverage.ts';
const processRef=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=processRef.env;
if (env.EXECUTION_ENABLED!=='false') throw new Error('EXECUTION_ENABLED must be explicitly false');
if (env.NEAR_NETWORK!=='mainnet') throw new Error('NEAR_NETWORK must explicitly be mainnet');
if (!env.NEAR_RPC_URL || !env.RHEA_LENDING_CONTRACT || !env.RHEA_ORACLE_CONTRACT) throw new Error('missing required read-only RPC configuration');
const report=await inspectRheaCoverage(new NearReadOnlyRpc(env.NEAR_RPC_URL),{
  lendingContract:env.RHEA_LENDING_CONTRACT,oracleContract:env.RHEA_ORACLE_CONTRACT,
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH || undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH || undefined,
});
console.log(JSON.stringify(report,null,2));
if (report.status !== 'DECLARED_METADATA_ONLY') processRef.exitCode=2;
