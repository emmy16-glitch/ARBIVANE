import {NearReadOnlyRpc} from './rpc.ts';
import {inspectRheaMarketMetadata} from './market-metadata.ts';

const processRef = (globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env = processRef.env;
if (env.EXECUTION_ENABLED !== 'false') throw new Error('EXECUTION_ENABLED must be explicitly false');
if (env.NEAR_NETWORK !== 'mainnet') throw new Error('read-only evidence requires explicit NEAR_NETWORK=mainnet');
const rpcUrl = env.NEAR_RPC_URL;
const lendingContract = env.RHEA_LENDING_CONTRACT;
const oracleContract = env.RHEA_ORACLE_CONTRACT;
if (!rpcUrl || !lendingContract || !oracleContract) throw new Error('missing RPC/lending/oracle settings');
const report = await inspectRheaMarketMetadata(new NearReadOnlyRpc(rpcUrl),{
 lendingContract,oracleContract,
 expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH || undefined,
 expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH || undefined,
});
// Avoid leaking external account positions: report is limited to public protocol metadata.
console.log(JSON.stringify(report,null,2));
if (report.status !== 'METADATA_PRESENT_UNAPPROVED') processRef.exitCode=2;
