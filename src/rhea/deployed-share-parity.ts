import type { NearReadOnlyRpc } from './rpc.ts';
import { sourceSharesToAmount } from './source-math.ts';

/**
 * Stage 9: differential check of a deployed lending contract's READ-ONLY
 * get_account balances against independent pool/share arithmetic.
 * No transaction methods, keys, prices, liquidation instructions or approvals.
 * The historical source arithmetic is not evidence that the deployed Wasm is
 * compiled from that source. A hash pin is a reviewed *observation*, not an audit.
 */
const ID = /^[a-z0-9._-]{2,64}$/;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const U128 = (1n << 128n) - 1n;

function record(v:unknown,label:string):Record<string,unknown> {
  if(v === null || typeof v !== 'object' || Array.isArray(v)) throw Error(`${label}: expected object`);
  return v as Record<string,unknown>;
}
function u128(v:unknown,label:string):bigint {
  if(typeof v !== 'string' || !/^(0|[1-9][0-9]{0,38})$/.test(v)) throw Error(`${label}: unsigned integer string required`);
  const n=BigInt(v);
  if(n > U128) throw Error(`${label}: overflows u128`);
  return n;
}
function borrowerCount(value:unknown):number {
  if(typeof value === 'number') {
    if(!Number.isSafeInteger(value)||value<0||value>20_000_000)throw Error('invalid total borrower count');
    return value;
  }
  // NEAR contracts may serialize u32 as JSON integer; a legacy RPC may return
  // a digit string. Share balances still require exact u128 strings.
  const count=u128(value,'total borrowers');
  if(count>20_000_000n)throw Error('invalid total borrower count');
  return Number(count);
}
function name(v:unknown,label:string):string {
  if(typeof v !== 'string' || !ID.test(v)) throw Error(`${label}: invalid account ID`);
  return v;
}
export interface ParityPool { supplied:{shares:bigint;balance:bigint}; borrowed:{shares:bigint;balance:bigint} }
export interface ShareMismatch { role:'collateral'|'borrowed'; tokenId:string; reason:'SHARES_MISMATCH'|'BALANCE_MISMATCH'; expected:string; observed:string }
export interface AccountShareParity { positionCount:number; mismatches:ShareMismatch[] }

/** Reject legacy/new contract schema ambiguity and all unrecognized assets. */
export function parseParityPools(raw:unknown):Map<string,ParityPool> {
  if(!Array.isArray(raw) || raw.length<1 || raw.length>256) throw Error('invalid asset pool list');
  const result=new Map<string,ParityPool>();
  for(const row of raw){
    if(!Array.isArray(row)||row.length!==2) throw Error('invalid asset tuple');
    const token=name(row[0],'asset');
    if(result.has(token)) throw Error('duplicate asset');
    const v=record(row[1],'asset');
    const parse=(key:'supplied'|'borrowed')=>{
      const p=record(v[key],key);
      const shares=u128(p.shares,`${token} ${key} shares`),balance=u128(p.balance,`${token} ${key} balance`);
      if(balance<shares) throw Error('pool balance < shares');
      return {shares,balance};
    };
    result.set(token,{supplied:parse('supplied'),borrowed:parse('borrowed')});
  }
  return result;
}

function pagedShares(raw:unknown,role:'collateral'|'borrowed',allowed:Map<string,ParityPool>):Map<string,bigint> {
  const account=record(raw,'paged account');
  if(account.positions !== undefined && account.positions !== null && Object.keys(record(account.positions,'isolated positions')).length>0)
    throw Error('UNSUPPORTED_ISOLATED_POSITIONS_FOR_SOURCE_PARITY');
  const parts=account[role];
  if(parts===null || parts===undefined) throw Error(`missing ${role} shares`);
  const found=new Map<string,bigint>();
  const push=(id:unknown,shares:unknown)=>{
    const key=name(id,'paged token');
    if(!allowed.has(key)||found.has(key))throw Error('unknown or duplicate paged token');
    const units=u128(shares,'paged shares');
    if(units>0n)found.set(key,units);
  };
  if(Array.isArray(parts)){
    if(parts.length>256)throw Error('too many paged positions');
    for(const part of parts){const r=record(part,'paged position');push(r.token_id,r.shares);}
  }else{
    const row=record(parts,'paged positions');if(Object.keys(row).length>256)throw Error('too many paged positions');
    for(const [id,amount] of Object.entries(row))push(id,amount);
  }
  return found;
}
function detailedParts(raw:unknown,role:'collateral'|'borrowed',allowed:Map<string,ParityPool>):Map<string,{shares:bigint;balance:bigint}> {
  const acc=record(raw,'detailed account');
  if(acc.positions !== undefined && acc.positions!==null && Object.keys(record(acc.positions,'detailed isolated positions')).length>0)
    throw Error('UNSUPPORTED_ISOLATED_POSITIONS_FOR_SOURCE_PARITY');
  const parts=acc[role];
  if(!Array.isArray(parts)||parts.length>256)throw Error(`unsupported detailed ${role} schema`);
  const found=new Map<string,{shares:bigint;balance:bigint}>();
  for(const part of parts){
    const r=record(part,'detailed position'),id=name(r.token_id,'detailed token');
    if(found.has(id)||!allowed.has(id))throw Error('unknown or duplicate detailed token');
    const shares=u128(r.shares,'detailed shares'),balance=u128(r.balance,'detailed balance');
    if(shares===0n)throw Error('zero-share detailed position');
    found.set(id,{shares,balance});
  }
  return found;
}

