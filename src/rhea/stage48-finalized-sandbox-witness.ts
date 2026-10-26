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
/** A 10,000-block finalized clock advance can legitimately accrue interest
 * against unchanged Rhea shares. Ignore ONLY accrued displayed `balance` and
 * `apr` fields where every actual token/share coordinate is well formed.
 * Everything else (positions, farm ids, amount ownership, token identities,
 * actual FT holdings) remains EXACT; any ambiguous schema uses strict equality.
 */
function persistedShareAccounting(raw:unknown):string|null {
 if(!plain(raw))return null;
 try {
  const data=JSON.parse(JSON.stringify(raw)) as Record<string,unknown>;
  if(typeof data.account_id!=='string'||!data.account_id)return null;
  let observed=0;
  const norm=(rawRows:unknown):boolean=>{
   if(!Array.isArray(rawRows)||rawRows.length>256)return false;
   const tokens=new Set<string>();
   for(const v of rawRows){
    if(!plain(v))return false;
    const row=v as Record<string,unknown>;
    if(typeof row.token_id!=='string'||tokens.has(row.token_id)||
     typeof row.balance!=='string'||!/^(0|[1-9][0-9]*)$/.test(row.balance)||
     typeof row.shares!=='string'||!/^(0|[1-9][0-9]*)$/.test(row.shares)||
     typeof row.apr!=='string'||!/^[0-9]+(?:\\.[0-9]+)?$/.test(row.apr))
     return false;
    tokens.add(row.token_id);
    row.balance='ACTUAL_ACCRUED_BALANCE';row.apr='ACCRUED_APR';
    observed++;
   }
   return true;
  };
  if(!norm(data.supplied))return null;
  if(!plain(data.positions))return null;
  const positions=data.positions as Record<string,unknown>;
  for(const value of Object.values(positions)){
   if(!plain(value))return null;
   const pos=value as Record<string,unknown>;
   if(!norm(pos.borrowed)||!norm(pos.collateral))return null;
  }
  if(observed===0)return null;
  return JSON.stringify(data);
 }catch{return null;}
}
function persistentAtAccruingClock(before:Stage48PositionSnapshot,
 after:Stage48PositionSnapshot):boolean{
 if(before.repayFt!==after.repayFt||before.seizeFt!==after.seizeFt)return false;
 const b1=persistedShareAccounting(before.borrower);
 const b2=persistedShareAccounting(after.borrower);
 const a1=persistedShareAccounting(before.actor);
 const a2=persistedShareAccounting(after.actor);
 // Mixed valid/invalid schemas cannot accidentally weaken matching.
 const borrowOk=b1!==null&&b2!==null?b1===b2:
  JSON.stringify(before.borrower)===JSON.stringify(after.borrower);
 const actorOk=a1!==null&&a2!==null?a1===a2:
  JSON.stringify(before.actor)===JSON.stringify(after.actor);
 return borrowOk&&actorOk;
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
 // Require an actual borrower mutation first. Rhea displayed lending
 // balances/APRs can legitimately accrue during 10k finalized Sandbox blocks;
 // all token/share coordinates and both NEP-141 balances MUST persist exactly.
 // Unsupported/ambiguous layouts continue to require exact JSON equality.
 if(JSON.stringify(before.borrower)===JSON.stringify(immediatelyAfter.borrower)||
  !persistentAtAccruingClock(immediatelyAfter,afterFinalBlock))
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
