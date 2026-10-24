import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { NearReadOnlyRpc } from './rpc.ts';
import { backfillRheaDebtIndex, type DebtBackfillCheckpoint } from './market-debt-index.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
function numberEnv(name:string,fallback:string):number {
  const raw=env[name]??fallback;
  if(!/^(0|[1-9][0-9]*)$/.test(raw))throw Error(`invalid numeric option: ${name}`);
  const n=Number(raw);if(!Number.isSafeInteger(n))throw Error(`unsafe numeric option: ${name}`);
  return n;
}
async function save(path:string,data:unknown):Promise<void>{
  const dest=resolve(path);await mkdir(dirname(dest),{recursive:true});
  const temp=`${dest}.tmp`;
  await writeFile(temp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(temp,dest);
}
async function main(){
  if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet')throw Error('READ_ONLY: EXECUTION_ENABLED=false and NEAR_NETWORK=mainnet required');
  const url=env.NEAR_RPC_URL;
  if(!url)throw Error('NEAR_RPC_URL required');
  const checkpointPath=env.RHEA_BACKFILL_CHECKPOINT_PATH??'rhea-debt-index.checkpoint.json';
  const reportPath=env.RHEA_BACKFILL_REPORT_PATH??'rhea-debt-index.report.json';
  const resume=env.RHEA_BACKFILL_RESUME==='true';
  if(env.RHEA_BACKFILL_RESUME!==undefined&&!['true','false'].includes(env.RHEA_BACKFILL_RESUME))throw Error('invalid resume flag');
  const prior:DebtBackfillCheckpoint|undefined=resume?JSON.parse(await readFile(resolve(checkpointPath),'utf8')):undefined;
  const opts={
    lendingContract:env.RHEA_LENDING_CONTRACT??'',
    startIndex:numberEnv('RHEA_BACKFILL_FROM_INDEX','0'),
    maxAccounts:numberEnv('RHEA_BACKFILL_MAX_ACCOUNTS','100000'),
    pageSize:numberEnv('RHEA_BACKFILL_PAGE_SIZE','50'),
    concurrency:numberEnv('RHEA_BACKFILL_CONCURRENCY','2'),
    batchDelayMs:numberEnv('RHEA_BACKFILL_BATCH_DELAY_MS','1000'),
    maxRetries:numberEnv('RHEA_BACKFILL_MAX_RETRIES','7'),
    rateLimitBaseDelayMs:numberEnv('RHEA_BACKFILL_RATE_LIMIT_DELAY_MS','5000'),
    expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,

  };
  const pinned=env.RHEA_BACKFILL_PINNED_BLOCK?numberEnv('RHEA_BACKFILL_PINNED_BLOCK','0'):undefined;
  if(pinned!==undefined&&pinned<1)throw Error('invalid pinned block');
  class SnapshotReadOnlyRpc extends NearReadOnlyRpc {
    async viewAccount(contractId:string,blockId?:number){return super.viewAccount(contractId,blockId??pinned);}
  }
  let latest:DebtBackfillCheckpoint|undefined;
  let latestSummary:ReturnType<typeof import('./market-debt-index.ts').summarizeDebtBackfill>|undefined;
  let checkpoint:DebtBackfillCheckpoint,summary:NonNullable<typeof latestSummary>;
  try{
  ({checkpoint,summary}=await backfillRheaDebtIndex(new SnapshotReadOnlyRpc(url),opts,prior,async(state,s)=>{
    latest=state;latestSummary=s;
    await save(checkpointPath,state);
    // Privacy-conscious CI logs: do not echo borrower identifiers in progress.
    console.error(JSON.stringify({mode:'NEAR_RHEA_BACKFILL_PROGRESS',blockHeight:s.blockHeight,scanned:s.scannedAccounts,
      total:s.totalAccounts,debtAccounts:s.debtAccounts,nextIndex:s.nextIndex,invalid:s.invalidAccounts}));
  }));
  }catch(error){
    // Preserve the last fully committed batch and an explicitly incomplete report.
    if(latest&&latestSummary){
      await save(checkpointPath,latest);
      await save(reportPath,{status:'INTERRUPTED_UNAPPROVED',summary:latestSummary,findings:latest.findings});
    }
    throw error;
  }
  await save(checkpointPath,checkpoint);
  await save(reportPath,{summary,findings:checkpoint.findings});
  console.log(JSON.stringify(summary,null,2));
  if(summary.status==='SCHEMA_ERRORS_UNVERIFIED'||summary.status==='BORROWER_DEBT_MISSING_UNVERIFIED')proc.exitCode=2;
}
main().catch(error=>{
  console.error(JSON.stringify({mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',status:'PROBE_ERROR',executionEnabled:false,
    reason:error instanceof Error?error.message:'unknown'}));proc.exitCode=2;
});
