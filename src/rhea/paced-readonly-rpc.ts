import type {NearReadOnlyRpc,NearViewResult} from './rpc.ts';

/** Stage40: global per-run rate limit for ALL read-only RPC requests.
 * Schedules individual requests before transport retries; no signing endpoint.
 * Different shard runners must additionally be bounded in GitHub Actions.
 */
export class PacedNearReadOnlyRpc {
 readonly #source:Pick<NearReadOnlyRpc,'view'|'viewAccount'>;
 readonly #spacingMs:number;
 readonly #sleep:(ms:number)=>Promise<void>;
 #nextAllowed=0;
 #started=0;
 constructor(
  source:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,
  spacingMs=700,
  sleep:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
 ){
  if(!Number.isSafeInteger(spacingMs)||spacingMs<100||spacingMs>5000)
   throw Error('INVALID_STAGE40_RPC_RATE_LIMIT');
  this.#source=source;this.#spacingMs=spacingMs;this.#sleep=sleep;
 }
 getStats(){return {scheduledRequests:this.#started,minimumRequestGapMs:this.#spacingMs};}
 async #reserve():Promise<void>{
  // The reservation is synchronous; concurrent consumers never start at the
  // same time. No sustained burst when 12 callers request data simultaneously.
  const now=Date.now();
  const at=Math.max(now,this.#nextAllowed);
  this.#nextAllowed=at+this.#spacingMs;
  this.#started++;
  if(at>now)await this.#sleep(at-now);
 }
 async viewAccount(contractId:string,blockId?:number):Promise<{blockHeight:string;codeHash:string}>{
  await this.#reserve();return this.#source.viewAccount(contractId,blockId);
 }
 async view<T>(contractId:string,method:string,args:Record<string,unknown>={},blockId?:number):Promise<NearViewResult<T>>{
  await this.#reserve();return this.#source.view<T>(contractId,method,args,blockId);
 }
}
