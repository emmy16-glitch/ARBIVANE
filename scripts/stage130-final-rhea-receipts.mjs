/** Stage130: resolve the real locally signed Rhea Sandbox transaction's
 * async receipts to FINAL, without resending it or trusting optimistic logs.
 * Mainnet read-only; NEVER point this at a remote spending-capable provider.
 */
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ID=/^[a-z0-9._-]{2,64}$/;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const unpack=raw=>obj(raw?.result)?raw.result:raw;
function receiptIds(v){
 if(!Array.isArray(v?.receipts_outcome)||v.receipts_outcome.length<1)
  throw Error('STAGE130_MISSING_CANONICAL_RHEA_OUTCOMES');
 const ids=new Set();
 for(const x of v.receipts_outcome){
  if(typeof x?.id!=='string'||!x.id||ids.has(x.id)||!obj(x?.outcome?.status))
   throw Error('STAGE130_UNTRUSTED_RHEA_OUTCOME');
  ids.add(x.id);
  const variants=['Failure','SuccessValue','SuccessReceiptId'].filter(k=>
   Object.hasOwn(x.outcome.status,k));
  if(variants.length!==1)throw Error('STAGE130_UNTRUSTED_RHEA_OUTCOME');
  if(variants[0]==='Failure')throw Error('STAGE130_FAILED_AUTHENTIC_RHEA_RECEIPT');
 }
 return ids;
}
function callbackIds(v){
 const defs=v?.receipts;
 if(!Array.isArray(defs)||defs.length<1)
  throw Error('STAGE130_MISSING_RHEA_CALLBACK_DEFINITIONS');
 const ids=new Set();
 for(const row of defs){
  if(!obj(row)||typeof row.receipt_id!=='string'||!row.receipt_id||
   !obj(row.receipt))throw Error('STAGE130_INVALID_RECEIPT_DEFINITION');
  const actions=row.receipt.Action?.actions;
  if(Array.isArray(actions)&&actions.some(a=>
   a?.FunctionCall?.method_name==='callback_execute_with_pyth'))
   ids.add(row.receipt_id);
 }
 if(ids.size<1)throw Error('STAGE130_MISSING_RHEA_CALLBACK');
 return ids;
}
/** Raw Workspaces callRaw is retained independently by the caller.
 * The resolver only performs a local read: txStatusReceipts(knownHash,...,FINAL).
 */
export async function stage130ResolveFinalRheaReceipts({
 raw,provider,signerAccountId,onFinalEvidence,
}){
 const first=unpack(raw);
 const tx=first?.transaction;
 const hash=tx?.hash;
 if(!obj(first)||!HASH.test(hash??'')||!ID.test(signerAccountId??'')||
  tx.signer_id!==signerAccountId||
  tx.receiver_id!=='contract.main.burrow.near')
  throw Error('STAGE130_INVALID_SIGNED_SANDBOX_TRANSACTION');
 const originalIds=receiptIds(first);
 if(obj(first.status)&&Object.hasOwn(first.status,'Failure'))
  throw Error('STAGE130_FAILED_AUTHENTIC_RHEA_TRANSACTION');
 const definitionsPresent=Array.isArray(first.receipts)&&first.receipts.length>0;
 let final=first;
 if(first.final_execution_status!=='FINAL'||!definitionsPresent){
  if(!provider||typeof provider.txStatusReceipts!=='function')
   throw Error('STAGE130_LOCAL_FINAL_RECEIPT_PROVIDER_UNAVAILABLE');
  let timer;
  try{
   final=unpack(await Promise.race([
    provider.txStatusReceipts(hash,signerAccountId,'FINAL'),
    new Promise((_,reject)=>{timer=setTimeout(()=>
     reject(Error('STAGE130_FINAL_RECEIPT_READ_TIMEOUT')),20000);}),
   ]));
  }finally{clearTimeout(timer);}
 }
 // Persist the real independently queried result even if a child failed.
 if(onFinalEvidence!==undefined){
  if(typeof onFinalEvidence!=='function')
   throw Error('STAGE130_INVALID_EVIDENCE_WRITER');
  await onFinalEvidence(final);
 }
 if(!obj(final)||final.final_execution_status!=='FINAL'||
  final?.transaction?.hash!==hash||
  final?.transaction?.signer_id!==signerAccountId||
  final?.transaction?.receiver_id!=='contract.main.burrow.near')
  throw Error('STAGE130_FINAL_TRANSACTION_IDENTITY_OR_FINALITY_CHANGED');
 const finalIds=receiptIds(final);
 if([...originalIds].some(id=>!finalIds.has(id)))
  throw Error('STAGE130_MISSING_ORIGINAL_RECEIPT_OUTCOME');
 if(!obj(final.status)||!Object.hasOwn(final.status,'SuccessValue'))
  throw Error('STAGE130_FINAL_TRANSACTION_NOT_SUCCESSFUL');
 const callbacks=callbackIds(final);
 if([...callbacks].some(id=>!finalIds.has(id)))
  throw Error('STAGE130_CALLBACK_RECEIPT_OUTCOME_MISSING');
 return {result:final};
}
