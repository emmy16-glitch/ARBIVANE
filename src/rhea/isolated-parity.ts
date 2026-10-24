import type { NearReadOnlyRpc } from './rpc.ts';
import { sourceSharesToAmount } from './source-math.ts';
import { parseParityPools, type ParityPool } from './deployed-share-parity.ts';

/**
 * Stage 10 research-only comparator for Rhea's isolated positions.
 * The current Rhea Go SDK describes get_account_all_positions as
 * { supplied: AccountAssetBalance[], positions: Record<positionId, {supplied, collateral, borrowed}> }.
 * We compare each position by ID: never collapse positions or use a balance from a different position.
 * This models historical pool maths; it is NOT proof of current executable liquidation parity.
 */
const ACCOUNT=/^[a-z0-9._-]{2,64}$/;
const POSITION=/^[A-Za-z0-9._:-]{1,100}$/;
const U128_MAX=(1n<<128n)-1n;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
type Role='collateral'|'borrowed';
type Shares=Map<string,bigint>;
type Balances=Map<string,{shares:bigint;balance:bigint}>;
type PositionRoles={collateral:Shares;borrowed:Shares};
type DetailedRoles={collateral:Balances;borrowed:Balances};
export type PositionFailure='UNSUPPORTED_POSITION_SCHEMA'|'POSITION_ID_SET_MISMATCH'|'INCONSISTENT_POSITION_SHARES'|'POSITION_BALANCE_MISMATCH'|'VIEW_UNAVAILABLE';
function obj(v:unknown,label:string):Record<string,unknown>{
 if(v===null||typeof v!=='object'||Array.isArray(v))throw Error(`${label}: expected object`);
 return v as Record<string,unknown>;
}
function u128(v:unknown,label:string):bigint{
 if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(v))throw Error(`${label}: invalid u128 string`);
 const n=BigInt(v);if(n>U128_MAX)throw Error(`${label}: overflow`);return n;
}
function token(v:unknown,pools:Map<string,ParityPool>):string{
 if(typeof v!=='string'||!ACCOUNT.test(v)||!pools.has(v))throw Error('unknown position token');return v;
}
function ids(raw:unknown,label:string):Record<string,unknown>{
 const v=obj(raw,label);if(Object.keys(v).length>64)throw Error('too many isolated positions');
 for(const k of Object.keys(v))if(!POSITION.test(k))throw Error('invalid position identifier');
 return v;
}
function shares(raw:unknown,role:Role,pools:Map<string,ParityPool>):Shares{
 const ret:Shares=new Map();if(raw===undefined||raw===null)throw Error(`missing ${role}`);
 const add=(id:unknown,v:unknown)=>{const t=token(id,pools);if(ret.has(t))throw Error('duplicate position token');const n=u128(v,'position shares');if(n>0n)ret.set(t,n);};
 if(Array.isArray(raw)){
   if(raw.length>256)throw Error('position shares over limit');
   for(const r of raw){const row=obj(r,'position share row');add(row.token_id,row.shares);}
 }else{const rows=obj(raw,'position shares');if(Object.keys(rows).length>256)throw Error('position shares over limit');for(const [k,v] of Object.entries(rows))add(k,v);}
 return ret;
}
function details(raw:unknown,role:Role,pools:Map<string,ParityPool>):Balances{
 if(!Array.isArray(raw)||raw.length>256)throw Error(`invalid detailed ${role}`);
 const out:Balances=new Map();for(const entry of raw){const row=obj(entry,'detailed asset');const t=token(row.token_id,pools);
  if(out.has(t))throw Error('duplicate detailed asset');const sh=u128(row.shares,'detailed shares');const bal=u128(row.balance,'detailed balance');
  if(sh===0n)throw Error('zero-share detailed asset');out.set(t,{shares:sh,balance:bal});
 }return out;
}
export function parseIsolatedPaged(raw:unknown,pools:Map<string,ParityPool>):Map<string,PositionRoles>{
 const account=obj(raw,'paged account');
 if(typeof account.account_id!=='string'||!ACCOUNT.test(account.account_id))throw Error('invalid paged account ID');
 const positions=ids(account.positions,'paged isolated positions');
 if(!Object.keys(positions).length)throw Error('no isolated positions');
 // A future protocol may support both account-wide and isolated debt. Do not merge them.
 for(const role of ['borrowed','collateral'] as const){
  const global=account[role];if(global!==undefined&&global!==null){
   if(Array.isArray(global)?global.length>0:Object.keys(obj(global,'top-level position')).length>0)throw Error('ambiguous top-level financial position');
  }
 }
 const out=new Map<string,PositionRoles>();
 for(const [id,value] of Object.entries(positions)){
  const v=obj(value,'paged isolated position');
  out.set(id,{collateral:shares(v.collateral??[], 'collateral',pools),borrowed:shares(v.borrowed??[],'borrowed',pools)});
 }return out;
}
export function parseIsolatedDetailed(raw:unknown,pools:Map<string,ParityPool>):Map<string,DetailedRoles>{
 const account=obj(raw,'account_all_positions');const positions=ids(account.positions,'detailed positions');
 // supplied outside positions isn't used to finance isolated debt: validate its shape.
 if(account.supplied!==undefined&&!Array.isArray(account.supplied))throw Error('invalid external supplied list');
 const out=new Map<string,DetailedRoles>();for(const [id,value] of Object.entries(positions)){
  const v=obj(value,'detailed isolated position');
  out.set(id,{collateral:details(v.collateral??[],'collateral',pools),borrowed:details(v.borrowed??[],'borrowed',pools)});
 }return out;
}
export interface PositionDiff {status:'MATCH'|'MISMATCH';comparedPositions:number;comparedLegs:number; mismatches:Partial<Record<Exclude<PositionFailure,'VIEW_UNAVAILABLE'|'UNSUPPORTED_POSITION_SCHEMA'>,number>>}
export function compareIsolatedPositions(paged:unknown,detailed:unknown,pools:Map<string,ParityPool>):PositionDiff{
 const left=parseIsolatedPaged(paged,pools),right=parseIsolatedDetailed(detailed,pools);
 const mismatches:PositionDiff['mismatches']={};const mark=(r:keyof typeof mismatches)=>{mismatches[r]=(mismatches[r]??0)+1;};
 let legs=0;
 const positions=new Set([...left.keys(),...right.keys()]);
 for(const id of positions){const p=left.get(id),d=right.get(id);
  if(!p||!d){mark('POSITION_ID_SET_MISMATCH');continue;}
  for(const role of ['borrowed','collateral'] as const){
   const all=new Set([...p[role].keys(),...d[role].keys()]);
   for(const t of all){const n=p[role].get(t),v=d[role].get(t);
    if(n===undefined||v===undefined||n!==v.shares){mark('INCONSISTENT_POSITION_SHARES');continue;}
    const pool=pools.get(t)![role==='borrowed'?'borrowed':'supplied'];
    const expected=sourceSharesToAmount(n,pool,role==='borrowed');
    if(expected!==v.balance)mark('POSITION_BALANCE_MISMATCH');
    legs++;
   }
  }
 }
 return {status:Object.keys(mismatches).length?'MISMATCH':'MATCH',comparedPositions:positions.size,comparedLegs:legs,mismatches};
}
export interface IsolatedProbeOptions {
 lendingContract:string;oracleContract:string;maxAccounts:number;pageSize:number;maxDetails:number;
 expectedLendingCodeHash?:string;expectedOracleCodeHash?:string;
}
export interface IsolatedProbeReport {
 mode:'READ_ONLY_ISOLATED_POSITION_DIFFERENTIAL';
 status:'SAMPLED_POSITION_MATCH_UNAPPROVED'|'POSITION_MISMATCH'|'UNSUPPORTED_POSITION_SCHEMA'|'VIEW_UNAVAILABLE'|'NO_ELIGIBLE_POSITIONS';
 executionEnabled:false;liquidationParityVerified:false;priceParityVerified:false;
 blockHeight:string;observedLendingCodeHash:string;observedOracleCodeHash:string;
 examinedAccounts:number;matchedAccounts:number;comparedLegs:number;totalAccounts:number;
 sampleMethod:'DETERMINISTIC_SPREAD_WINDOWS'|'FIRST_N_WHEN_SMALL';sampledWindows:number;
 rejectedAccounts:number;positionMismatches:number;schemaReasons:Record<string,number>;
 warnings:string[];
}
function count(v:unknown):number{
 if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=20_000_000)return v;
 if(typeof v==='string'&&/^(0|[1-9][0-9]{0,7})$/.test(v)&&BigInt(v)<=20_000_000n)return Number(v);
 throw Error('invalid account count');
}
export async function probeRheaIsolatedPositions(rpc:NearReadOnlyRpc,cfg:IsolatedProbeOptions):Promise<IsolatedProbeReport>{
 if(!ACCOUNT.test(cfg.lendingContract)||!ACCOUNT.test(cfg.oracleContract)||cfg.lendingContract===cfg.oracleContract)throw Error('invalid contracts');
 if(!Number.isSafeInteger(cfg.maxAccounts)||cfg.maxAccounts<1||cfg.maxAccounts>100)throw Error('invalid maxAccounts');
 if(!Number.isSafeInteger(cfg.maxDetails)||cfg.maxDetails<1||cfg.maxDetails>20)throw Error('invalid maxDetails');
 if(!Number.isSafeInteger(cfg.pageSize)||cfg.pageSize<1||cfg.pageSize>30)throw Error('invalid pageSize');
 for(const h of [cfg.expectedLendingCodeHash,cfg.expectedOracleCodeHash])if(h!==undefined&&!HASH.test(h))throw Error('invalid code hash pin');
 const lending=await rpc.viewAccount(cfg.lendingContract);const height=Number(lending.blockHeight);
 if(!Number.isSafeInteger(height)||height<1)throw Error('invalid finalized block');
 const oracle=await rpc.viewAccount(cfg.oracleContract,height);
 if(cfg.expectedLendingCodeHash&&cfg.expectedLendingCodeHash!==lending.codeHash)throw Error('lending code hash mismatch');
 if(cfg.expectedOracleCodeHash&&cfg.expectedOracleCodeHash!==oracle.codeHash)throw Error('oracle code hash mismatch');
 const [assets,num]=await Promise.all([rpc.view<unknown>(cfg.lendingContract,'get_assets_paged',{},height),rpc.view<unknown>(cfg.lendingContract,'get_num_accounts',{},height)]);
 if(assets.blockHeight!==String(height)||num.blockHeight!==String(height))throw Error('unmatched pinned block');
 const pools=parseParityPools(assets.value),total=count(num.value),max=Math.min(total,cfg.maxAccounts);
 const reasons:Record<string,number>={};let examined=0,matched=0,rejected=0,diffs=0,legs=0,called=0,unavailable=0;
 const mark=(code:string)=>{reasons[code]=(reasons[code]??0)+1;};
 const seen=new Set<string>();
 const windows=Math.ceil(max/cfg.pageSize);
 const spaced=total>max*2 && windows>1;
 for(let window=0;window<windows;window++){
  const size=Math.min(cfg.pageSize,max-window*cfg.pageSize);
  const start=spaced?Math.floor((total-size)*window/(windows-1)):window*cfg.pageSize;
  const page=await rpc.view<unknown>(cfg.lendingContract,'get_accounts_paged',{from_index:start,limit:size},height);
  if(page.blockHeight!==String(height)||!Array.isArray(page.value)||page.value.length!==size)throw Error('borrower page inconsistent');
  for(const raw of page.value){examined++;
   const row=obj(raw,'borrower row');const id=row.account_id;
   if(typeof id!=='string'||!ACCOUNT.test(id)||seen.has(id))throw Error('invalid or repeated borrower identifier');seen.add(id);
   if(row.positions===undefined||row.positions===null||!Object.keys(obj(row.positions,'paged positions')).length)continue;
   let positions:Map<string,PositionRoles>;
   try{positions=parseIsolatedPaged(raw,pools);}catch{rejected++;mark('PAGED_POSITION_SCHEMA');continue;}
   if(![...positions.values()].some(p=>p.borrowed.size>0))continue;
   if(called>=cfg.maxDetails)continue;
   called++;
   let view;
   try{view=await rpc.view<unknown>(cfg.lendingContract,'get_account_all_positions',{account_id:id},height);}catch{unavailable++;mark('DETAIL_VIEW_UNAVAILABLE');continue;}
   if(view.blockHeight!==String(height))throw Error('detailed positions block inconsistent');
   if(view.value===null){rejected++;mark('DETAIL_MISSING');continue;}
   try{const d=compareIsolatedPositions(raw,view.value,pools);legs+=d.comparedLegs;
    if(d.status==='MATCH'&&d.comparedLegs>0)matched++;else {diffs++;for(const [key,v] of Object.entries(d.mismatches))reasons[key]=(reasons[key]??0)+(v??0);}
   }catch{rejected++;mark('DETAILED_POSITION_SCHEMA');}
  }
 }
 const status:IsolatedProbeReport['status']=unavailable?'VIEW_UNAVAILABLE':rejected?'UNSUPPORTED_POSITION_SCHEMA':diffs?'POSITION_MISMATCH':matched?'SAMPLED_POSITION_MATCH_UNAPPROVED':'NO_ELIGIBLE_POSITIONS';
 return {mode:'READ_ONLY_ISOLATED_POSITION_DIFFERENTIAL',status,executionEnabled:false,liquidationParityVerified:false,priceParityVerified:false,
   blockHeight:String(height),observedLendingCodeHash:lending.codeHash,observedOracleCodeHash:oracle.codeHash,
   examinedAccounts:examined,matchedAccounts:matched,comparedLegs:legs,totalAccounts:total,
   sampleMethod:spaced?'DETERMINISTIC_SPREAD_WINDOWS':'FIRST_N_WHEN_SMALL',sampledWindows:windows,rejectedAccounts:rejected,
   positionMismatches:diffs,schemaReasons:reasons,
   warnings:['HISTORICAL_SOURCE_NOT_DEPLOYED_CODE_PROVENANCE','DETERMINISTIC_INDEX_SAMPLE_NOT_RANDOM_OR_COMPLETE','NO_PRICE_OR_LIQUIDATION_PARITY','NO_EXECUTION_AUTHORIZATION',
     ...(!cfg.expectedLendingCodeHash||!cfg.expectedOracleCodeHash?['CODE_HASH_PINS_NOT_APPROVED']:[])]};
}
