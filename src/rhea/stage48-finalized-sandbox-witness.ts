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
 // Rhea's balance and APR are time-derived and change when a Sandbox
 // fastForward advances 9,000+ blocks. Farm metadata can also change. Those
 // are NOT a position mutation. The immutable on-chain position SHARES,
 // asset IDs and externally held NEP-141 FT balances must remain identical.
 // Never replace real state reads with cached, patched or synthetic values.
 const immutable=(account:unknown)=>{
  if(!plain(account))throw Error('STAGE131_INVALID_REAL_ACCOUNT_SNAPSHOT');
  const a=account as {account_id?:unknown;positions?:{REGULAR?:{
   collateral?:unknown;borrowed?:unknown}}};
  if(typeof a.account_id!=='string'||!a.account_id)
   throw Error('STAGE131_INVALID_ACCOUNT_ID');
  const selected=a.positions?.REGULAR;
  if(!selected)throw Error('STAGE131_MISSING_REGULAR_POSITION');
  const shares=(rows:unknown)=>{
   if(!Array.isArray(rows)||rows.length>256)
    throw Error('STAGE131_INVALID_POSITION_SHARE_ROWS');
   const seen=new Set<string>();
   return rows.map(x=>{
    if(!x||typeof x!=='object')
     throw Error('STAGE131_INVALID_POSITION_SHARE_ROW');
    const v=x as {token_id?:unknown;shares?:unknown};
    if(typeof v.token_id!=='string'||!v.token_id||
     seen.has(v.token_id)||!balance(v.shares))
     throw Error('STAGE131_UNATTESTED_POSITION_SHARES');
    seen.add(v.token_id);
    return [v.token_id,v.shares];
   }).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  };
  return {id:a.account_id,borrowed:shares(selected.borrowed),
   collateral:shares(selected.collateral)};
 };
 const economic=(snap:Stage48PositionSnapshot)=>JSON.stringify({
  borrower:immutable(snap.borrower),actor:immutable(snap.actor),
  repayFt:snap.repayFt,seizeFt:snap.seizeFt,
 });
 const beforeBorrower=JSON.stringify(immutable(before.borrower));
 const immediateBorrower=JSON.stringify(immutable(immediatelyAfter.borrower));
 if(beforeBorrower===immediateBorrower||
  economic(immediatelyAfter)!==economic(afterFinalBlock))
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
