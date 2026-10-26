/** Stage130: recover REAL, later-FINAL Sandbox receipts for the SAME signed Rhea
 * liquidation. NEVER sign or broadcast, never infer a callback from logs.
 * The Sandbox process provider is the sole source for receipt hydration.
 */
const BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const data=x=>obj(x?.result)?x.result:x;
const hasFailure=x=>Array.isArray(x?.receipts_outcome)&&
 x.receipts_outcome.some(row=>obj(row?.outcome?.status)&&
  Object.hasOwn(row.outcome.status,'Failure'));
export async function stage130FinalizeAtomicRheaReceipts({
 raw,provider,actorAccountId,lendingContractId,network='sandbox',
}){
 if(network!=='sandbox'||!obj(raw)||!obj(provider)||
  typeof provider.txStatusReceipts!=='function'||
  typeof actorAccountId!=='string'||typeof lendingContractId!=='string')
  throw Error('STAGE130_ONLY_LOCAL_SANDBOX_FINALITY');
 const first=data(raw),tx=first?.transaction;
 if(!obj(tx)||!BASE58.test(tx.hash??'')||
  tx.signer_id!==actorAccountId||tx.receiver_id!==lendingContractId||
  !Array.isArray(first.receipts_outcome)||first.receipts_outcome.length===0)
  throw Error('STAGE130_UNSIGNED_OR_UNTRUSTED_INITIAL_RHEA_TRANSACTION');
 if(hasFailure(first)||obj(first.status)&&Object.hasOwn(first.status,'Failure'))
  throw Error('STAGE130_ORIGINAL_RHEA_CHILD_FAILURE');
 const needHydration=first.final_execution_status!=='FINAL'||
  !Array.isArray(first.receipts)||first.receipts.length===0;
 let final=first;
 if(needHydration){
  let timer;
  try{
   final=await Promise.race([
    provider.txStatusReceipts(tx.hash,actorAccountId,'FINAL'),
    new Promise((_,reject)=>{timer=setTimeout(
     ()=>reject(Error('STAGE130_FINAL_RECEIPTS_TIMED_OUT')),15000);}),
   ]);
  }catch{
   throw Error('STAGE130_GENUINE_FINAL_RECEIPT_QUERY_FAILED');
  }finally{clearTimeout(timer);}
  final=data(final);
 }
 const verifyTx=final?.transaction;
 if(!obj(final)||!obj(verifyTx)||
  verifyTx.hash!==tx.hash||verifyTx.signer_id!==actorAccountId||
  verifyTx.receiver_id!==lendingContractId||
  final.final_execution_status!=='FINAL'||
  !Array.isArray(final.receipts_outcome)||final.receipts_outcome.length===0||
  !Array.isArray(final.receipts)||final.receipts.length===0)
  throw Error('STAGE130_FINAL_TRANSACTION_OR_RECEIPT_IDENTITY_NOT_ATTESTED');
 const finalReceipts=new Set(final.receipts_outcome.map(x=>x?.id));
 if(first.receipts_outcome.some(x=>!BASE58.test(x?.id??'')||
   !finalReceipts.has(x.id))||
  hasFailure(final)||obj(final.status)&&Object.hasOwn(final.status,'Failure'))
  throw Error('STAGE130_FINAL_CHILD_RECEIPT_FAILURE_OR_MISSING');
 // This enforces only provenance + completeness. The existing independent
 // Stage37 summary must still find callback_execute_with_pyth, verify its
 // success, and Stage48/Stage41 must prove finalized borrower/FT deltas.
 return {result:final};
}
