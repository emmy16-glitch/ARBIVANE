import type { NearReadOnlyRpc } from './rpc.ts';
import { parseParityPools } from './deployed-share-parity.ts';
import { discoverDebtInAccount, type DebtAccountFinding } from './debt-discovery.ts';

/**
 * Stage 14: NEAR-first Rhea account-index backfill.
 * A backfill is one finalized-block snapshot, never a multi-block append of
 * incompatible accounts. This module cannot produce liquidation instructions.
 * Only public view_account and call_function methods are used.
 */
const ID = /^[a-z0-9._-]{2,64}$/;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const MAX_MARKET = 20_000_000;

export interface DebtBackfillOptions {
  lendingContract: string;
  startIndex: number;
  maxAccounts: number;
  pageSize: number;
  concurrency: number;
  maxRetries: number;
  expectedLendingCodeHash?: string;
}
export interface DebtBackfillCheckpoint {
  version: 1;
  mode: 'NEAR_RHEA_SAME_BLOCK_BACKFILL';
  chain: 'NEAR_MAINNET';
  executionEnabled: false;
  liquidationParityVerified: false;
  lendingContract: string;
  blockHeight: string;
  lendingCodeHash: string;
  codeHashPinProvided: boolean;
  totalAccounts: number;
  startIndex: number;
  targetEndIndex: number;
  nextIndex: number;
  scannedAccounts: number;
  invalidAccounts: number;
  schemaReasons: Record<string, number>;
  /** Public borrower account IDs are retained to catch duplicate index entries on resume. */
  seenAccountIds: string[];
  findings: DebtAccountFinding[];
  completeSnapshot: boolean;
}
export interface DebtBackfillSummary {
  mode: 'NEAR_RHEA_SAME_BLOCK_BACKFILL';
  chain: 'NEAR_MAINNET';
  status: 'COMPLETE_INDEX_UNAPPROVED' | 'PARTIAL_WINDOW_UNAPPROVED' | 'SCHEMA_ERRORS_UNVERIFIED';
  executionEnabled: false;
  liquidationParityVerified: false;
  priceParityVerified: false;
  blockHeight: string;
  lendingCodeHash: string;
  totalAccounts: number;
  scannedAccounts: number;
  nextIndex: number;
  debtAccounts: number;
  debtPositions: number;
  debtAssetIds: string[];
  invalidAccounts: number;
  schemaReasons: Record<string, number>;
  completeSnapshot: boolean;
  warnings: string[];
}
const validInt=(value:number,min:number,max:number):boolean=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const safeObj=(v:unknown):Record<string,unknown>=>{
  if(v===null||typeof v!=='object'||Array.isArray(v))throw Error('invalid borrower record');
  return v as Record<string,unknown>;
};
function accountCount(v:unknown):number {
  if(typeof v==='number' && validInt(v,0,MAX_MARKET))return v;
  if(typeof v==='string' && /^(0|[1-9][0-9]{0,7})$/.test(v) && Number(v)<=MAX_MARKET)return Number(v);
  throw Error('invalid market account count');
}
function assertOptions(o:DebtBackfillOptions):void {
  if(!ID.test(o.lendingContract))throw Error('invalid lending contract');
  if(!validInt(o.startIndex,0,MAX_MARKET))throw Error('invalid starting index');
  if(!validInt(o.maxAccounts,1,250_000))throw Error('maxAccounts must be 1..250000');
  if(!validInt(o.pageSize,1,50))throw Error('pageSize must be 1..50');
  if(!validInt(o.concurrency,1,12))throw Error('concurrency must be 1..12');
  if(!validInt(o.maxRetries,0,4))throw Error('maxRetries must be 0..4');
  if(o.expectedLendingCodeHash!==undefined&&!HASH.test(o.expectedLendingCodeHash))throw Error('invalid code hash pin');
}
function reason(error:unknown):string {
  const s=error instanceof Error?error.message:'';
  if(s.includes('ambiguous'))return 'AMBIGUOUS_POSITION_SCOPES';
  if(s.includes('missing'))return 'MISSING_POSITION_FIELDS';
  if(s.includes('unknown or duplicate'))return 'UNKNOWN_OR_DUPLICATE_ASSET';
  if(s.includes('u128')||s.includes('shares'))return 'INVALID_SHARES';
  return 'UNSUPPORTED_BORROWER_SCHEMA';
}
const isRetryable=(error:unknown):boolean=>error instanceof Error &&
  /HTTP 429|HTTP 5\d\d|fetch failed|timeout|timed out|aborted/i.test(error.message);
