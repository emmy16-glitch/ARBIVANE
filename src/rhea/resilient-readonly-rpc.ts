import type {NearReadOnlyRpc,NearViewResult} from './rpc.ts';
import {NearRpcHttpError} from './rpc.ts';

/** Stage34: strictly read-only retries + bounded memoization of *pinned* NEAR
 * view_account/call_function results. Never cache unpinned finality reads.
 * A bad block, invalid oracle quote or contract execution error must fail closed.
 */
export interface ResilientReadOptions {
 maxRetries:number;initialDelayMs:number;maxDelayMs:number;maxCachedPinnedViews:number;
}
export interface ReadStats {
 requests:number;networkAttempts:number;retried:number;cachedHits:number;failed:number;
}
const defaults:ResilientReadOptions={maxRetries:2,initialDelayMs:300,maxDelayMs:5000,maxCachedPinnedViews:256};
function validate(o:ResilientReadOptions){
 if(!Number.isSafeInteger(o.maxRetries)||o.maxRetries<0||o.maxRetries>4||
  !Number.isSafeInteger(o.initialDelayMs)||o.initialDelayMs<0||o.initialDelayMs>2000||
  !Number.isSafeInteger(o.maxDelayMs)||o.maxDelayMs<0||o.maxDelayMs>10000||
  o.maxDelayMs<o.initialDelayMs||
  !Number.isSafeInteger(o.maxCachedPinnedViews)||o.maxCachedPinnedViews<0||o.maxCachedPinnedViews>1024)
  throw Error('INVALID_RESILIENT_NEAR_RPC_OPTIONS');
}
function retryable(e:unknown):boolean{
 if(e instanceof NearRpcHttpError)return /^NEAR RPC HTTP (429|5\d\d)$/.test(e.message);
 if(!(e instanceof Error))return false;
 // Never retry malformed JSON, contract errors, stale oracle prices or block drift.
 return /^(AbortError|TimeoutError)$/.test(e.name)||
   /fetch failed|network timeout|network request failed|ECONNRESET|ETIMEDOUT/i.test(e.message);
}
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export class ResilientNearReadOnlyRpc {
 readonly #source:Pick<NearReadOnlyRpc,'view'|'viewAccount'>;
 readonly #options:ResilientReadOptions;
 readonly #memo=new Map<string,Promise<unknown>>();
 readonly #stats:ReadStats={requests:0,networkAttempts:0,retried:0,cachedHits:0,failed:0};
 constructor(source:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,options:Partial<ResilientReadOptions>={}){
  this.#source=source;this.#options={...defaults,...options};validate(this.#options);
 }
 getStats():ReadStats{return {...this.#stats};}
 async #request<T>(key:string|null,fn:()=>Promise<T>):Promise<T>{
  this.#stats.requests++;
  if(key&&this.#memo.has(key)){
   this.#stats.cachedHits++;
   // Never expose mutable cached data between consumers.
   return structuredClone(await this.#memo.get(key)!) as T;
  }
  const work=(async():Promise<T>=>{
   for(let attempt=0;;attempt++){
    this.#stats.networkAttempts++;
    try{return await fn();}
    catch(e){
     if(attempt>=this.#options.maxRetries||!retryable(e)){
      this.#stats.failed++;
      throw e;
     }
     const hinted=e instanceof NearRpcHttpError?e.retryAfterMs:undefined;
     const exponential=this.#options.initialDelayMs*2**attempt;
     // Honor Retry-After. If budget disallows it, fail instead of hammering.
     const wait=Math.max(exponential,hinted??0);
     if(wait>this.#options.maxDelayMs){this.#stats.failed++;throw e;}
     this.#stats.retried++;
     await sleep(wait);
    }
   }
  })();
  if(key&&this.#options.maxCachedPinnedViews>0){
   if(this.#memo.size>=this.#options.maxCachedPinnedViews){
    const oldest=this.#memo.keys().next().value;
    if(oldest!==undefined)this.#memo.delete(oldest);
   }
   this.#memo.set(key,work);
  }
  try{return key?structuredClone(await work):await work;}
  catch(e){if(key&&this.#memo.get(key)===work)this.#memo.delete(key);throw e;}
 }
 async viewAccount(accountId:string,blockId?:number):Promise<{blockHeight:string;codeHash:string}>{
  const key=blockId===undefined?null:JSON.stringify(['view_account',accountId,blockId]);
  return this.#request(key,()=>this.#source.viewAccount(accountId,blockId));
 }
 async view<T>(contractId:string,method:string,args:Record<string,unknown>={},blockId?:number):Promise<NearViewResult<T>>{
  const key=blockId===undefined?null:JSON.stringify(['call_function',contractId,method,args,blockId]);
  return this.#request(key,()=>this.#source.view<T>(contractId,method,args,blockId));
 }
}
