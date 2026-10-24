import { NearReadOnlyRpc } from './rpc.ts';
import { probeDeployedShares } from './deployed-share-parity.ts';

/** Public RPC reads only: never accepts a wallet, key, or execution flag. */
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number;stdout:{write:(s:string)=>void}}}).process;
async function main():Promise<void> {
  if(proc.env.EXECUTION_ENABLED!=='false'||proc.env.NEAR_NETWORK!=='mainnet')
    throw Error('Read-only mainnet diagnostic requires EXECUTION_ENABLED=false and NEAR_NETWORK=mainnet');
  const config={
    lendingContract:proc.env.RHEA_LENDING_CONTRACT??'',
    oracleContract:proc.env.RHEA_ORACLE_CONTRACT??'',
    maxAccounts:Number(proc.env.RHEA_STAGE9_MAX_ACCOUNTS??'40'),
    pageSize:Number(proc.env.RHEA_STAGE9_PAGE_SIZE??'10'),
    maxDetailedAccounts:Number(proc.env.RHEA_STAGE9_MAX_DETAILS??'8'),
    expectedLendingCodeHash:proc.env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
    expectedOracleCodeHash:proc.env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
  };
  const report=await probeDeployedShares(new NearReadOnlyRpc(proc.env.NEAR_RPC_URL??''),config);
  proc.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(report.status!=='SAMPLED_SHARE_MATCH')proc.exitCode=2;
}
main().catch(err=>{console.error(JSON.stringify({mode:'LIVE_READ_ONLY_SHARE_DIFFERENTIAL',status:'INCOMPATIBLE_RPC',executionEnabled:false,error:err instanceof Error?err.message:'unknown error'}));proc.exitCode=2;});
