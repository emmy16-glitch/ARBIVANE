import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 stage140InspectNativeAccounts,stage140EncodeBase58,STAGE140_WATCH_ACCOUNTS
} from '../scripts/stage140-native-flash-provider-discovery.mjs';

function wasm(exported){
 const text=Buffer.from(exported,'utf8');
 return Buffer.from([
 0,97,115,109,1,0,0,0,
 1,4,1,0x60,0,0,
 3,2,1,0,
 7,4+text.length,1,text.length,...text,0,0,
 10,4,1,2,0,11
 ]);
}
function fakeRemote(exported,{wrongCode=false,stale=false}={}){
 const binary=wasm(exported);
 const hash=stage140EncodeBase58(createHash('sha256').update(binary).digest());
 const queried=[];
 const fetcher=async(_url,options)=>{
  const req=JSON.parse(options.body);
  assert.equal(req.method,'query');
  assert.ok(['view_account','view_code'].includes(req.params.request_type));
  queried.push(req.params);
  return {ok:true,headers:{get:()=>null},json:async()=>({
   jsonrpc:'2.0',id:req.id,
   result:req.params.request_type==='view_account'?
    {block_height:234,code_hash:wrongCode?'11111111111111111111111111111111':hash}:
    {block_height:stale?233:234,hash,code_base64:binary.toString('base64')}
  })};
 };
 return {fetcher,queried,hash};
}
test('Stage140 attests deployed code SHA256 and reports absence of native flash method',async()=>{
 const f=fakeRemote('execute_with_pyth');
 const r=await stage140InspectNativeAccounts({accounts:['contract.main.burrow.near'],fetcher:f.fetcher,now:()=>1});
 assert.equal(r.results[0].status,'NO_FLASH_LOAN_ENTRYPOINT_EXPORTED');
 assert.equal(r.results[0].verifiedDeployedCodeHash,f.hash);
 assert.equal(r.results[0].wasmSha256MatchesChainCodeHash,true);
 assert.deepEqual(r.results[0].exportedFlashCandidates,[]);
 assert.equal(r.hasVerifiedUncollateralizedLiNEARProvider,false);
 assert.equal(r.mayBroadcastMainnet,false);
 assert.equal(f.queried[1].block_id,f.queried[0].finality==='final'?234:-1);
 assert.deepEqual(f.queried.map(x=>x.request_type),['view_account','view_code']);
});
test('Stage140 does not accept a flash_loan WASM export as a verified provider',async()=>{
 const f=fakeRemote('flash_loan');
 const r=await stage140InspectNativeAccounts({accounts:['v2.ref-finance.near'],fetcher:f.fetcher});
 assert.equal(r.results[0].status,'FLASH_NAMED_EXPORT_ONLY_ABI_ASSET_AND_SAFETY_NOT_PROVED');
 assert.deepEqual(r.results[0].exportedFlashCandidates,['flash_loan']);
 assert.equal(r.results[0].usableFlashProvider,false);
 assert.equal(r.providerConnectedForExecution,false);
 assert.equal(r.maySignMainnet,false);
});
test('Stage140 refuses changed code SHA256, cross-block drift or unknown contract data',async()=>{
 for(const option of [{wrongCode:true},{stale:true}]){
  const f=fakeRemote('flash_loan',option);
  const r=await stage140InspectNativeAccounts({accounts:['v2.ref-finance.near'],fetcher:f.fetcher});
  assert.equal(r.results[0].wasmSha256MatchesChainCodeHash,false);
  assert.equal(r.results[0].usableFlashProvider,false);
  assert.match(r.results[0].status,/STAGE140_(WASM_SHA256_DOES_NOT_MATCH_DEPLOYMENT|CROSS_BLOCK_CODE_MISMATCH)/);
 }
});
test('Stage140 accepts no broad asset list, duplicate, HTTP endpoints or signing method',async()=>{
 await assert.rejects(()=>stage140InspectNativeAccounts({
  rpcUrl:'http://public.example',
  fetcher:fakeRemote('flash_loan').fetcher
 }),/STAGE140_INSECURE_RPC/);
 await assert.rejects(()=>stage140InspectNativeAccounts({
  accounts:['ref.near','ref.near'],fetcher:fakeRemote('flash_loan').fetcher
 }),/STAGE140_INVALID_ACCOUNTS/);
 assert.deepEqual(STAGE140_WATCH_ACCOUNTS,[
  'contract.main.burrow.near','v2.ref-finance.near'
 ]);
});
