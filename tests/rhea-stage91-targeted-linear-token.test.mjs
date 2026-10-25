import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloneStage91LinearToken} from '../scripts/stage91-targeted-linear-token.mjs';

const H=221547875,HASH='8'.repeat(43),CODE='D'.repeat(43);
const LENDER='contract.main.burrow.near',BORROWER='borrower.near';
const enc=b=>Buffer.from(b).toString('base64');
const u64=n=>{const a=Buffer.alloc(8);a.writeBigUInt64LE(BigInt(n));return a;};
const name=id=>{const b=Buffer.from(id),l=Buffer.alloc(4);l.writeUInt32LE(b.length);return Buffer.concat([l,b]);};
const cat=(prefix,value)=>Buffer.concat([Buffer.from(prefix),Buffer.from(value)]);
const data=n=>{const b=Buffer.alloc(48);b.writeBigUInt64LE(BigInt(n),16);return b;};
const metadata={spec:'ft-1.0.0',name:'LiNEAR',symbol:'LiNEAR',decimals:24};
const bounds={min:'1250000000000000000000',max:'1250000000000000000000'};
const registered={total:bounds.min,available:'0'};
function scenario({badIndex=false,badSourceBalance=false,badBlock=false,badCode=false,absentVault=false}={}){
 const keys=new Map(),queries=[],patches=[],imports=[];
 keys.set(enc('STATE'),enc(Buffer.alloc(125,15)));
 for(const [account,idx,balance] of [[LENDER,1,100],[BORROWER,2,20]]){
  if(account===LENDER&&absentVault)continue;
  const i=cat([0,105],name(account));
  keys.set(enc(i),enc(u64(idx)));
  keys.set(enc(cat([0,107],u64(idx))),enc(
   badIndex&&account===LENDER?name('imposter.near'):name(account)));
  keys.set(enc(cat([0,118],u64(idx))),enc(data(balance)));
 }
 const values={
  ft_total_supply:'1000',ft_metadata:metadata,
  storage_balance_bounds:bounds,get_number_of_accounts:10,
 };
 const source=(method,args)=>{
  if(method==='ft_balance_of')return args.account_id===LENDER?
    (badSourceBalance?'101':'100'):'20';
  if(method==='storage_balance_of')return registered;
  return values[method];
 };
 const rpc={
  viewAccount:async()=>({blockHeight:String(H),codeHash:badCode?'E'.repeat(43):CODE}),
  view:async(_id,method,args,block)=>{assert.equal(block,H);
   return {blockHeight:String(H),value:source(method,args)};
  }
 };
 const root={importContract:async opts=>{
  imports.push(opts);const state=new Map();
  return {
   accountId:'linear-protocol.near',
   accountView:async()=>({code_hash:CODE}),
   patchStateRecords:async({records})=>{
    for(const x of records){patches.push(x);state.set(x.Data.data_key,x.Data.value);}
   },
   view:async(method,args)=>{
    if(!state.has(enc('STATE')))throw Error('Missing historical state');
    if(method==='get_number_of_accounts')return 10;
    if(method==='ft_total_supply')return '1000';
    if(method==='ft_metadata')return metadata;
    if(method==='storage_balance_bounds')return bounds;
    const index=state.get(enc(cat([0,105],name(args.account_id))));
    if(!index)return method==='ft_balance_of'?'0':null;
    const pos=Buffer.from(index,'base64');
    const v=state.get(enc(cat([0,118],pos)));
    const key=state.get(enc(cat([0,107],pos)));
    if(key!==enc(name(args.account_id))||!v)
     throw Error('Missing indexed exact record');
    if(method==='ft_balance_of')return Buffer.from(v,'base64').readBigUInt64LE(16).toString();
    if(method==='storage_balance_of')return registered;
    throw Error('Unknown view');
   }
  };
 }};
 const fetcher=async(_url,request)=>{
  const p=JSON.parse(request.body).params;
  queries.push(p.prefix_base64);
  const values=keys.has(p.prefix_base64)?[{
   key:p.prefix_base64,value:keys.get(p.prefix_base64)
  }]:[];
  return new Response(JSON.stringify({result:{
   block_height:H,block_hash:badBlock&&p.prefix_base64!==enc('STATE')?
    'C'.repeat(43):HASH,values,
  }}),{status:200});
 };
 return {args:{root,rpc,endpoint:'https://archival-rpc.mainnet.fastnear.com',
   blockHeight:H,lendingAccountId:LENDER,borrowerAccountId:BORROWER,
   fetcher,paceMs:0},queries,patches,imports};
}
test('Stage91 imports exact historical LiNEAR indexed account closure and attests real contract views',async()=>{
 const x=scenario(),out=await cloneStage91LinearToken(x.args);
 assert.equal(out.evidence.recordsRead,7);
 assert.equal(out.evidence.recordsPatched,7);
 assert.equal(out.evidence.sourceQueryCount,7);
 assert.equal(out.evidence.accountCountObserved,10);
 assert.equal(out.evidence.sourceBlockHash,HASH);
 assert.equal(out.evidence.exactHistoricalIndexKeyValueVerified,true);
 assert.equal(out.evidence.criticalFtViewsAgreeWithSource,true);
 assert.equal(out.evidence.originalDeployedWasmVerified,true);
 assert.equal(out.evidence.providerPaginationExhausted,false);
 assert.equal(out.evidence.completeTrieRootParityVerified,false);
 assert.equal(out.evidence.realLiquidationVerified,false);
 assert.equal(out.evidence.mainnetMutated,false);
 assert.ok(!x.queries.includes(''));
 assert.deepEqual(x.imports,[{mainnetContract:'linear-protocol.near',blockId:H,withData:false}]);
 assert.deepEqual(x.patches.map(z=>z.Data.data_key),x.queries);
});
test('Stage91 refuses wrong key index or source view, missing vault, different block and wrong code hash',async()=>{
 for(const kind of ['badIndex','badSourceBalance','absentVault','badBlock','badCode']){
  const x=scenario({[kind]:true});
  await assert.rejects(()=>cloneStage91LinearToken(x.args),/STAGE91_/);
  if(!['badCode','badSourceBalance'].includes(kind))assert.equal(x.imports.length,0);
 }
});
test('Stage91 canary never enables signing, lending transaction or fabricated liquidity',async()=>{
 const canary=await readFile(new URL('../scripts/stage91-linear-source-canary.mjs',import.meta.url),'utf8');
 const flow=await readFile(new URL('../.github/workflows/rhea-stage91-linear-canary.yml',import.meta.url),'utf8');
 assert.ok(canary.includes('cloneStage91LinearToken({'));
 assert.ok(canary.includes("p.repay?.tokenId!=='linear-protocol.near'"));
 assert.ok(canary.includes("p.seize?.tokenId!=='linear-protocol.near'"));
 assert.ok(canary.includes('actualRheaSettlementVerified:false'));
 assert.ok(canary.includes('localLiquidationAttempted:false'));
 assert.ok(canary.includes("status='HISTORICAL_LINEAR_INDEX_AND_FT_VIEWS_VERIFIED_NOT_LIQUIDATION'"));
 assert.ok(flow.includes("run-id: '40199603942'"));
 assert.ok(flow.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(flow.includes('cancel-in-progress: false'));
 assert.ok(flow.includes('rhea-stage91-authentic-linear-parity'));
 assert.ok(!canary.includes('callRaw('));
 assert.ok(!canary.includes('broadcast_tx'));
});

test('Stage95 retries authentic pinned LiNEAR source RPC 429 without weakening code or index parity',async()=>{
 const x=scenario();const original=x.args.rpc.view;let failed=false,calls=0;
 x.args.rpc.view=async(...args)=>{
  calls++;
  if(!failed&&args[1]==='ft_total_supply'){
   failed=true;
   const {NearRpcHttpError}=await import('../src/rhea/rpc.ts');
   throw new NearRpcHttpError(429,'0');
  }
  return original(...args);
 };
 const out=await cloneStage91LinearToken(x.args);
 assert.equal(failed,true);
 assert.ok(calls>8);
 assert.equal(out.evidence.recordsRead,7);
 assert.equal(out.evidence.criticalFtViewsAgreeWithSource,true);
 assert.equal(out.evidence.mainnetMutated,false);
 assert.equal(out.evidence.realLiquidationVerified,false);
});

test('Stage95 produces a bounded actionable error when LiNEAR source RPC cannot be trusted',async()=>{
 const x=scenario();const orig=x.args.rpc.view;
 x.args.rpc.view=async(...args)=>{
  if(args[1]==='ft_metadata')throw Error('auth token=PRIVATE_VALUE https://vault.example/rpc');
  return orig(...args);
 };
 await assert.rejects(()=>cloneStage91LinearToken(x.args),
  /STAGE95_PINNED_LINEAR_SOURCE_VIEW_UNAVAILABLE/);
 assert.equal(x.imports.length,0);
});

test('Stage95 still rejects falsified source registration and partial local state after paced reads',async()=>{
 const x=scenario({badSourceBalance:true});
 await assert.rejects(()=>cloneStage91LinearToken(x.args),
  /STAGE91_PINNED_SOURCE_AND_SANDBOX_FT_VIEW_DIFFER/);
 assert.equal(x.imports.length,1);
 assert.equal(x.patches.length,7);
});

test('Stage101 safely restarts all pinned LiNEAR source views on independent archival RPC after 429 exhaustion',async()=>{
 const x=scenario(),independent=x.args.rpc;
 let fallbackCalls=0;
 x.args.rpc={...independent,
  view:async()=>{const {NearRpcHttpError}=await import('../src/rhea/rpc.ts');throw new NearRpcHttpError(429,'0');}};
 x.args.fallbackRpc={...independent,
  viewAccount:async(...args)=>{fallbackCalls++;return independent.viewAccount(...args);},
  view:async(...args)=>{fallbackCalls++;return independent.view(...args);}};
 const result=await cloneStage91LinearToken(x.args);
 assert.equal(result.evidence.sourceViewFallbackUsed,true);
 assert.equal(fallbackCalls,9);
 assert.equal(result.evidence.criticalFtViewsAgreeWithSource,true);
 assert.equal(result.evidence.mainnetMutated,false);
 assert.equal(result.evidence.realLiquidationVerified,false);
});
test('Stage101 rejects historical block drift on fallback without importing Sandbox state',async()=>{
 const x=scenario(),independent=x.args.rpc;
 x.args.rpc={...independent,
  view:async()=>{const {NearRpcHttpError}=await import('../src/rhea/rpc.ts');throw new NearRpcHttpError(503,'0');}};
 x.args.fallbackRpc={...independent,
  view:async(...args)=>({...await independent.view(...args),blockHeight:String(H+1)})};
 await assert.rejects(()=>cloneStage91LinearToken(x.args),
  /STAGE91_HISTORICAL_LINEAR_SOURCE_INVALID/);
 assert.equal(x.imports.length,0);
});
test('Stage101 never routes deterministic contract errors through a fallback provider',async()=>{
 const x=scenario(),independent=x.args.rpc;let fallbackCalls=0;
 x.args.rpc={...independent,view:async()=>{throw Error('contract view rejected');}};
 x.args.fallbackRpc={...independent,
  view:async(...args)=>{fallbackCalls++;return independent.view(...args);}};
 await assert.rejects(()=>cloneStage91LinearToken(x.args),
  /STAGE95_PINNED_LINEAR_SOURCE_VIEW_UNAVAILABLE/);
 assert.equal(fallbackCalls,0);
 assert.equal(x.imports.length,0);
});

test('Stage105 recovers a pinned historical LiNEAR code import through an independent archival RPC',async()=>{
 const x=scenario(),original=x.args.root.importContract;
 const prior=process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL;
 let attempts=0;
 x.args.root.importContract=async opts=>{
  attempts++;
  if(attempts===1)throw Error('HTTPError 429 rate limit');
  assert.equal(opts.mainnetContract,'linear-protocol.near');
  assert.equal(opts.blockId,H);
  assert.equal(opts.withData,false);
  assert.equal(process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL,
   'https://archival-rpc.mainnet.near.org');
  return original(opts);
 };
 try{
  process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL=x.args.endpoint;
  const result=await cloneStage91LinearToken(x.args);
  assert.equal(attempts,2);
  assert.equal(result.evidence.codeImportFallbackUsed,true);
  assert.equal(result.evidence.criticalFtViewsAgreeWithSource,true);
  assert.equal(result.evidence.mainnetMutated,false);
  assert.equal(result.evidence.realLiquidationVerified,false);
  assert.equal(process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL,x.args.endpoint);
 }finally{
  if(prior===undefined)delete process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL;
  else process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL=prior;
 }
});
test('Stage105 never retries deterministic contract or Sandbox patch failures',async()=>{
 const x=scenario(),orig=x.args.root.importContract;
 let attempts=0;
 x.args.root.importContract=async()=>{
  attempts++;throw Error('Sandbox local state mismatch, invalid historical code hash');
 };
 await assert.rejects(()=>cloneStage91LinearToken(x.args),
  /STAGE95_LOCAL_LINEAR_WASM_IMPORT_FAILED/);
 assert.equal(attempts,1);
 assert.equal(x.imports.length,0);
 const y=scenario();let patches=0;
 y.args.root.importContract=async opts=>{
  const contract=await orig(opts);
  return {...contract,patchStateRecords:async()=>{patches++;throw Error('patch failure');}};
 };
 await assert.rejects(()=>cloneStage91LinearToken(y.args),
  /STAGE95_LOCAL_LINEAR_INDEX_PATCH_FAILED/);
 assert.equal(patches,1);
});
test('Stage105 rejects an independent archival WASM failure without claiming settlement',async()=>{
 const x=scenario(),original=process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL;
 let requests=0;
 x.args.root.importContract=async()=>{requests++;throw Error('HTTP 503 upstream unavailable');};
 try{
  await assert.rejects(()=>cloneStage91LinearToken(x.args),
   /STAGE105_PINNED_LINEAR_WASM_FALLBACK_FAILED/);
  assert.equal(requests,2);
  assert.equal(x.patches.length,0);
  assert.equal(process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL,original);
 }finally{
  if(original===undefined)delete process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL;
  else process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL=original;
 }
});