async function retry<T>(op:()=>Promise<T>,maxRetries:number):Promise<T> {
  for(let attempt=0;;attempt++) {
    try{return await op();}
    catch(error){
      if(attempt>=maxRetries||!isRetryable(error))throw error;
      await new Promise<void>(resolve=>setTimeout(resolve,150*2**attempt));
    }
  }
}
function assertCheckpoint(input:DebtBackfillCheckpoint,o:DebtBackfillOptions):void {
  if(!input||input.version!==1||input.mode!=='NEAR_RHEA_SAME_BLOCK_BACKFILL'||input.chain!=='NEAR_MAINNET'||
    input.executionEnabled!==false||input.liquidationParityVerified!==false||input.lendingContract!==o.lendingContract||
    !HASH.test(input.lendingCodeHash)||!validInt(Number(input.blockHeight),1,Number.MAX_SAFE_INTEGER)||
    !validInt(input.totalAccounts,0,MAX_MARKET)||input.startIndex!==o.startIndex||
    input.targetEndIndex!==Math.min(input.totalAccounts,o.startIndex+o.maxAccounts)||
    !validInt(input.nextIndex,input.startIndex,input.targetEndIndex)||
    !validInt(input.scannedAccounts,0,o.maxAccounts)||input.scannedAccounts!==input.nextIndex-input.startIndex||
    !validInt(input.invalidAccounts,0,input.scannedAccounts)||
    !Array.isArray(input.seenAccountIds)||input.seenAccountIds.length!==input.scannedAccounts||
    !Array.isArray(input.findings)||input.findings.length>input.scannedAccounts||
    typeof input.schemaReasons!=='object'||input.schemaReasons===null||Array.isArray(input.schemaReasons)||
    input.codeHashPinProvided!==(o.expectedLendingCodeHash!==undefined)) throw Error('checkpoint does not match same-block scan configuration');
  const ids=new Set<string>();
  for(const id of input.seenAccountIds){if(typeof id!=='string'||!ID.test(id)||ids.has(id))throw Error('checkpoint includes invalid/duplicate account');ids.add(id);}
  const seenFindings=new Set<string>();
  for(const hit of input.findings){if(!hit||!ids.has(hit.accountId)||seenFindings.has(hit.accountId)||
    hit.classification!=='DEBT_SHARES_DISCOVERED_UNVALUED'||!Array.isArray(hit.positions)||!hit.positions.length)
    throw Error('invalid checkpoint debt findings');
    seenFindings.add(hit.accountId);
  }
  if(input.completeSnapshot && (input.startIndex!==0||input.nextIndex!==input.totalAccounts||input.invalidAccounts!==0))throw Error('invalid checkpoint completeness claim');
  if(o.expectedLendingCodeHash&&input.lendingCodeHash!==o.expectedLendingCodeHash)throw Error('PINNED_LENDING_CODE_HASH_MISMATCH');
}
/** The report deliberately omits account names; the artifact retains the public detailed index. */
export function summarizeDebtBackfill(s:DebtBackfillCheckpoint):DebtBackfillSummary {
  const accounts=s.findings.length;
  const debtPositions=s.findings.reduce((n,f)=>n+f.positions.length,0);
  const debtAssetIds=[...new Set(s.findings.flatMap(f=>f.positions.flatMap(p=>p.debtAssetIds)))].sort();
  return {mode:s.mode,chain:s.chain,
    status:s.invalidAccounts>0?'SCHEMA_ERRORS_UNVERIFIED':s.completeSnapshot?'COMPLETE_INDEX_UNAPPROVED':'PARTIAL_WINDOW_UNAPPROVED',
    executionEnabled:false,liquidationParityVerified:false,priceParityVerified:false,
    blockHeight:s.blockHeight,lendingCodeHash:s.lendingCodeHash,totalAccounts:s.totalAccounts,
    scannedAccounts:s.scannedAccounts,nextIndex:s.nextIndex,debtAccounts:accounts,debtPositions,debtAssetIds,
    invalidAccounts:s.invalidAccounts,schemaReasons:{...s.schemaReasons},completeSnapshot:s.completeSnapshot,
    warnings:['DEBT_SHARES_ARE_NOT_LIQUIDATION_OPPORTUNITIES','INDEX_BACKFILL_PINNED_TO_A_SINGLE_NEAR_BLOCK',
      'POSITION_HEALTH_ORACLE_PROFIT_AND_LIQUIDATION_PARITY_UNVERIFIED','NO_WALLET_SIGNING_OR_EXECUTION',
      ...(!s.codeHashPinProvided?['DEPLOYED_CODE_HASH_NOT_INDEPENDENTLY_ATTESTED']:[])],
  };
}
export async function backfillRheaDebtIndex(
  rpc:NearReadOnlyRpc,o:DebtBackfillOptions,
  resume?:DebtBackfillCheckpoint,
  onCheckpoint?:(value:DebtBackfillCheckpoint,summary:DebtBackfillSummary)=>Promise<void>|void,
):Promise<{checkpoint:DebtBackfillCheckpoint;summary:DebtBackfillSummary}> {
  assertOptions(o);
  if(resume)assertCheckpoint(resume,o);
  const initial=await retry(()=>rpc.viewAccount(o.lendingContract,resume?Number(resume.blockHeight):undefined),o.maxRetries);
  const height=Number(initial.blockHeight);
  if(!validInt(height,1,Number.MAX_SAFE_INTEGER))throw Error('invalid finalized block');
  if(o.expectedLendingCodeHash&&initial.codeHash!==o.expectedLendingCodeHash)throw Error('PINNED_LENDING_CODE_HASH_MISMATCH');
  if(resume&&(initial.blockHeight!==resume.blockHeight||initial.codeHash!==resume.lendingCodeHash))throw Error('CHECKPOINT_BLOCK_OR_CODE_CHANGED');
  const [assets,totalView]=await Promise.all([
    retry(()=>rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},height),o.maxRetries),
    retry(()=>rpc.view<unknown>(o.lendingContract,'get_num_accounts',{},height),o.maxRetries),
  ]);
  if(assets.blockHeight!==String(height)||totalView.blockHeight!==String(height))throw Error('inconsistent block on market metadata');
  const pools=parseParityPools(assets.value);
  const total=accountCount(totalView.value);
  if(o.startIndex>total)throw Error('starting index exceeds account count');
  if(resume&&resume.totalAccounts!==total)throw Error('CHECKPOINT_MARKET_COUNT_CHANGED');
  const state:DebtBackfillCheckpoint=resume?structuredClone(resume):{
    version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,liquidationParityVerified:false,
    lendingContract:o.lendingContract,blockHeight:String(height),lendingCodeHash:initial.codeHash,
    codeHashPinProvided:!!o.expectedLendingCodeHash,totalAccounts:total,startIndex:o.startIndex,
    targetEndIndex:Math.min(total,o.startIndex+o.maxAccounts),nextIndex:o.startIndex,
    scannedAccounts:0,invalidAccounts:0,schemaReasons:{},seenAccountIds:[],findings:[],completeSnapshot:false,
  };
  const seen=new Set(state.seenAccountIds);
  // Resolve multiple bounded pages concurrently, then commit the results in index order.
  // Batch checkpointing means a failed batch can be safely retried from its beginning.
  while(state.nextIndex<state.targetEndIndex){
    const jobs:{index:number;limit:number}[]=[];
    let at=state.nextIndex;
    for(let n=0;n<o.concurrency&&at<state.targetEndIndex;n++){
      const limit=Math.min(o.pageSize,state.targetEndIndex-at);
      jobs.push({index:at,limit});at+=limit;
    }
    const pages=await Promise.all(jobs.map(async job=>{
      const v=await retry(()=>rpc.view<unknown>(o.lendingContract,'get_accounts_paged',
        {from_index:job.index,limit:job.limit},height),o.maxRetries);
      if(v.blockHeight!==String(height)||!Array.isArray(v.value)||v.value.length!==job.limit)
        throw Error('INCONSISTENT_BLOCK_OR_PAGE_LENGTH');
      return v.value;
    }));
    for(const pageRows of pages){
      for(const raw of pageRows){
        const record=safeObj(raw);
        const accountId=record.account_id;
        if(typeof accountId!=='string'||!ID.test(accountId)||seen.has(accountId))throw Error('INVALID_OR_DUPLICATE_ACCOUNT_INDEX');
        seen.add(accountId);state.seenAccountIds.push(accountId);
        state.scannedAccounts++;state.nextIndex++;
        try{const found=discoverDebtInAccount(record,pools);if(found)state.findings.push(found);}
        catch(err){state.invalidAccounts++;const category=reason(err);state.schemaReasons[category]=(state.schemaReasons[category]??0)+1;}
      }
    }
    state.completeSnapshot=state.startIndex===0&&state.nextIndex===total&&state.invalidAccounts===0;
    if(onCheckpoint)await onCheckpoint(structuredClone(state),summarizeDebtBackfill(state));
  }
  state.completeSnapshot=state.startIndex===0&&state.nextIndex===total&&state.invalidAccounts===0;
  return {checkpoint:state,summary:summarizeDebtBackfill(state)};
}