export function compareAccountShareParity(paged:unknown,detailed:unknown,pools:Map<string,ParityPool>):AccountShareParity {
  const p=record(paged,'paged account'),d=record(detailed,'detailed account');
  const pid=name(p.account_id,'paged borrower'),did=name(d.account_id,'detailed borrower');
  if(pid!==did)throw Error('BORROWER_ID_MISMATCH');
  const mismatches:ShareMismatch[]=[];
  let count=0;
  for(const role of ['collateral','borrowed'] as const){
    const pagedPositions=pagedShares(p,role,pools),details=detailedParts(d,role,pools);
    const tokens=new Set([...pagedPositions.keys(),...details.keys()]);
    for(const tokenId of tokens){
      const before=pagedPositions.get(tokenId),onchain=details.get(tokenId);
      if(before===undefined||onchain===undefined || before!==onchain.shares){
        mismatches.push({role,tokenId,reason:'SHARES_MISMATCH',expected:before?.toString()??'ABSENT',observed:onchain?.shares.toString()??'ABSENT'});
        continue;
      }
      const pool=pools.get(tokenId)![role==='borrowed'?'borrowed':'supplied'];
      const expected=sourceSharesToAmount(before,pool,role==='borrowed');
      if(expected!==onchain.balance)mismatches.push({role,tokenId,reason:'BALANCE_MISMATCH',expected:expected.toString(),observed:onchain.balance.toString()});
      count++;
    }
  }
  return {positionCount:count,mismatches};
}

export interface DeployedParitySettings {
  lendingContract:string;
  oracleContract:string;
  maxAccounts:number;
  pageSize:number;
  maxDetailedAccounts:number;
  expectedLendingCodeHash?:string;
  expectedOracleCodeHash?:string;
}
export interface DeployedShareReport {
  mode:'LIVE_READ_ONLY_SHARE_DIFFERENTIAL';
  status:'SAMPLED_SHARE_MATCH'|'SAMPLED_SHARE_MISMATCH'|'NO_BORROWERS_SAMPLED'|'UNSUPPORTED_ACCOUNT_SCHEMA';
  executionEnabled:false;
  deployedLiquidationParityVerified:false;
  priceParityVerified:false;
  shareMathSampledOnly:true;
  blockHeight:string;
  lendingCodeHash:string;
  oracleCodeHash:string;
  codeHashPinsProvided:boolean;
  checkedAccounts:number;
  examinedAccounts:number;
  totalAccounts:number;
  checkedPositions:number;
  mismatchedAccounts:number;
  mismatchCount:number;
  schemaFailures:number;
  warnings:string[];
}

/**
 * Reads public NEAR views exclusively. Unexpected response types abort. A
 * schema mismatch is reported, never transformed into an affirmative match.
 */
