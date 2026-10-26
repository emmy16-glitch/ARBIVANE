/** Stage124: resolve real Sandbox Rhea async receipts without resending the
 * signed call, inventing callback results, or touching mainnet.
 * The old SDK callRaw may return EXECUTED with no receipt definitions, even
 * when receipts_outcome includes Rhea's actual contract rejection.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const unpack=raw=>obj(raw?.result)?raw.result:raw;
const failed=raw=>Array.isArray(raw?.receipts_outcome)&&
 raw.receipts_outcome.some(x=>obj(x?.outcome?.status)&&
  Object.hasOwn(x.outcome.status,'Failure'));
export async function resolveStage124RheaCallbackReceipts({
 raw,provider,signerAccountId,evidencePath=null,writeFile=null
}){
 const v=unpack(raw);
 const hash=v?.transaction?.hash;
 if(!obj(v)||!HASH.test(hash??'')||!ID.test(signerAccountId??'')||
  v.transaction?.signer_id!==signerAccountId||
  !Array.isArray(v.receipts_outcome)||v.receipts_outcome.length===0)
  throw Error('STAGE124_UNTRUSTED_SIGNED_TRANSACTION_IDENTITY');
 const report={mode:'STAGE124_AUTHENTIC_SANDBOX_RHEA_FINAL_RECEIPTS',
  chain:'NEAR_SANDBOX',transactionId:hash,
  initialExecutionStatus:v.final_execution_status??null,
  initialFailedReceiptCount:v.receipts_outcome.filter(x=>obj(x?.outcome?.status)&&
   Object.hasOwn(x.outcome.status,'Failure')).length,
  finalExecutionStatus:null,finalReceiptCount:0,
  classification:'PENDING',mainnetExecutionEnabled:false};
 const save=async()=>{if(evidencePath&&typeof writeFile==='function')
  await writeFile(evidencePath,JSON.stringify(report,null,2)+'\n');};
 if(failed(v)||obj(v.status)&&Object.hasOwn(v.status,'Failure')){
  report.classification='GENUINE_FAILED_RHEA_RECEIPT_NO_SETTLEMENT';
  await save();
  throw Error('STAGE124_RHEA_ACTION_RECEIPT_FAILED');
 }
 let result=v;
 if(!Array.isArray(v.receipts)||v.receipts.length===0||
  v.final_execution_status!=='FINAL'){
  if(!provider||typeof provider.txStatusReceipts!=='function'){
   report.classification='NO_LOCAL_FINAL_RECEIPT_PROVIDER';
   await save();
   throw Error('STAGE124_LOCAL_FINAL_RECEIPT_PROVIDER_UNAVAILABLE');
  }
  let timer;
  try{
   result=await Promise.race([
    provider.txStatusReceipts(hash,signerAccountId,'FINAL'),
    new Promise((_,reject)=>{timer=setTimeout(
     ()=>reject(Error('STAGE124_FINAL_RECEIPTS_TIMEOUT')),15000);}),
   ]);
  }catch{
   report.classification='FINAL_RECEIPT_QUERY_FAILED';
   await save();
   throw Error('STAGE124_FINAL_RECEIPT_QUERY_FAILED');
  }finally{clearTimeout(timer);}
 }
 const expectedIds=new Set(v.receipts_outcome.map(row=>row?.id));
 const laterIds=new Set(Array.isArray(result?.receipts_outcome)?
  result.receipts_outcome.map(row=>row?.id):[]);
 if(!obj(result)||result.final_execution_status!=='FINAL'||
  result?.transaction?.hash!==hash||
  result?.transaction?.signer_id!==signerAccountId||
  !Array.isArray(result.receipts)||result.receipts.length===0||
  !Array.isArray(result.receipts_outcome)||result.receipts_outcome.length<1||
  [...expectedIds].some(id=>!laterIds.has(id))){
  report.classification='NON_FINAL_OR_MISSING_CANONICAL_CALLBACK_EVIDENCE';
  await save();
  throw Error('STAGE124_CANONICAL_CALLBACK_RECEIPTS_MISSING');
 }
 report.finalExecutionStatus='FINAL';
 report.finalReceiptCount=result.receipts.length;
 report.classification=failed(result)?'GENUINE_FAILED_RHEA_RECEIPT_NO_SETTLEMENT':
  'FINAL_RECEIPTS_AVAILABLE_FOR_INDEPENDENT_CALLBACK_CHECK';
 await save();
 if(failed(result)||obj(result.status)&&Object.hasOwn(result.status,'Failure'))
  throw Error('STAGE124_RHEA_ACTION_RECEIPT_FAILED');
 return {result};
}
