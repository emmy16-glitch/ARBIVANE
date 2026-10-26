import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {FailoverNearReadOnlyRpc} from '../src/rhea/failover-readonly-rpc.ts';
import {PacedNearReadOnlyRpc} from '../src/rhea/paced-readonly-rpc.ts';
import {evaluateActualCandidate} from '../src/rhea/stage38-live-candidate-pipeline.ts';
import {buildStage37SandboxPlan} from '../src/rhea/stage37-sandbox-liquidation.ts';
import {stage157SelectHistoricalLiNearBorrowers,stage157AdmitSourceLargerLiquidation} from './stage157-large-source-candidates.mjs';

const env=process.env;
const number=(name,def)=>{
 const s=env[name]??String(def);
 if(!/^(0|[1-9][0-9]*)$/.test(s)||!Number.isSafeInteger(Number(s)))
  throw Error('STAGE157_INVALID_'+name);
 return Number(s);
};
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||
  env.NEAR_WORKSPACES_NETWORK!=='sandbox'||env.NEAR_PRIVATE_KEY||
  env.MAINNET_PRIVATE_KEY||!env.STAGE157_VERIFIED_INDEX_PATH||
  !env.NEAR_RPC_URL||!env.RHEA_EXPECTED_LENDING_CODE_HASH||
  !env.RHEA_EXPECTED_ORACLE_CODE_HASH)
  throw Error('STAGE157_REQUIRES_READONLY_PUBLIC_CHAIN_AND_KEYLESS_SANDBOX');
 const source=JSON.parse(await readFile(env.STAGE157_VERIFIED_INDEX_PATH,'utf8'));
 if(source.lendingCodeHash!==env.RHEA_EXPECTED_LENDING_CODE_HASH)
  throw Error('STAGE157_HISTORICAL_LENDING_CODE_HASH_DRIFT');
 const selected=stage157SelectHistoricalLiNearBorrowers(source,{
  batch:number('STAGE157_BATCH',0),shard:number('STAGE157_SHARD',0)});
 const endpoints=[env.NEAR_RPC_URL,env.NEAR_RPC_FALLBACK_URL].filter(Boolean);
 const rpc=new PacedNearReadOnlyRpc(
  new FailoverNearReadOnlyRpc(endpoints.map(url=>new NearReadOnlyRpc(url))),
  number('RHEA_RPC_SPACING_MS',900));
 const options={
  lendingContract:env.RHEA_LENDING_CONTRACT??'contract.main.burrow.near',
  pythOracle:env.RHEA_ORACLE_CONTRACT??'aggregate-oracle.near',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH,
  expectedPythOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH,
  maxConfidenceBps:150,sanityMaxUsd:'10000000',
  minimumPaperGrossUsdE27:'1',
 };
 const rows=[];let largest=null;
 for(const item of selected.candidates){
  let row={sourceFindingIndex:item.index,borrowerAccountId:item.accountId,
   historicalDebtAssetDiversity:item.previouslyRecordedDistinctDebtAssets,
   currentPositionRechecked:false,largeSourceLiquidationQualified:false,
   reasons:[],sourceBlockHeight:null,repayLendingInternalAtomic:null};
  try{
   // Both original lending code and deployed active-Pyth quote are independently
   // re-read for this candidate. No archived risk/price is promoted.
   const candidate=await evaluateActualCandidate(rpc,item.accountId,options);
   row.currentPositionRechecked=true;
   row.sourceBlockHeight=candidate.blockHeight??null;
   const admission=stage157AdmitSourceLargerLiquidation(candidate,item.accountId);
   row.reasons.push(admission.reason);
   row.repayLendingInternalAtomic=candidate.repay?.amountLendingInternalAtomic??null;
   // Never mark a candidate qualified until the original deployed
   // Stage37 action/asset route also passes. A thrown ABI check stays BLOCKED.
   if(admission.qualified){
    buildStage37SandboxPlan(candidate); // strict original deployed-route ABI.
    row.largeSourceLiquidationQualified=true;
    if(!largest||BigInt(candidate.repay.amountLendingInternalAtomic)>
        BigInt(largest.repay.amountLendingInternalAtomic))largest=candidate;
   }
  }catch(error){
   row.reasons.push('CURRENT_SOURCE_RPC_OR_ORACLE_OR_RULES_BLOCKED');
   row.observationErrorName=String(error?.name??'Error').slice(0,60);
   // Do not log RPC URLs, provider keys, credentials, or private data.
  }
  rows.push(row);
  console.error(JSON.stringify({mode:'STAGE157_CURRENT_BORROWER_PROGRESS',
   completed:rows.length,total:selected.candidates.length,sourceFindingIndex:item.index,
   largerSourceCandidate:row.largeSourceLiquidationQualified}));
 }
 if(largest)await writeFile('stage157-large-source-evidence.json',
  JSON.stringify(largest,null,2)+'\n',{mode:0o600});
 const report={
  mode:'STAGE157_GENUINE_LARGER_LIQUIDATION_DISCOVERY',
  chain:'NEAR_MAINNET_READONLY_AND_SEPARATE_LOCAL_SANDBOX',
  status:largest?'LARGE_SOURCE_PLAN_READY_SANDBOX_ONLY':'NO_VERIFIED_LARGER_SOURCE_LIQUIDATION',
  selectedHistoricalBlockHeight:selected.sourceBlockHeight,
  totalHistoricalLiNearCandidates:selected.totalHistoricalLiNearCandidates,
  excludedPreviousSmallBorrowerIndex:2579,shard:selected.shard,batch:selected.batch,
  reviewed:rows.length,minimumRepayLendingInternalAtomic:'0',
  arbitraryTransactionSizeFloorEnabled:false,
  qualifiedLargerSourceAccounts:rows.filter(x=>x.largeSourceLiquidationQualified).length,
  bestSourceRepayLendingInternalAtomic:largest?.repay?.amountLendingInternalAtomic??null,
  currentPriceAndBlockRechecked:true,
  historicalDebtLegCountNotTreatedAsLiquidationSize:true,
  readyForConditionalSandbox:!!largest,
  sandboxSettlementVerified:false,realizedEconomicProfitVerified:false,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  rows
 };
 await writeFile('stage157-large-discovery-report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({...report,rows:undefined},null,2));
}
main().catch(error=>{
 console.error(JSON.stringify({mode:'STAGE157_GENUINE_LARGER_LIQUIDATION_DISCOVERY',
  status:'BLOCKED',reason:String(error?.message??'UNKNOWN').slice(0,120),
  maySignMainnet:false,mayBroadcastMainnet:false,realizedEconomicProfitVerified:false}));
 process.exitCode=2;
});
