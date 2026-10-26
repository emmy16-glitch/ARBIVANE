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
/** Interest/farm metadata naturally change as Sandbox advances blocks.
 * Independently attest immutable position SHARE ledgers and actual wallet FTs,
 * rather than bitwise-identical interest-accrued account-view JSON.
 */
function positionShares(account:unknown):string{
 if(!plain(account))throw Error('STAGE48_INVALID_ACCOUNT_POSITION_VIEW');
 const a=account as Record<string,unknown>;
 if(typeof a.account_id!=='string'||a.account_id.length<2||
  !plain(a.positions))throw Error('STAGE48_INVALID_ACCOUNT_POSITION_VIEW');
 const p=a.positions as Record<string,unknown>;
 if(Object.keys(p).length>64)throw Error('STAGE48_POSITION_LIMIT');
 const legs=(raw:unknown)=>{
  if(!Array.isArray(raw)||raw.length>256)
   throw Error('STAGE48_INVALID_SHARE_LEDGER');
  const out:Record<string,string>={};
  for(const v of raw){
   if(!v||typeof v!=='object'||Array.isArray(v))
    throw Error('STAGE48_INVALID_SHARE_LEDGER');
   const x=v as Record<string,unknown>;
   if(typeof x.token_id!=='string'||
    !/^[a-z0-9._-]{2,64}$/.test(x.token_id)||
    Object.hasOwn(out,x.token_id)||!balance(x.shares))
    throw Error('STAGE48_INVALID_SHARE_LEDGER');
   out[x.token_id]=x.shares as string;
  }
  return Object.entries(out).sort((x,y)=>x[0].localeCompare(y[0]));
 };
 const positions=Object.entries(p).sort(([x],[y])=>x.localeCompare(y))
  .map(([id,row])=>{
   if(!/^[A-Za-z0-9._:-]{1,100}$/.test(id)||!plain(row))
    throw Error('STAGE48_INVALID_POSITION_ID');
   const v=row as Record<string,unknown>;
   return [id,legs(v.collateral),legs(v.borrowed)];
  });
 return JSON.stringify({accountId:a.account_id,positions,supplied:legs(a.supplied??[])});
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
 const canonical=(s:Stage48PositionSnapshot)=>JSON.stringify(s);
 // Require at least actual borrower mutation; Stage41 additionally demands
 // positive debt/collateral deltas, actor solvency and seized FT proceeds.
 if(JSON.stringify(before.borrower)===JSON.stringify(immediatelyAfter.borrower)||
  canonical(immediatelyAfter)!==canonical(afterFinalBlock))
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
