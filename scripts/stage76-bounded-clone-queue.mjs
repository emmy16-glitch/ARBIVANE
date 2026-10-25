/** Stage76 — run source-pinned contract imports with bounded concurrency.
 * Each clone independently verifies its full archive state and code hash.
 * Wait for every in-flight Sandbox patch before reporting any failure.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
export async function cloneStage76Dependencies({ids,clone,concurrency=2}){
 if(!Array.isArray(ids)||ids.length<2||ids.length>6||
  new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!ID.test(id))||
  typeof clone!=='function'||!Number.isSafeInteger(concurrency)||
  concurrency<1||concurrency>2)
  throw Error('STAGE76_UNTRUSTED_SANDBOX_CLONE_SCHEDULE');
 const output=new Array(ids.length);
 let next=0,failed=null;
 const worker=async()=>{
  while(failed===null&&next<ids.length){
   const i=next++;
   try{
    const result=await clone(ids[i],i);
    if(!result||!result.contract||!result.evidence||
     result.evidence.contractId!==ids[i]||
     result.evidence.providerPaginationExhausted!==true||
     result.evidence.recordsRead!==result.evidence.recordsPatched||
     result.evidence.mainnetMutated!==false)
     throw Error('STAGE76_CLONE_COMPLETION_EVIDENCE_INVALID');
    output[i]=result;
   }catch(e){if(failed===null)failed=e;}
  }
 };
 // All in-flight clones settle before their shared Sandbox worker is torn down.
 await Promise.all(Array.from({length:Math.min(concurrency,ids.length)},()=>worker()));
 if(failed!==null)throw failed;
 if(output.some(x=>x===undefined))throw Error('STAGE76_INCOMPLETE_CLONE_SCHEDULE');
 const hashes=new Set(output.map(x=>x.evidence.sourceBlockHash));
 if(hashes.size!==1||[...hashes][0]===undefined)
  throw Error('STAGE76_CROSS_DEPENDENCY_PINNED_BLOCK_MISMATCH');
 return output;
}
