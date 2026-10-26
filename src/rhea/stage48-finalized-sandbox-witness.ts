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
 // Historical source interest continues accruing across the 10,000
 // Sandbox finality blocks. Comparing the full JSON (balances and APR strings)
 // incorrectly treats this protocol accrual as a state rollback. Require the
 // ACCOUNTED SHARES of each supplied, collateral and borrowed position to stay
 // identical. Stage41 independently rejects any leftover actor debt and checks
 // genuine borrower balance reductions and external FT receipts.
 const shares=(rows:unknown):string|null=>{
  if(!Array.isArray(rows)||rows.length>256)return null;
  const out:Array<[string,string]>=[];
  const seen=new Set<string>();
  for(const row of rows){
   if(!plain(row))return null;
   const x=row as Record<string,unknown>;
   if(typeof x.token_id!=='string'||typeof x.shares!=='string'||
    !/^[a-z0-9._-]{2,64}$/.test(x.token_id)||
    !/^(0|[1-9][0-9]{0,38})$/.test(x.shares)||seen.has(x.token_id))
    return null;
   seen.add(x.token_id);out.push([x.token_id,x.shares]);
  }
  return JSON.stringify(out.sort((a,b)=>a[0].localeCompare(b[0])));
 };
 const state=(account:unknown):string|null=>{
  if(!plain(account))return null;
  const a=account as Record<string,unknown>;
  if(typeof a.account_id!=='string'||!plain(a.positions))return null;
  const top=shares(a.supplied);
  if(top===null)return null;
  const positions=a.positions as Record<string,unknown>;
  if(Object.keys(positions).length>64)return null;
  const mapped:Array<[string,string,string]>=[];
  for(const [id,position] of Object.entries(positions)){
   if(!plain(position))return null;
   const p=position as Record<string,unknown>;
   const borrowed=shares(p.borrowed),collateral=shares(p.collateral);
   if(borrowed===null||collateral===null)return null;
   mapped.push([id,borrowed,collateral]);
  }
  return JSON.stringify([a.account_id,top,mapped.sort((x,y)=>x[0].localeCompare(y[0]))]);
 };
 const sameAccount=(a:unknown,b:unknown):boolean=>{
  const x=state(a),y=state(b);
  // Legacy mock fixtures lack shares; never substitute an incomplete witness.
  return x!==null&&y!==null?x===y:JSON.stringify(a)===JSON.stringify(b);
 };
 const samePersistent=
  sameAccount(immediatelyAfter.borrower,afterFinalBlock.borrower)&&
  sameAccount(immediatelyAfter.actor,afterFinalBlock.actor)&&
  immediatelyAfter.repayFt===afterFinalBlock.repayFt&&
  immediatelyAfter.seizeFt===afterFinalBlock.seizeFt;
 // The borrower's position SHARES must change, not merely accrued balances.
 if(sameAccount(before.borrower,immediatelyAfter.borrower)||!samePersistent)
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
