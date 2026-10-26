import {createHash} from 'node:crypto';

/** Stage140 on-chain discovery. This can authenticate that a WASM method is
 * exported by an account at a finalized block, but an exported name NEVER
 * establishes a usable, solvent, uncollateralized flash-loan provider.
 * Only NEAR view_account and view_code JSON-RPC query methods are permitted.
 */
export const STAGE140_WATCH_ACCOUNTS=Object.freeze([
 'contract.main.burrow.near',
 'v2.ref-finance.near'
]);
const account=/^[a-z0-9][a-z0-9._-]{1,63}$/;
const b58abc='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const flashPattern=/^(flash_loan|flashloan|flash_borrow|flash_liquidat(e|ion)|request_flash_loan)$/;
const fail=code=>{throw Error('STAGE140_'+code);};
export function stage140EncodeBase58(bytes){
 let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),s='';
 while(n>0n){s=b58abc[Number(n%58n)]+s;n/=58n;}
 for(const v of bytes){if(v!==0)break;s='1'+s;}
 return s||'1';
}
const bytesBase64=encoded=>{
 if(typeof encoded!=='string'||encoded.length<12||encoded.length>13_000_000||
  !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('UNTRUSTED_CODE_ENCODING');
 const data=Buffer.from(encoded,'base64');
 if(data.length>9_500_000||data.toString('base64')!==encoded)
  fail('UNTRUSTED_CODE_ENCODING');
 return data;
};
export async function stage140InspectNativeAccounts({
 rpcUrl='https://rpc.mainnet.near.org',fetcher=fetch,
 accounts=STAGE140_WATCH_ACCOUNTS,now=()=>Date.now()
}={}){
 const url=new URL(rpcUrl);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))
  fail('INSECURE_RPC');
 if(!Array.isArray(accounts)||accounts.length<1||accounts.length>12||
  accounts.some(x=>typeof x!=='string'||!account.test(x))||
  new Set(accounts).size!==accounts.length)fail('INVALID_ACCOUNTS');
 let seq=0;
 const rpc=async params=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  let response;
  try{
   response=await fetcher(rpcUrl,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:++seq,method:'query',params}),
    signal:controller.signal
   });
   if(!response.ok)fail('RPC_HTTP_FAILURE');
   const length=response.headers?.get?.('content-length');
   if(length&&Number(length)>14_000_000)fail('OVERSIZED_RPC_REPLY');
   // Parse strictly; enforce encoded WASM size below.
   const j=await response.json();
   if(j?.error||!j?.result||j.result.block_height===undefined)
    fail('RPC_ERROR_OR_MISSING_RESULT');
   return j.result;
  }finally{clearTimeout(timer);}
 };
 const results=[];
 for(const id of accounts){
  const result={
   accountId:id,finalBlockHeight:null,verifiedDeployedCodeHash:null,
   wasmSha256MatchesChainCodeHash:false,exportedFlashCandidates:[],
   status:'UNVERIFIED',usableFlashProvider:false,
   supportedLoanAssetVerified:false,lenderRepaymentCallbackVerified:false,
   providerLiquidityVerified:false,gasSponsorVerified:false,
   mainnetBroadcastPermitted:false
  };
  try{
   const accountView=await rpc({request_type:'view_account',
    account_id:id,finality:'final'});
   const height=accountView.block_height;
   if(!Number.isSafeInteger(height)||height<=0||
    typeof accountView.code_hash!=='string')fail('INVALID_ACCOUNT_AT_FINAL');
   const codeView=await rpc({request_type:'view_code',account_id:id,block_id:height});
   if(codeView.block_height!==height)fail('CROSS_BLOCK_CODE_MISMATCH');
   const wasm=bytesBase64(codeView.code_base64);
   const computed=stage140EncodeBase58(createHash('sha256').update(wasm).digest());
   if(computed!==accountView.code_hash||
    codeView.hash!==undefined&&codeView.hash!==computed)
    fail('WASM_SHA256_DOES_NOT_MATCH_DEPLOYMENT');
   let exports;
   try{exports=WebAssembly.Module.exports(new WebAssembly.Module(wasm));}
   catch{fail('WASM_EXPORT_INSPECTION_FAILED');}
   result.finalBlockHeight=height;
   result.verifiedDeployedCodeHash=computed;
   result.wasmSha256MatchesChainCodeHash=true;
   result.exportedFlashCandidates=exports
    .filter(x=>x.kind==='function'&&flashPattern.test(x.name))
    .map(x=>x.name).slice(0,20);
   result.status=result.exportedFlashCandidates.length?
    'FLASH_NAMED_EXPORT_ONLY_ABI_ASSET_AND_SAFETY_NOT_PROVED':
    'NO_FLASH_LOAN_ENTRYPOINT_EXPORTED';
  }catch(e){
   result.status=e?.message?.startsWith('STAGE140_')?
    e.message:'RPC_OR_CONTRACT_INSPECTION_FAILED';
  }
  results.push(result);
 }
 return {
  mode:'STAGE140_ONCHAIN_NATIVE_FLASH_LOAN_DISCOVERY',
  source:'NEAR_RPC_FINALIZED_READ_ONLY_ACCOUNT_AND_WASM',
  network:'NEAR_MAINNET',observedAtMs:now(),
  readOnly:true,requestsAreOnlyViewAccountAndCode:true,
  defaultAccountsAreExistingRheaAndRefNotAssumedFlashProviders:true,
  providerConnectedForExecution:false,
  hasVerifiedUncollateralizedLiNEARProvider:false,
  ownerWallet:'okunlola_labs.near',
  restrictedExecutorProposal:'sillywiki4201.near',
  maySignMainnet:false,mayBroadcastMainnet:false,
  noCollateralLenderContractVerified:false,
  results
 };
}
