import { NearReadOnlyRpc } from './rpc.ts';
import { inspectPositionOracleEvidence } from './price-evidence.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet')throw Error('explicit READ ONLY mainnet is required');
 if(!env.NEAR_RPC_URL)throw Error('explicit NEAR RPC URL required');
 const report=await inspectPositionOracleEvidence(new NearReadOnlyRpc(env.NEAR_RPC_URL),{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  fromIndex:Number(env.RHEA_EVIDENCE_FROM_INDEX??'0'),maxAccounts:Number(env.RHEA_EVIDENCE_MAX_ACCOUNTS??'200'),
  pageSize:Number(env.RHEA_EVIDENCE_PAGE_SIZE??'25'),maxFindings:Number(env.RHEA_EVIDENCE_MAX_FINDINGS??'12'),
  maxDetails:Number(env.RHEA_EVIDENCE_MAX_DETAILS??'8'),maxFeedQueries:Number(env.RHEA_EVIDENCE_MAX_FEEDS??'12'),
  maxAgeMs:Number(env.RHEA_EVIDENCE_MAX_AGE_MS??'60000'),maxFutureSkewMs:2000,
  maxConfidenceBps:Number(env.RHEA_EVIDENCE_MAX_CONFIDENCE_BPS??'150'),
  oracleMethod:'get_price_no_older_than',nowMs:Date.now(),
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 console.log(JSON.stringify(report,null,2));
 // No findings is a valid scan, but any blocked quote is advisory failure.
 if(report.status==='INCOMPLETE_ORACLE_EVIDENCE')proc.exitCode=2;
}
main().catch(error=>{
 console.error(JSON.stringify({mode:'READ_ONLY_RHEA_POSITION_ORACLE_EVIDENCE',status:'PROBE_ERROR',executionEnabled:false,
  reason:error instanceof Error?error.message:'unknown'}));proc.exitCode=2;
});
