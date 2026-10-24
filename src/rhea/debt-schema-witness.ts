import type {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools} from './deployed-share-parity.ts';
import {discoverDebtInAccount, type DebtAccountFinding} from './debt-discovery.ts';

/** Independent Rhea SDK-shaped detailed view witness, never a liquidation oracle. */
const ID=/^[a-z0-9._-]{2,64}$/;
const POSITION=/^[A-Za-z0-9._:-]{1,100}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const MAX=(1n<<128n)-1n;
function obj(x:unknown):Record<string,unknown>{
 if(x===null||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_WITNESS_OBJECT');
 return x as Record<string,unknown>;
}
function validShares(x:unknown):bigint{
 if(typeof x!=='string'||!UINT.test(x)||BigInt(x)>MAX)throw Error('INVALID_WITNESS_SHARES');return BigInt(x);
}
function legs(raw:unknown,allowed:Set<string>):string[]{
 if(!Array.isArray(raw)||raw.length>256)throw Error('INVALID_WITNESS_BORROWED');
 const items=new Set<string>();const nonzero:string[]=[];
 for(const v of raw){const row=obj(v),id=row.token_id;
  if(typeof id!=='string'||!ID.test(id)||!allowed.has(id)||items.has(id))throw Error('INVALID_WITNESS_TOKEN');
  items.add(id);if(validShares(row.shares)>0n)nonzero.push(id);
 }
 return nonzero.sort();
}
export function detailedDebtPositions(raw:unknown,allowed:Set<string>):Map<string,string[]>{
 const acc=obj(raw),positions=obj(acc.positions);
 if(Object.keys(positions).length>64)throw Error('TOO_MANY_WITNESS_POSITIONS');
 const result=new Map<string,string[]>();
 for(const [key,value] of Object.entries(positions)){
  if(!POSITION.test(key))throw Error('INVALID_WITNESS_POSITION_ID');
  const p=obj(value);if(!Array.isArray(p.borrowed)||!Array.isArray(p.collateral))throw Error('MISSING_WITNESS_POSITION_LEGS');
  // Check collateral structure too even though it does not prove solvency.
  legs(p.collateral,allowed);
  const debts=legs(p.borrowed,allowed);
  if(debts.length)result.set(key,debts);
 }
 return result;
}
export function comparePagedToDetailedDebt(paged:DebtAccountFinding|null,detailed:Map<string,string[]>):boolean{
 // This witness only concerns isolated positions. Legacy default debt is
 // evaluated separately and must never be interpreted as position ID "0".
 if(paged?.positions.some(p=>p.positionId===null))throw Error('LEGACY_ACCOUNT_NEEDS_SEPARATE_VIEW');
 const expected=new Map((paged?.positions??[]).map(p=>[p.positionId!,p.debtAssetIds]));
 if(expected.size!==detailed.size)return false;
 for(const [id,tokens] of detailed){const a=expected.get(id);if(!a||a.join('|')!==tokens.join('|'))return false;}
 return true;
}
export interface WitnessOptions {lendingContract:string;sampleCount:number;pageSize:number;pinnedBlockHeight?:number}
export interface WitnessReport {
 mode:'RHEA_INDEPENDENT_BORROWER_SCHEMA_WITNESS';status:'SAMPLE_COMPATIBLE_UNAPPROVED'|'SCHEMA_MISMATCH'|'DETAILED_VIEW_UNAVAILABLE'|'NO_ACCOUNTS';
 executionEnabled:false;liquidationParityVerified:false;
 blockHeight:string;lendingCodeHash:string;totalAccounts:number;
 checkedAccounts:number;debtAccountsPaged:number;debtAccountsDetailed:number;mismatches:number;unavailable:number;invalid:number;
 sampledIndices:number[];warnings:string[];
}
export async function inspectRheaBorrowerWitness(rpc:NearReadOnlyRpc,o:WitnessOptions):Promise<WitnessReport>{
 if(!ID.test(o.lendingContract)||!Number.isSafeInteger(o.sampleCount)||o.sampleCount<1||o.sampleCount>48||
 !Number.isSafeInteger(o.pageSize)||o.pageSize<1||o.pageSize>10)throw Error('INVALID_WITNESS_SETTINGS');
 if(o.pinnedBlockHeight!==undefined&&(!Number.isSafeInteger(o.pinnedBlockHeight)||o.pinnedBlockHeight<1))throw Error('INVALID_WITNESS_PIN');
 const account=await rpc.viewAccount(o.lendingContract,o.pinnedBlockHeight);const height=Number(account.blockHeight);
 if(!Number.isSafeInteger(height)||height<1)throw Error('INVALID_WITNESS_BLOCK');
 const [poolsView,numView]=await Promise.all([rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},height),rpc.view<unknown>(o.lendingContract,'get_num_accounts',{},height)]);
 if(poolsView.blockHeight!==String(height)||numView.blockHeight!==String(height))throw Error('WITNESS_BLOCK_MISMATCH');
 const total=numView.value;
 if(typeof total!=='number'||!Number.isSafeInteger(total)||total<0||total>20_000_000)throw Error('INVALID_WITNESS_COUNT');
 const pools=parseParityPools(poolsView.value);const allowed=new Set(pools.keys());
 const sampledIndices:number[]=[];
 if(total>0){const n=Math.min(total,o.sampleCount);for(let i=0;i<n;i++)sampledIndices.push(n===1?0:Math.floor(i*(total-1)/(n-1)));}
 let checked=0,pagedDebt=0,detailedDebt=0,mismatches=0,unavailable=0,invalid=0;
 for(let i=0;i<sampledIndices.length;i+=o.pageSize){
  // Individually pinned sampled indices across the entire registry; max 48.
  const group=sampledIndices.slice(i,i+o.pageSize);
  for(const index of group){
   const page=await rpc.view<unknown>(o.lendingContract,'get_accounts_paged',{from_index:index,limit:1},height);
   if(page.blockHeight!==String(height)||!Array.isArray(page.value)||page.value.length!==1)throw Error('WITNESS_PAGED_BLOCK_OR_LENGTH');
   const raw=page.value[0];const row=obj(raw),id=row.account_id;
   if(typeof id!=='string'||!ID.test(id))throw Error('INVALID_WITNESS_ACCOUNT');
   let discovery:DebtAccountFinding|null;
   try{discovery=discoverDebtInAccount(raw,pools);}catch{invalid++;continue;}
   if(discovery)pagedDebt++;
   let view;
   try{view=await rpc.view<unknown>(o.lendingContract,'get_account_all_positions',{account_id:id},height);}
   catch{unavailable++;continue;}
   if(view.blockHeight!==String(height))throw Error('WITNESS_DETAILED_BLOCK_MISMATCH');
   try{
    const detailed=detailedDebtPositions(view.value,allowed);if(detailed.size)detailedDebt++;
    if(!comparePagedToDetailedDebt(discovery,detailed))mismatches++;
    checked++;
   }catch{invalid++;}
  }
 }
 const status:WitnessReport['status']=unavailable?'DETAILED_VIEW_UNAVAILABLE':mismatches||invalid?'SCHEMA_MISMATCH':total===0?'NO_ACCOUNTS':'SAMPLE_COMPATIBLE_UNAPPROVED';
 return {mode:'RHEA_INDEPENDENT_BORROWER_SCHEMA_WITNESS',status,executionEnabled:false,liquidationParityVerified:false,
 blockHeight:String(height),lendingCodeHash:account.codeHash,totalAccounts:total,checkedAccounts:checked,
 debtAccountsPaged:pagedDebt,debtAccountsDetailed:detailedDebt,mismatches,unavailable,invalid,sampledIndices,
 warnings:['DETERMINISTIC_WITNESS_SAMPLE_NOT_PROOF_OF_COMPLETE_DEBT_INDEX','DETAILED_SDK_SHAPED_VIEW_UNATTESTED_TO_DEPLOYED_WASM',
 'MARKET_POOL_DEBT_CAN_EXIST_WITHOUT_A_WITNESSED_DEBT_ACCOUNT','NO_LIQUIDATION_OR_PROFIT_APPROVAL']};
}
