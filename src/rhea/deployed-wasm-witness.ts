import type {FetchLike, NearReadOnlyRpc} from './rpc.ts';
import {inspectDeployedLiquidationIdentity} from './liquidation-contract-preflight.ts';

/** A finalized-block code-byte witness. This NEVER executes Wasm, signs or sends NEAR actions.
 * The SHA-256/base58 digest is NEAR's deployed code identity, NOT source-code parity.
 */
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ACCOUNT=/^[a-z0-9._-]{2,64}$/;
const BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const MAX_WASM_BYTES=12*1024*1024;
const MAX_ENVELOPE_CHARS=MAX_WASM_BYTES*4/3+8192;

export interface CodeWitness {
 accountId:string;blockHeight:string;observedCodeHash:string;computedCodeHash:string;
 rpcReportedCodeHash:string;byteLength:number;exportCount:number;
 executeExportPresent:boolean;publicFunctionExports:string[];
 codeBytesHashMatched:true;sourceWasmReproduciblyMatched:false;
 liquidationRulesVerified:false;transactionDryRunPerformed:false;
 executionEnabled:false;mayBroadcast:false;
}
export interface Stage24Report {
 mode:'RHEA_STAGE24_DEPLOYED_WASM_WITNESS';chain:'NEAR_MAINNET';
 status:'DEPLOYED_CODE_BYTES_ATTESTED_SOURCE_UNVERIFIED';
 blockHeight:string;lending:CodeWitness;oracle:CodeWitness;
 configuredOracle:CodeWitness|null;
 lendingConfigOracleAccountId:string|null;oracleAccountPointerStatus:
  'EXPLICIT_MATCH'|'DISTINCT_CONFIGURED_ORACLE'|'NOT_EXPOSED_IN_CONFIG';
 pythOracleEnabled:boolean|null;
 liquidationMethodSurfaceObserved:boolean;
 sourceWasmReproduciblyMatched:false;deployedLiquidationRulesVerified:false;
 transactionDryRunPerformed:false;netProfitVerified:false;
 walletAuthorized:false;executionEnabled:false;mayBroadcast:false;
 blockers:string[];
}
function base58(bytes:Uint8Array):string{
 let leading=0;while(leading<bytes.length&&bytes[leading]===0)leading++;
 let x=0n;for(const v of bytes)x=x*256n+BigInt(v);
 let out='';while(x>0n){out=ALPHABET[Number(x%58n)]!+out;x/=58n;}
 return '1'.repeat(leading)+out;
}
export async function attestWasmBytes(
 accountId:string,blockHeight:string,expectedHash:string,base64:string,rpcHash:string,
):Promise<CodeWitness>{
 if(!ACCOUNT.test(accountId)||!/^[1-9][0-9]{0,15}$/.test(blockHeight)||
   !BASE58.test(expectedHash)||!BASE58.test(rpcHash))throw Error('INVALID_CODE_WITNESS_IDENTITY');
 if(typeof base64!=='string'||base64.length<12||base64.length>MAX_ENVELOPE_CHARS||
   base64.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
   throw Error('INVALID_WASM_BASE64');
 const decoded=atob(base64);
 if(btoa(decoded)!==base64)throw Error('NON_CANONICAL_WASM_BASE64');
 if(decoded.length<8||decoded.length>MAX_WASM_BYTES)throw Error('WASM_SIZE_OUT_OF_BOUNDS');
 const bytes=Uint8Array.from(decoded,x=>x.charCodeAt(0));
 if(bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109||
   bytes[4]!==1||bytes[5]!==0||bytes[6]!==0||bytes[7]!==0)throw Error('INVALID_WASM_MAGIC');
 const hash=base58(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
 if(hash!==expectedHash||hash!==rpcHash)throw Error('DEPLOYED_WASM_HASH_MISMATCH');
 let exports:WebAssembly.ModuleExportDescriptor[];
 try {exports=WebAssembly.Module.exports(new WebAssembly.Module(bytes));}
 catch {throw Error('INVALID_DEPLOYED_WASM_MODULE');}
 if(exports.length>2048)throw Error('EXCESSIVE_WASM_EXPORTS');
 const names=exports.filter(x=>x.kind==='function').map(x=>x.name);
 return {accountId,blockHeight,observedCodeHash:expectedHash,computedCodeHash:hash,
   rpcReportedCodeHash:rpcHash,byteLength:bytes.byteLength,exportCount:exports.length,
   executeExportPresent:names.includes('execute'),publicFunctionExports:names.slice(0,128),
   codeBytesHashMatched:true,sourceWasmReproduciblyMatched:false,
   liquidationRulesVerified:false,transactionDryRunPerformed:false,
   executionEnabled:false,mayBroadcast:false};
}

/** Sends ONLY JSON-RPC query(view_code). Bounds response length and fixes the historical block. */
export async function fetchFinalizedWasm(
 rpcUrl:string,accountId:string,blockHeight:string,fetcher:FetchLike=fetch,
):Promise<Pick<CodeWitness,'accountId'|'blockHeight'>&{codeBase64:string;rpcCodeHash:string}>{
 if(!ACCOUNT.test(accountId)||!/^[1-9][0-9]{0,15}$/.test(blockHeight)||
   !Number.isSafeInteger(Number(blockHeight)))throw Error('INVALID_CODE_READ_TARGET');
 const url=new URL(rpcUrl);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))
   throw Error('RPC_HTTPS_REQUIRED');
 const response=await fetcher(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:24,method:'query',
     params:{request_type:'view_code',account_id:accountId,block_id:Number(blockHeight)}}),
   signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('NEAR_VIEW_CODE_RPC_FAILURE_'+response.status);
 const length=response.headers?.get?.('content-length');
 if(length!==null&&length!==undefined&&/^\d+$/.test(length)&&Number(length)>MAX_ENVELOPE_CHARS)
   throw Error('NEAR_VIEW_CODE_RESPONSE_TOO_LARGE');
 const body=await response.text();
 if(body.length>MAX_ENVELOPE_CHARS)throw Error('NEAR_VIEW_CODE_RESPONSE_TOO_LARGE');
 let envelope:unknown;
 try{envelope=JSON.parse(body);}catch{throw Error('INVALID_VIEW_CODE_JSON');}
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw Error('INVALID_VIEW_CODE_ENVELOPE');
 const obj=envelope as Record<string,unknown>;
 if(obj.error!==undefined||!obj.result||typeof obj.result!=='object'||Array.isArray(obj.result))
  throw Error('VIEW_CODE_QUERY_REJECTED');
 const result=obj.result as Record<string,unknown>;
 if(result.block_height!==Number(blockHeight)||typeof result.code_base64!=='string'||
   typeof result.hash!=='string')throw Error('CROSS_BLOCK_OR_INVALID_CODE_RESPONSE');
 return {accountId,blockHeight,codeBase64:result.code_base64,rpcCodeHash:result.hash};
}
export async function inspectStage24DeployedWasm(
 rpc:Pick<NearReadOnlyRpc,'viewAccount'|'view'>,rpcUrl:string,
 args:{lendingContract:string;oracleContract:string;expectedLendingCodeHash?:string;expectedOracleCodeHash?:string},
 fetcher:FetchLike=fetch,
):Promise<Stage24Report>{
 const identity=await inspectDeployedLiquidationIdentity(rpc,args);
 const height=identity.blockHeight;
 const [lendingRead,oracleRead,cfg]=await Promise.all([
  fetchFinalizedWasm(rpcUrl,args.lendingContract,height,fetcher),
  fetchFinalizedWasm(rpcUrl,args.oracleContract,height,fetcher),
  rpc.view<unknown>(args.lendingContract,'get_config',{},Number(height)),
 ]);
 if(cfg.blockHeight!==height||!cfg.value||typeof cfg.value!=='object'||Array.isArray(cfg.value))
  throw Error('CROSS_BLOCK_OR_INVALID_LENDING_CONFIG');
 const config=cfg.value as Record<string,unknown>;
 const pointer=config.oracle_account_id;
 if(pointer!==undefined&&pointer!==null&&(typeof pointer!=='string'||!ACCOUNT.test(pointer)))
  throw Error('INVALID_CONFIG_ORACLE_POINTER');
 // The legacy lending oracle and the aggregate/Pyth price reader may be distinct contracts.
 // Observe their separate code identities rather than treating the operator's reader as the configured execution oracle.
 const pyth=config.enable_pyth_oracle;
 if(pyth!==undefined&&typeof pyth!=='boolean')throw Error('INVALID_PYTH_ORACLE_FLAG');
 const [lending,oracle]=await Promise.all([
  attestWasmBytes(args.lendingContract,height,identity.lendingCodeHash,lendingRead.codeBase64,lendingRead.rpcCodeHash),
  attestWasmBytes(args.oracleContract,height,identity.oracleCodeHash,oracleRead.codeBase64,oracleRead.rpcCodeHash),
 ]);
 let configuredOracle:CodeWitness|null=null;
 if(typeof pointer==='string'&&pointer!==args.oracleContract){
  if(pointer===args.lendingContract)throw Error('INVALID_CONFIG_ORACLE_SELF_POINTER');
  const account=await rpc.viewAccount(pointer,Number(height));
  if(account.blockHeight!==height)throw Error('CONFIGURED_ORACLE_CROSS_BLOCK');
  const code=await fetchFinalizedWasm(rpcUrl,pointer,height,fetcher);
  configuredOracle=await attestWasmBytes(pointer,height,account.codeHash,code.codeBase64,code.rpcCodeHash);
 }
 return {mode:'RHEA_STAGE24_DEPLOYED_WASM_WITNESS',chain:'NEAR_MAINNET',
  status:'DEPLOYED_CODE_BYTES_ATTESTED_SOURCE_UNVERIFIED',blockHeight:height,lending,oracle,
  configuredOracle,
  lendingConfigOracleAccountId:typeof pointer==='string'?pointer:null,
  oracleAccountPointerStatus:typeof pointer==='string'?
   (pointer===args.oracleContract?'EXPLICIT_MATCH':'DISTINCT_CONFIGURED_ORACLE'):'NOT_EXPOSED_IN_CONFIG',
  pythOracleEnabled:typeof pyth==='boolean'?pyth:null,
  liquidationMethodSurfaceObserved:lending.executeExportPresent,
  sourceWasmReproduciblyMatched:false,deployedLiquidationRulesVerified:false,
  transactionDryRunPerformed:false,netProfitVerified:false,walletAuthorized:false,
  executionEnabled:false,mayBroadcast:false,
  blockers:['DEPLOYED_WASM_HAS_NOT_BEEN_REPRODUCIBLY_MATCHED_TO_AUDITED_SOURCE',
   'LIQUIDATION_ACTION_BRANCH_AND_ORACLE_EXECUTION_PATH_UNVERIFIED',
   'NO_STATEFUL_TRANSACTION_REPLAY','NO_REAL_FINANCING_GAS_OR_NET_PROFIT_PROOF',
   'WALLET_LIMITS_AND_INDEPENDENT_RELEASE_NOT_APPROVED',
   ...(typeof pointer==='string'?[]:['ORACLE_CONFIG_POINTER_NOT_EXPLICIT']),
   ...(typeof pointer==='string'&&pointer!==args.oracleContract?['AGGREGATE_PRICE_READER_DIFFERS_FROM_CONFIGURED_ORACLE']:[]),
   ...(lending.executeExportPresent?[]:['EXECUTE_METHOD_NOT_EXPORTED'])]};
}
