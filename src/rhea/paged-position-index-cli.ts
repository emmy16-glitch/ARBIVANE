import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {NearReadOnlyRpc} from './rpc.ts';
import {indexPagedPositions,type PagedPositionCheckpoint} from './paged-position-index.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
function num(name:string,fallback?:string){const raw=env[name]??fallback;if(!raw||!/^(0|[1-9][0-9]*)$/.test(raw))throw Error(`INVALID_${name}`);return Number(raw);}
async function save(path:string,value:unknown){const dest=resolve(path);await mkdir(dirname(dest),{recursive:true});const tmp=dest+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600});await rename(tmp,dest);}
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)throw Error('PAGED_INDEX_READ_ONLY_REQUIRED');
 const checkpointPath=env.RHEA_PAGED_CHECKPOINT_PATH??'rhea-paged-position.checkpoint.json';
 const reportPath=env.RHEA_PAGED_REPORT_PATH??'rhea-paged-position.report.json';
 const resume=env.RHEA_PAGED_RESUME==='true';
 const prior: PagedPositionCheckpoint|undefined=resume?JSON.parse(await readFile(resolve(checkpointPath),'utf8')):undefined;
 let latest:PagedPositionCheckpoint|undefined;
 const options={lendingContract:env.RHEA_LENDING_CONTRACT??'',pinnedBlockHeight:num('RHEA_PINNED_BLOCK'),
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH??'',startIndex:num('RHEA_SCAN_FROM','0'),
  maxAccounts:num('RHEA_SCAN_MAX','250000'),pageSize:num('RHEA_SCAN_PAGE_SIZE','50'),concurrency:num('RHEA_SCAN_CONCURRENCY','4'),
  maxRetries:num('RHEA_SCAN_RETRIES','7'),batchDelayMs:num('RHEA_SCAN_BATCH_DELAY_MS','250'),retryBaseDelayMs:num('RHEA_SCAN_RETRY_DELAY_MS','5000'),
  checkpointEveryBatches:num('RHEA_CHECKPOINT_EVERY_BATCHES','5')};
 const rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL);
 try{
  const out=await indexPagedPositions(rpc,options,prior,async(cp,summary)=>{latest=cp;await save(checkpointPath,cp);
   console.error(JSON.stringify({mode:'PAGED_POSITION_PROGRESS',blockHeight:summary.blockHeight,scanned:summary.scannedAccounts,total:summary.totalAccounts,debtAccounts:summary.debtAccounts,nextIndex:summary.nextIndex}));});
  await save(checkpointPath,out.checkpoint);await save(reportPath,{summary:out.summary,findings:out.checkpoint.findings});console.log(JSON.stringify(out.summary,null,2));
 }catch(e){if(latest)await save(checkpointPath,latest);throw e;}
})().catch(e=>{console.error(JSON.stringify({mode:'RHEA_PAGED_POSITION_INDEX',status:'BLOCKED',reason:e instanceof Error?e.message:'UNKNOWN',executionEnabled:false}));proc.exitCode=2;});
