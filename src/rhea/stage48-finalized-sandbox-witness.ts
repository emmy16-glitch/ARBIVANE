import type {SandboxResult} from './stage37-sandbox-liquidation.ts';

/** Stage48: do not promote a NEAR Workspaces optimistic callback to success
 * without a later finalized Sandbox block and unchanged independently read
 * borrower, actor, and NEP-141 state. This is NOT on-chain tx finality.
 */
export interface Stage48PositionSnapshot {
 borrower:unknown;actor:unknown;repayFt:unknown;seizeFt:unknown;
}
function plain(v:unknown):boolean {
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 try { const text=JSON.stringify(v);return text.length>2&&text.length<5_000_000; }
 catch {return false;}
}
function balance(v:unknown):boolean{
 return typeof v==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(v);
}
function valid(s:Stage48PositionSnapshot):boolean {
 return s!==null&&typeof s==='object'&&plain(s.borrower)&&plain(s.actor)&&
  balance(s.repayFt)&&balance(s.seizeFt);
}

/** Passive lending interest changes displayed underlying balances without
 * changing shares. Accept only tightly bounded, nonnegative interest accrual
 * between two independently queried finalized snapshots. Never ignore
 * collateral/debt share movement or an FT transfer. */
function stableLegs(a:unknown,b:unknown):boolean{
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||a.length>256)return false;
 const rows=new Map<string,{balance:bigint;shares:string}>();
 for(const x of a){
  if(!x||typeof x!=='object'||typeof x.token_id!=='string'||
   !/^[a-z0-9._-]{2,64}$/.test(x.token_id)||rows.has(x.token_id)||
   !balance(x.balance)||!balance(x.shares))return false;
  rows.set(x.token_id,{balance:BigInt(x.balance),shares:x.shares});
 }
 const seen=new Set<string>();
 for(const x of b){
  if(!x||typeof x!=='object'||typeof x.token_id!=='string'||seen.has(x.token_id)||
   !balance(x.balance)||!balance(x.shares))return false;
  const first=rows.get(x.token_id);
  if(!first||first.shares!==x.shares)return false;
  const later=BigInt(x.balance);
  // Up to ONE basis point, plus one smallest internal rounding unit.
  if(later<first.balance||
   later-first.balance>first.balance/10000n+1n)return false;
  seen.add(x.token_id);
 }
 return true;
}
function stableAccount(a:unknown,b:unknown):boolean{
 if(!plain(a)||!plain(b))return false;
 const x=a as Record<string,any>,y=b as Record<string,any>;
 if(typeof x.account_id!=='string'||x.account_id!==y.account_id||
  x.is_locked!==y.is_locked||x.has_non_farmed_assets!==y.has_non_farmed_assets||
  !stableLegs(x.supplied,y.supplied)||!plain(x.positions)||!plain(y.positions))
  return false;
 const xp=x.positions as Record<string,any>,yp=y.positions as Record<string,any>;
 if(Object.keys(xp).length!==Object.keys(yp).length||
  Object.keys(xp).length>64)return false;
 for(const [key,pos] of Object.entries(xp)){
  if(!Object.hasOwn(yp,key)||!plain(pos)||!plain(yp[key])||
   !stableLegs(pos.borrowed,yp[key].borrowed)||
   !stableLegs(pos.collateral,yp[key].collateral))
   return false;
 }
 return true;
}
export function stage131FinancialPersistence(
 immediate:Stage48PositionSnapshot,finalized:Stage48PositionSnapshot
):boolean{
 if(!valid(immediate)||!valid(finalized))return false;
 if(immediate.repayFt!==finalized.repayFt||
  immediate.seizeFt!==finalized.seizeFt)return false;
 // The exact match remains accepted. The economic projection only permits
 // independently bounded passive interest, never a changed share or FT.
 return JSON.stringify(immediate)===JSON.stringify(finalized)||
  (stableAccount(immediate.borrower,finalized.borrower)&&
   stableAccount(immediate.actor,finalized.actor));
}

export function attestStage48FinalizedSandboxReplay(input:{
 receipt:SandboxResult;before:Stage48PositionSnapshot;
 immediatelyAfter:Stage48PositionSnapshot;afterFinalBlock:Stage48PositionSnapshot;
 finalizedBlockBefore:number;finalizedBlockAfter:number;
}):SandboxResult{
 const {receipt,before,immediatelyAfter,afterFinalBlock}=input;
 if(!receipt||receipt.mode!=='ARBIVANE_STAGE37_SANDBOX_RESULT'||
  receipt.chain!=='NEAR_SANDBOX'||receipt.realMainnetExecuted!==false||
  receipt.realProfitVerified!==false||receipt.mayBroadcastMainnet!==false||
  receipt.executionEnabled!==false||receipt.attemptedTransaction!==true||
  !['FINAL','EXECUTED_OPTIMISTIC'].includes(String(receipt.transactionExecutionStatus))||
  !['ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE',
    'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'].includes(receipt.status)||
  (receipt.transactionExecutionStatus==='FINAL')!==receipt.transactionFinal||
  (receipt.transactionExecutionStatus==='EXECUTED_OPTIMISTIC'&&
   receipt.status!=='ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE')||
  receipt.failedReceiptCount!==0||!Number.isSafeInteger(receipt.receiptCount)||
  receipt.receiptCount<1||receipt.persistedAtLaterFinalizedBlock===true)
  throw Error('STAGE48_UNTRUSTED_OR_FAILED_CALLBACK_REPORT');
 if(!Number.isSafeInteger(input.finalizedBlockBefore)||
  !Number.isSafeInteger(input.finalizedBlockAfter)||
  input.finalizedBlockBefore<1||
  input.finalizedBlockAfter<input.finalizedBlockBefore+2||
  !valid(before)||!valid(immediatelyAfter)||!valid(afterFinalBlock))
  throw Error('STAGE48_INCOMPLETE_FINALIZED_STATE_EVIDENCE');
 // Require at least actual borrower mutation; Stage41 additionally demands
 // positive debt/collateral deltas, actor solvency and seized FT proceeds.
 if(JSON.stringify(before.borrower)===JSON.stringify(immediatelyAfter.borrower)||
  !stage131FinancialPersistence(immediatelyAfter,afterFinalBlock))
  throw Error('STAGE48_STATE_CHANGE_OR_LATER_PERSISTENCE_NOT_VERIFIED');
 return {...receipt,
  status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
  persistedAtLaterFinalizedBlock:true,
  finalizedBlockBefore:input.finalizedBlockBefore,
  finalizedBlockAfter:input.finalizedBlockAfter,
  blockers:[
   ...receipt.blockers.filter(x=>x!=='OPTIMISTIC_TRANSACTION_REQUIRES_LATER_FINALIZED_SANDBOX_STATE_PROOF'),
   ...(receipt.transactionExecutionStatus==='EXECUTED_OPTIMISTIC'?
    ['ORIGINAL_TRANSACTION_STATUS_OPTIMISTIC_NOT_ATTESTED_AS_FINAL']:[]),
  ],
 };
}