export async function probeDeployedShares(rpc:NearReadOnlyRpc,cfg:DeployedParitySettings):Promise<DeployedShareReport> {
  if(!ID.test(cfg.lendingContract)||!ID.test(cfg.oracleContract)||cfg.lendingContract===cfg.oracleContract)throw Error('invalid contract configuration');
  if(!Number.isSafeInteger(cfg.maxAccounts)||cfg.maxAccounts<1||cfg.maxAccounts>200)throw Error('maxAccounts must be 1..200');
  if(!Number.isSafeInteger(cfg.maxDetailedAccounts)||cfg.maxDetailedAccounts<1||cfg.maxDetailedAccounts>25)throw Error('maxDetailedAccounts must be 1..25');
  if(!Number.isSafeInteger(cfg.pageSize)||cfg.pageSize<1||cfg.pageSize>50)throw Error('pageSize must be 1..50');
  for(const h of [cfg.expectedLendingCodeHash,cfg.expectedOracleCodeHash])if(h!==undefined&&!HASH.test(h))throw Error('invalid code hash pin');
  const lending=await rpc.viewAccount(cfg.lendingContract);
  const height=Number(lending.blockHeight);
  if(!Number.isSafeInteger(height)||height<1)throw Error('invalid finalized block');
  const oracle=await rpc.viewAccount(cfg.oracleContract,height);
  if(cfg.expectedLendingCodeHash&&lending.codeHash!==cfg.expectedLendingCodeHash)throw Error('PINNED_LENDING_CODE_HASH_MISMATCH');
  if(cfg.expectedOracleCodeHash&&oracle.codeHash!==cfg.expectedOracleCodeHash)throw Error('PINNED_ORACLE_CODE_HASH_MISMATCH');
  const [assets,count] = await Promise.all([
    rpc.view<unknown>(cfg.lendingContract,'get_assets_paged',{},height),
    rpc.view<unknown>(cfg.lendingContract,'get_num_accounts',{},height),
  ]);
  if(assets.blockHeight!==String(height)||count.blockHeight!==String(height))throw Error('inconsistent pinned block');
  const pools=parseParityPools(assets.value);
  const total=borrowerCount(count.value);
  const sampleLimit=Math.min(total,cfg.maxAccounts);
  let examined=0,checked=0,checkedPositions=0,mismatched=0,mismatchCount=0,schemaFailures=0;
  let anyDebt=false;
  for(let index=0;index<sampleLimit && checked<cfg.maxDetailedAccounts;index+=cfg.pageSize){
    const limit=Math.min(cfg.pageSize,sampleLimit-index);
    const page=await rpc.view<unknown>(cfg.lendingContract,'get_accounts_paged',{from_index:index,limit},height);
    if(page.blockHeight!==String(height)||!Array.isArray(page.value)||page.value.length!==limit)throw Error('invalid borrower page or block');
    for(const raw of page.value){
      examined++;
      const row=record(raw,'paged borrower');
      name(row.account_id,'paged borrower');
      // Must not treat a malformed candidate as a debt-free account.
      let debts:Map<string,bigint>;
      try { debts=pagedShares(row,'borrowed',pools);pagedShares(row,'collateral',pools); }
      catch{schemaFailures++;continue;}
      if(debts.size===0)continue;
      anyDebt=true;
      const detail=await rpc.view<unknown>(cfg.lendingContract,'get_account',{account_id:row.account_id},height);
      if(detail.blockHeight!==String(height))throw Error('unmatched detailed borrower block');
      if(detail.value===null){schemaFailures++;continue;}
      try {
        const comparison=compareAccountShareParity(raw,detail.value,pools);
        checked++;checkedPositions+=comparison.positionCount;
        if(comparison.mismatches.length){mismatched++;mismatchCount+=comparison.mismatches.length;}
      }catch{schemaFailures++;}
      if(checked>=cfg.maxDetailedAccounts)break;
    }
  }
  const status:DeployedShareReport['status']=schemaFailures>0?'UNSUPPORTED_ACCOUNT_SCHEMA':
      mismatchCount>0?'SAMPLED_SHARE_MISMATCH': !anyDebt || checked===0?'NO_BORROWERS_SAMPLED':'SAMPLED_SHARE_MATCH';
  const warnings=['NOT_A_DEPLOYED_WASM_SOURCE_ATTESTATION','NO_PRICE_OR_LIQUIDATION_PARITY','NO_EXECUTION_AUTHORIZATION','FIRST_N_ACCOUNTS_NONREPRESENTATIVE'];
  if(!cfg.expectedLendingCodeHash||!cfg.expectedOracleCodeHash)warnings.push('CODE_HASH_PINS_NOT_INDEPENDENTLY_APPROVED');
  if(schemaFailures>0)warnings.push('UNSUPPORTED_OR_MALFORMED_BORROWER_SCHEMA');
  if(mismatchCount>0)warnings.push('SOURCE_SHARE_ARITHMETIC_DIFFERS_FROM_DEPLOYED_READS');
  if(checked===0)warnings.push('NO_FINANCIAL_ACCOUNT_DIFFERENTIAL_COMPLETED');
  return {mode:'LIVE_READ_ONLY_SHARE_DIFFERENTIAL',status,executionEnabled:false,deployedLiquidationParityVerified:false,
    priceParityVerified:false,shareMathSampledOnly:true,blockHeight:String(height),lendingCodeHash:lending.codeHash,
    oracleCodeHash:oracle.codeHash,codeHashPinsProvided:!!cfg.expectedLendingCodeHash&&!!cfg.expectedOracleCodeHash,
    checkedAccounts:checked,examinedAccounts:examined,totalAccounts:total,checkedPositions,
    mismatchedAccounts:mismatched,mismatchCount,schemaFailures,warnings};
}
