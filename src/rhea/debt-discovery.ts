import type { NearReadOnlyRpc } from './rpc.ts';
import { parseParityPools, type ParityPool } from './deployed-share-parity.ts';

/**
 * Stage 11. An index-range scanner for public Rhea debt shares. This is NOT a
 * liquidation opportunity finder: prices, health, solvency, funding, and
 * deployed-Wasm parity remain unknown. No wallet or transaction interface.
 */
const ACCOUNT=/^[a-z0-9._-]{2,64}$/;
const POSITION=/^[A-Za-z0-9._:-]{1,100}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const MAX_U128=(1n<<128n)-1n;
const MAX_ACCOUNTS_TOTAL=20_000_000;
type ObjectMap=Record<string,unknown>;
function obj(v:unknown,what:string):ObjectMap {
 if(v===null||typeof v!=='object'||Array.isArray(v))throw Error(`invalid ${what}`);
 return v as ObjectMap;
}
function id(v:unknown,what:string):string {
 if(typeof v!=='string'||!ACCOUNT.test(v))throw Error(`invalid ${what}`);
 return v;
}
function positiveSafeCount(v:unknown):number {
 if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=MAX_ACCOUNTS_TOTAL)return v;
 if(typeof v==='string'&&/^(0|[1-9][0-9]{0,7})$/.test(v)&&Number(v)<=MAX_ACCOUNTS_TOTAL)return Number(v);
 throw Error('invalid on-chain account count');
}
function atomicShares(v:unknown):bigint {
 if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(v))throw Error('invalid exact u128 shares');
 const n=BigInt(v);if(n>MAX_U128)throw Error('u128 shares overflow');return n;
}
function shares(raw:unknown,allowed:Map<string,ParityPool>,role:string):Map<string,bigint> {
 if(raw===undefined||raw===null)throw Error(`missing ${role} field`);
 const out=new Map<string,bigint>();
 const add=(v:unknown,s:unknown)=>{
  const token=id(v,'debt token');if(!allowed.has(token)||out.has(token))throw Error('unknown or duplicate asset');
  const n=atomicShares(s);out.set(token,n);
 };
 if(Array.isArray(raw)){
  if(raw.length>256)throw Error('too many debt assets');
  for(const entry of raw){const r=obj(entry,'share row');add(r.token_id,r.shares);}
 }else{
  const r=obj(raw,'share map');if(Object.keys(r).length>256)throw Error('too many debt assets');
  for(const [key,value] of Object.entries(r))add(key,value);
 }
 return new Map([...out].filter(([,value])=>value>0n));
}
function nonempty(v:unknown):boolean {
 if(v===undefined||v===null)return false;
 if(Array.isArray(v))return v.length>0;
 return Object.keys(obj(v,'top-level role')).length>0;
}
export interface DebtPositionFinding {
  /** Null is the distinct, legacy account-wide position, never position ID 0. */
  positionId:string|null;
  debtAssetIds:string[];
  collateralRecorded:boolean;
}
export interface DebtAccountFinding {
  accountId:string;
  positions:DebtPositionFinding[];
  classification:'DEBT_SHARES_DISCOVERED_UNVALUED';
}
/** Validate one public paged borrower without assuming an omitted field means zero debt. */
export function discoverDebtInAccount(raw:unknown,pools:Map<string,ParityPool>):DebtAccountFinding|null {
 const account=obj(raw,'borrower');const accountId=id(account.account_id,'borrower ID');
 const result:DebtPositionFinding[]=[];
 const isolated=account.positions;
 if(isolated!==undefined&&isolated!==null){
  const positions=obj(isolated,'isolated positions');
  const entries=Object.entries(positions);
  if(entries.length>64)throw Error('too many isolated positions');
  if(entries.length>0&&nonempty(account.borrowed))throw Error('ambiguous account-wide and isolated debt');
  for(const [positionId,rawPosition] of entries){
   if(!POSITION.test(positionId))throw Error('invalid isolated position ID');
   const position=obj(rawPosition,'isolated position');
   // With current Rhea position objects, omitted roles mean no holding in
   // that position. Still validate each role that is supplied.
   const debt=shares(position.borrowed??[],pools,'isolated borrowed');
   const collateral=shares(position.collateral??[],pools,'isolated collateral');
   if(debt.size>0)result.push({positionId,debtAssetIds:[...debt.keys()].sort(),collateralRecorded:collateral.size>0});
  }
  if(entries.length===0&&nonempty(account.borrowed)){
   // A valid empty positions map can coexist with legacy account-wide debt.
   const debt=shares(account.borrowed,pools,'account-wide borrowed');
   const collateral=shares(account.collateral??[],pools,'account-wide collateral');
   if(debt.size>0)result.push({positionId:null,debtAssetIds:[...debt.keys()].sort(),collateralRecorded:collateral.size>0});
  }
 } else {
  // Absence of both `positions` and `borrowed` is *not* a clean borrower.
  const debt=shares(account.borrowed,pools,'account-wide borrowed');
  const collateral=shares(account.collateral??[],pools,'account-wide collateral');
  if(debt.size>0)result.push({positionId:null,debtAssetIds:[...debt.keys()].sort(),collateralRecorded:collateral.size>0});
 }
 if(!result.length)return null;
 result.sort((a,b)=>String(a.positionId).localeCompare(String(b.positionId)));
 return {accountId,positions:result,classification:'DEBT_SHARES_DISCOVERED_UNVALUED'};
}
export interface DebtDiscoverySettings {
 lendingContract:string;
 fromIndex:number;
 maxAccounts:number;
 pageSize:number;
 maxFindings:number;
 expectedLendingCodeHash?:string;
}
export interface DebtDiscoveryReport {
 mode:'READ_ONLY_DEBT_INDEX';
 executionEnabled:false;
 liquidationParityVerified:false;
 pricesVerified:false;
 eligibilityVerified:false;
 status:'WINDOW_SCANNED_UNAPPROVED'|'SCHEMA_ERRORS_DETECTED'|'FINDING_LIMIT_REACHED';
 blockHeight:string;
 observedLendingCodeHash:string;
 codeHashPinProvided:boolean;
 fromIndex:number;
 nextOffset:number;
 totalAccounts:number;
 scannedAccounts:number;
 invalidAccounts:number;
 schemaReasons:Record<string,number>;
 findingCount:number;
 findings:DebtAccountFinding[];
 completeIndexEnumeration:boolean;
 warnings:string[];
}
function validate(cfg:DebtDiscoverySettings):void {
 if(!ACCOUNT.test(cfg.lendingContract))throw Error('invalid lending contract');
 const valid=(n:number,lower:number,upper:number)=>Number.isSafeInteger(n)&&n>=lower&&n<=upper;
 if(!valid(cfg.fromIndex,0,MAX_ACCOUNTS_TOTAL))throw Error('invalid fromIndex');
 if(!valid(cfg.maxAccounts,1,1000))throw Error('maxAccounts must be 1..1000');
 if(!valid(cfg.pageSize,1,50))throw Error('pageSize must be 1..50');
 if(!valid(cfg.maxFindings,1,100))throw Error('maxFindings must be 1..100');
 if(cfg.expectedLendingCodeHash!==undefined&&!HASH.test(cfg.expectedLendingCodeHash))throw Error('invalid code hash pin');
}
function schemaReason(error:unknown):string {
 const m=error instanceof Error?error.message:'';
 if(m.includes('ambiguous'))return 'AMBIGUOUS_POSITION_SCOPES';
 if(m.includes('missing'))return 'MISSING_POSITION_FIELDS';
 if(m.includes('unknown or duplicate'))return 'UNKNOWN_OR_DUPLICATE_ASSET';
 if(m.includes('u128')||m.includes('shares'))return 'INVALID_SHARES';
 return 'UNSUPPORTED_BORROWER_SCHEMA';
}
/** A nextOffset checkpoint never implies that a later run uses the same block. */
export async function scanRheaDebtWindow(rpc:NearReadOnlyRpc,cfg:DebtDiscoverySettings):Promise<DebtDiscoveryReport>{
 validate(cfg);
 const lending=await rpc.viewAccount(cfg.lendingContract);
 const height=Number(lending.blockHeight);
 if(!Number.isSafeInteger(height)||height<1)throw Error('invalid finalized block height');
 if(cfg.expectedLendingCodeHash&&cfg.expectedLendingCodeHash!==lending.codeHash)throw Error('PINNED_LENDING_CODE_HASH_MISMATCH');
 const [assets,count]=await Promise.all([
  rpc.view<unknown>(cfg.lendingContract,'get_assets_paged',{},height),
  rpc.view<unknown>(cfg.lendingContract,'get_num_accounts',{},height),
 ]);
 if(assets.blockHeight!==String(height)||count.blockHeight!==String(height))throw Error('inconsistent initial snapshot block');
 const pools=parseParityPools(assets.value);
 const total=positiveSafeCount(count.value);
 if(cfg.fromIndex>total)throw Error('cursor exceeds on-chain account count');
 const end=Math.min(total,cfg.fromIndex+cfg.maxAccounts);
 let index=cfg.fromIndex,scanned=0,invalid=0;
 const findings:DebtAccountFinding[]=[];
 const seen=new Set<string>();
 const reasons:Record<string,number>={};
 let capReached=false;
 while(index<end&&!capReached){
  const limit=Math.min(cfg.pageSize,end-index);
  const page=await rpc.view<unknown>(cfg.lendingContract,'get_accounts_paged',{from_index:index,limit},height);
  if(page.blockHeight!==String(height)||!Array.isArray(page.value)||page.value.length!==limit)throw Error('inconsistent borrower page or pinned block');
  for(const raw of page.value){
   // A page read may be larger than the current finding budget. The exact
   // processed offset (not end of fetched page) is returned for safe resume.
   const row=obj(raw,'paged borrower');
   const borrower=id(row.account_id,'paged borrower ID');
   if(seen.has(borrower))throw Error('duplicate borrower across scanned index range');
   seen.add(borrower);
   index++;scanned++;
   try {
    const finding=discoverDebtInAccount(row,pools);
    if(finding)findings.push(finding);
   }catch(err){invalid++;const reason=schemaReason(err);reasons[reason]=(reasons[reason]??0)+1;}
   if(findings.length>=cfg.maxFindings){capReached=true;break;}
  }
 }
 const status:DebtDiscoveryReport['status']=invalid>0?'SCHEMA_ERRORS_DETECTED':capReached?'FINDING_LIMIT_REACHED':'WINDOW_SCANNED_UNAPPROVED';
 return {mode:'READ_ONLY_DEBT_INDEX',executionEnabled:false,liquidationParityVerified:false,pricesVerified:false,eligibilityVerified:false,
   status,blockHeight:String(height),observedLendingCodeHash:lending.codeHash,codeHashPinProvided:!!cfg.expectedLendingCodeHash,
   fromIndex:cfg.fromIndex,nextOffset:index,totalAccounts:total,scannedAccounts:scanned,invalidAccounts:invalid,
   schemaReasons:reasons,findingCount:findings.length,findings,completeIndexEnumeration:cfg.fromIndex===0&&index===total&&invalid===0,
   warnings:['BORROWED_SHARES_ARE_NOT_LIQUIDATION_ELIGIBILITY','BLOCK_HEIGHT_MAY_CHANGE_BETWEEN_CHECKPOINTS',
     'INDEX_PAGINATION_CAN_SHIFT_ACROSS_RUNS','NO_MARKET_ORACLE_OR_REALIZED_PROFIT_VERIFIED','NO_TRANSACTION_OR_CUSTODY_AUTHORIZATION',
     ...(!cfg.expectedLendingCodeHash?['CODE_HASH_NOT_INDEPENDENTLY_APPROVED']:[])]};
}
