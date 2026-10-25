import type {NearReadOnlyRpc,NearViewResult} from './rpc.ts';
import {isTransientNearRpcError} from './resilient-readonly-rpc.ts';

/** Read-only transport failover for pinned NEAR views. A transient failure
 * rotates the preferred endpoint so every later request does not first hammer
 * an already rate-limited provider. Contract/schema/block errors fail closed.
 */
export class FailoverNearReadOnlyRpc {
 readonly #sources:Array<Pick<NearReadOnlyRpc,'view'|'viewAccount'>>;
 #preferred=0;
 #failovers=0;
 constructor(sources:Array<Pick<NearReadOnlyRpc,'view'|'viewAccount'>>){
  if(!Array.isArray(sources)||sources.length<1||sources.length>3)
   throw Error('INVALID_READONLY_RPC_FAILOVER_SOURCES');
  this.#sources=[...sources];
 }
 getStats(){return {endpointCount:this.#sources.length,preferredEndpoint:this.#preferred,failovers:this.#failovers};}
 async #request<T>(call:(source:Pick<NearReadOnlyRpc,'view'|'viewAccount'>)=>Promise<T>):Promise<T>{
  const start=this.#preferred;
  for(let offset=0;offset<this.#sources.length;offset++){
   const index=(start+offset)%this.#sources.length;
   try{
    const value=await call(this.#sources[index]!);
    this.#preferred=index;
    return value;
   }catch(error){
    if(!isTransientNearRpcError(error)||offset===this.#sources.length-1)throw error;
    this.#failovers++;
    this.#preferred=(index+1)%this.#sources.length;
   }
  }
  throw Error('READONLY_RPC_FAILOVER_EXHAUSTED');
 }
 viewAccount(accountId:string,blockId?:number):Promise<{blockHeight:string;codeHash:string}>{
  return this.#request(source=>source.viewAccount(accountId,blockId));
 }
 view<T>(contractId:string,method:string,args:Record<string,unknown>={},blockId?:number):Promise<NearViewResult<T>>{
  return this.#request(source=>source.view<T>(contractId,method,args,blockId));
 }
}
