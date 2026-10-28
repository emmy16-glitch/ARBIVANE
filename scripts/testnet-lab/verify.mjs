/**
 * Stage198: read-only independently verifies a user-owned Testnet fixture.
 * No signed transactions and no caller-provided RPC endpoint.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLabManifest} from './plan.mjs';

const RPC='https://rpc.testnet.near.org';
function failure(code){throw Error(code)}
export async function rpc(method,params,{fetchImpl=fetch}={}){
 if(!['status','query'].includes(method))failure('RPC_MUTATIONS_FORBIDDEN');
 const result=await fetchImpl(RPC,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:'arbivane-lab-verify',method,params}),
  signal:AbortSignal.timeout(15000),
 });
 if(!result.ok)failure('TESTNET_RPC_HTTP_'+result.status);
 const json=await result.json();
 if(json.error){
  const cause=String(json.error?.cause?.name??'');
  if(['UNKNOWN_ACCOUNT','ACCOUNT_DOES_NOT_EXIST'].includes(cause))
   failure('TESTNET_ACCOUNT_NOT_FOUND');
  failure('TESTNET_RPC_BAD_RESPONSE');
 }
 if(!json.result)failure('TESTNET_RPC_BAD_RESPONSE');
 return json.result;
}
export async function inspectManifest(manifest,{fetchImpl=fetch}={}){
 if(!manifest||manifest.network!=='testnet'||manifest.schemaVersion!==1)
  failure('INVALID_TESTNET_LAB_MANIFEST');
 const expected=createLabManifest(manifest.accountIds?.root);
 if(JSON.stringify(manifest)!==JSON.stringify(expected))
  failure('MANIFEST_TAMPERED_OR_INCOMPATIBLE');
 const request={fetchImpl},status=await rpc('status',[],request);
 if(status.chain_id!=='testnet'||status.sync_info?.syncing!==false)
  failure('WRONG_CHAIN_OR_RPC_SYNCING');
 const roles=['root','oracle','lending','borrower','liquidator'];
 const accounts={};
 for(const role of roles){
  const accountId=manifest.accountIds[role];
  try{
   const result=await rpc('query',{request_type:'view_account',
    finality:'final',account_id:accountId},request);
   accounts[role]={accountId,exists:true,codeHash:result.code_hash,
    sourceBlock:result.block_height,
    balanceYocto:result.amount};
  }catch(err){
   if(err?.message!=='TESTNET_ACCOUNT_NOT_FOUND')throw err;
   accounts[role]={accountId,exists:false,codeHash:null,sourceBlock:null};
  }
 }
 let readiness='ACCOUNTS_NOT_CREATED',config=null,assets=null;
 const owner=accounts.root;
 if(!owner.exists)readiness='OWNER_ACCOUNT_NOT_FOUND';
 else if(roles.slice(1).every(k=>accounts[k].exists)){
  if(accounts.oracle.codeHash!==manifest.wasm.oracleCodeHash||
     accounts.lending.codeHash!==manifest.wasm.lendingCodeHash)
   readiness='CONTRACT_NOT_DEPLOYED_OR_CODE_MISMATCH';
  else{
   let result;
   try{result=await rpc('query',{request_type:'call_function',
    finality:'final',account_id:manifest.accountIds.lending,
    method_name:'get_config',args_base64:Buffer.from('{}').toString('base64')},request)}
   catch(e){readiness='LENDING_CONFIG_UNAVAILABLE'}
   if(typeof result?.error==='string'){
    readiness=/not initialized/i.test(result.error)?
     'LENDING_UNINITIALIZED':'LENDING_CONFIG_UNAVAILABLE';
   }else if(!result?.result)readiness='LENDING_CONFIG_UNAVAILABLE';
   else{
    try{config=JSON.parse(Buffer.from(result.result).toString());
     if(JSON.stringify(config)!==JSON.stringify(manifest.config)){
      // Strict equality after preserving known config key types.
      const fields=Object.keys(manifest.config);
      if(fields.some(k=>config[k]!==manifest.config[k]))
       readiness='CONFIG_MISMATCH';
     }
     if(readiness!=='CONFIG_MISMATCH'){
      const reply=await rpc('query',{request_type:'call_function',
       finality:'final',account_id:manifest.accountIds.lending,
       method_name:'get_assets_paged',
       args_base64:Buffer.from('{"from_index":0,"limit":20}').toString('base64')},request);
      assets=Array.isArray(reply.result)?JSON.parse(Buffer.from(reply.result).toString()):null;
      readiness=Array.isArray(assets)&&assets.length>0?'ASSET_SETUP_NEEDS_VERIFICATION':
       'INITIALIZED_AWAITING_ASSETS';
     }
    }catch{readiness='LENDING_CONFIG_UNAVAILABLE'}
   }
  }
 }
 return {network:'testnet',readiness,accounts,initialized:config!==null&&
  !['CONFIG_MISMATCH','LENDING_CONFIG_UNAVAILABLE'].includes(readiness),
  configuredOracleId:config?.oracle_account_id??null,
  assetsObserved:Array.isArray(assets)?assets.length:null,
  sourceBlock:status.sync_info?.latest_block_height??null,
  liquidationEligibleVerified:false,liquidationTransactionVerified:false,
  verifiedLiquidations:0,realizedPnl:null,executionEnabled:false};
}
export async function verifyFile(filename,options={}){
 const text=await readFile(filename,'utf8');
 let parsed;
 try{parsed=JSON.parse(text)}catch{failure('INVALID_MANIFEST_JSON')}
 return inspectManifest(parsed,options);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const i=process.argv.indexOf('--manifest');
 if(i<0||!process.argv[i+1]){
  console.error('Usage: node scripts/testnet-lab/verify.mjs --manifest <path>');
  process.exitCode=2;
 }else verifyFile(process.argv[i+1]).then(
  output=>{
   console.log(JSON.stringify(output,null,2));
   if(output.readiness!=='ASSET_SETUP_NEEDS_VERIFICATION'&&
      output.readiness!=='INITIALIZED_AWAITING_ASSETS')process.exitCode=3;
  },
  e=>{console.error(e.message);process.exitCode=1}
 );
}

