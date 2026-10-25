
import {StateResponseTooLarge} from './stage45-prefix-state.mjs';
/** Stage45: only pinned NEAR JSON-RPC query(view_state), never a transaction. */
const SIZE=/response.{0,80}(?:size|too large|limit)|(?:size|bytes).{0,80}(?:exceed|limit)|(?:exceed|too large).{0,80}(?:response|size|limit)|50\s*(?:kb|kib)|PAYLOAD_TOO_LARGE|response too big/i;
const transient=status=>status===429||[500,502,503,504].includes(status);
export class ArchivalStateRpc {
 #o;#fetch;#sleep;#nextAllowed=0;
 calls=0;attempts=0;rateLimitResponses=0;oversizeResponses=0;
 constructor(o,fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  const url=new URL(o.endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||
   !/^[a-z0-9._-]{2,64}$/.test(o.accountId)||
   !Number.isSafeInteger(o.blockHeight)||o.blockHeight<=0)
   throw Error('STAGE45_INVALID_ARCHIVAL_READ_CONFIG');
  this.#o={...o,timeoutMs:o.timeoutMs??18000,paceMs:o.paceMs??250,maxRetries:o.maxRetries??3};
  if(this.#o.timeoutMs<1000||this.#o.timeoutMs>60000||
   this.#o.paceMs<0||this.#o.paceMs>5000||
   this.#o.maxRetries<0||this.#o.maxRetries>4)
   throw Error('STAGE45_INVALID_RPC_BUDGET');
  this.#fetch=fetcher;this.#sleep=sleep;
 }
 async #pace(){
  const now=Date.now(),at=Math.max(now,this.#nextAllowed);
  this.#nextAllowed=at+this.#o.paceMs;
  if(at>now)await this.#sleep(at-now);
 }
 async viewState(prefix){
  this.calls++;
  const request={jsonrpc:'2.0',id:'stage45-pinned-view',method:'query',params:{
   request_type:'view_state',account_id:this.#o.accountId,
   prefix_base64:prefix.toString('base64'),block_id:this.#o.blockHeight,
  }};
  for(let attempt=0;attempt<=this.#o.maxRetries;attempt++){
   await this.#pace();this.attempts++;
   let response,body;
   try{
    response=await this.#fetch(this.#o.endpoint,{
     method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify(request),signal:AbortSignal.timeout(this.#o.timeoutMs),
    });
    const length=Number(response.headers.get('content-length')??'0');
    if(Number.isFinite(length)&&length>2*1024*1024){
     this.oversizeResponses++;throw new StateResponseTooLarge();
    }
    body=await response.text();
    if(body.length>2*1024*1024){
     this.oversizeResponses++;throw new StateResponseTooLarge();
    }
   }catch(e){
    if(e instanceof StateResponseTooLarge)throw e;
    if(attempt===this.#o.maxRetries)throw Error('STAGE45_ARCHIVAL_NETWORK_FAILURE');
    await this.#sleep(Math.min(10000,500*2**attempt));continue;
   }
   if(response.status===413||response.status===507||SIZE.test(body)){
    this.oversizeResponses++;throw new StateResponseTooLarge();
   }
   if(!response.ok){
    if(response.status===429)this.rateLimitResponses++;
    if(!transient(response.status)||attempt===this.#o.maxRetries)
     throw Error(response.status===429?'STAGE45_ARCHIVAL_RATE_LIMIT_EXHAUSTED':
      'STAGE45_ARCHIVAL_HTTP_FAILURE');
    const hint=Number(response.headers.get('retry-after')??'0');
    await this.#sleep(Math.min(20000,Math.max(600*2**attempt,
     Number.isFinite(hint)&&hint>=0?hint*1000:0)));
    continue;
   }
   let data;
   try{data=JSON.parse(body);}catch{throw Error('STAGE45_ARCHIVAL_BAD_JSON');}
   if(!data||typeof data!=='object')throw Error('STAGE45_ARCHIVAL_BAD_RPC_SHAPE');
   if(data.error){
    const e=data.error,body=JSON.stringify(e);
    const first=e&&typeof e==='object'?e:{};
    const cause=first.cause&&typeof first.cause==='object'?first.cause:{};
    // Mainnet storage is public; expose only bounded error taxonomy in job logs.
    // Never log RPC request URLs, token headers or whole response bodies.
    const fingerprint={
     mode:'STAGE45_READ_ONLY_RPC_ERROR_DIAGNOSTIC',
     errorCode:typeof first.code==='number'?first.code:null,
     errorName:typeof first.name==='string'?first.name.slice(0,80):null,
     causeName:typeof cause.name==='string'?cause.name.slice(0,80):null,
     message:typeof first.message==='string'?first.message.slice(0,250):null,
     causeMessage:typeof cause.info?.error_message==='string'?
      cause.info.error_message.slice(0,250):null,
    };
    console.error(JSON.stringify(fingerprint));
    if(SIZE.test(body)){
     this.oversizeResponses++;throw new StateResponseTooLarge();
    }
    throw Error('STAGE45_ARCHIVAL_RPC_QUERY_REJECTED');
   }
   const r=data.result;
   if(!r||typeof r!=='object'||!Array.isArray(r.values)||
    typeof r.block_height!=='number'||typeof r.block_hash!=='string')
    throw Error('STAGE45_ARCHIVAL_BAD_RPC_RESULT');
   return {blockHeight:String(r.block_height),blockHash:r.block_hash,values:r.values};
  }
  throw Error('STAGE45_ARCHIVAL_RETRY_EXHAUSTED');
 }
 getStats(){return {rpcCalls:this.calls,transportAttempts:this.attempts,
  rateLimitResponses:this.rateLimitResponses,oversizeResponses:this.oversizeResponses};}
}
