import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {NearReadOnlyRpc} from './rpc.ts';
import {indexDetailedDebtShard,type DetailedIndexCheckpoint} from './detailed-debt-index.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
function num(key:string,fallback:string){const v=env[key]??fallback;if(!/^(0|[1-9][0-9]*)$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('INVALID_NUMERIC_ENV_'+key);return Number(v);}
async function save(path:string,data:unknown){const file=resolve(path);await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(data,null,2)+'\n',{encoding:'utf8',mode:0o600});await rename(file+'.tmp',file);}
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)throw Error('READ_ONLY_MAINNET_REQUIRED');
 const out=env.RHEA_BACKFILL_CHECKPOINT_PATH??'rhea-debt-index.checkpoint.json', report=env.RHEA_BACKFILL_REPORT_PATH??'rhea-debt-index.report.json';
 const opts={lendingContract:env.RHEA_LENDING_CONTRACT??'',startIndex:num('RHEA_BACKFILL_FROM_INDEX','0'),maxAccounts:num('RHEA_BACKFILL_MAX_ACCOUNTS','5000'),
  pageSize:num('RHEA_BACKFILL_PAGE_SIZE','50'),detailConcurrency:num('RHEA_DETAIL_CONCURRENCY','3'),maxRetries:num('RHEA_BACKFILL_MAX_RETRIES','7'),
  pinnedBlockHeight:num('RHEA_BACKFILL_PINNED_BLOCK','0'),expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  batchDelayMs:num('RHEA_BACKFILL_BATCH_DELAY_MS','300'),retryBaseDelayMs:num('RHEA_BACKFILL_RATE_LIMIT_DELAY_MS','5000')};
 const prior:DetailedIndexCheckpoint|undefined=env.RHEA_BACKFILL_RESUME==='true'?JSON.parse(await readFile(resolve(out),'utf8')):undefined;
 const {checkpoint,summary}=await indexDetailedDebtShard(new NearReadOnlyRpc(env.NEAR_RPC_URL),opts,prior,async(state,s)=>{
  await save(out,state);console.error(JSON.stringify({mode:'RHEA_DETAILED_BACKFILL_PROGRESS',blockHeight:s.blockHeight,scanned:s.scannedAccounts,debts:s.debtAccounts,invalid:s.invalidAccounts}));
 });
 await save(out,checkpoint);await save(report,{summary,findings:checkpoint.findings,sourceView:checkpoint.sourceView});
 console.log(JSON.stringify({...summary,sourceView:checkpoint.sourceView},null,2));
 if(summary.status==='SCHEMA_ERRORS_UNVERIFIED'||summary.status==='BORROWER_DEBT_MISSING_UNVERIFIED')proc.exitCode=2;
})().catch(e=>{console.error(JSON.stringify({mode:'RHEA_DETAILED_BACKFILL',status:'PROBE_ERROR',reason:e instanceof Error?e.message:'UNKNOWN',executionEnabled:false}));proc.exitCode=2;});
