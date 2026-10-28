import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SOURCE,validateOwner,createLabManifest,renderSetupPowerShell,writePlan}
 from '../scripts/testnet-lab/plan.mjs';
import {inspectManifest,rpc} from '../scripts/testnet-lab/verify.mjs';

const owner='validoperator.testnet';
const fixture=createLabManifest(owner);
const read=(data)=>({ok:true,json:async()=>({jsonrpc:'2.0',id:'unit',result:data})});
function rpcStub({missing=[],codeDrift=false,initialized=false,wrongOracle=false,
  wrongOwner=false,withAssets=false,chain='testnet'}={}){
 const calls=[];
 const fetchImpl=async(uri,options)=>{
  assert.equal(uri,'https://rpc.testnet.near.org');
  const body=JSON.parse(options.body);calls.push(body);
  if(body.method==='status')return read({chain_id:chain,sync_info:{syncing:false,latest_block_height:275000001}});
  assert.equal(body.method,'query');
  assert.equal(body.params.finality,'final');
  if(body.params.request_type==='view_account'){
   const name=body.params.account_id;
   if(missing.includes(name))return {ok:true,json:async()=>({jsonrpc:'2.0',error:{cause:{name:'UNKNOWN_ACCOUNT'}}})};
   const expectedHash=name===fixture.accountIds.oracle?SOURCE.oracleCodeHash:
    name===fixture.accountIds.lending?SOURCE.lendingCodeHash:'11111111111111111111111111111111';
   return read({code_hash:codeDrift?'badcode':expectedHash,amount:'1000000000000000000000000',block_height:275000001});
  }
  assert.equal(body.params.request_type,'call_function');
  assert.equal(body.params.account_id,fixture.accountIds.lending);
  const method=body.params.method_name;
  if(method==='get_config'){
   return read(initialized?{result:[...Buffer.from(JSON.stringify({...fixture.config,
    oracle_account_id:wrongOracle?'stranger.testnet':fixture.config.oracle_account_id,
    owner_id:wrongOwner?'stranger.testnet':fixture.config.owner_id}))],block_height:275000001}:
   {error:'wasm execution failed: The contract is not initialized',block_height:275000001});
  }
  if(method==='get_assets_paged'){
   assert.deepEqual(JSON.parse(Buffer.from(body.params.args_base64,'base64').toString()),
    {from_index:0,limit:20});
   return read({result:[...Buffer.from(JSON.stringify(withAssets?[['token.testnet',{}]]:[]))],block_height:275000001});
  }
  throw Error('UNEXPECTED_METHOD_'+method);
 };
 return {fetchImpl,calls};
}
test('user-owned Testnet IDs validate strictly and refuse lost-key Stage197 fixture',()=>{
 for(const id of [owner,'arbivane-test-c9812a7f.testnet'])
  assert.equal(validateOwner(id),id);
 for(const id of [undefined,'','.testnet','a.near','a.testnet/thing',
  'alice.testnet:mainnet','arbivane-fixture-66971fd6.testnet'])
  assert.throws(()=>validateOwner(id));
 assert.equal(fixture.accountIds.lending,'lend.'+owner);
 assert.equal(fixture.config.oracle_account_id,'oracle.'+owner);
 assert.equal(fixture.config.owner_id,owner);
 assert.equal(fixture.config.booster_token_id,'booster.'+owner);
 assert.equal(fixture.mainnetExecutionAllowed,false);
 assert.equal(fixture.sharedRheaContractMutationsAllowed,false);
 assert.equal(fixture.executionEnabled,false);
 assert.throws(()=>createLabManifest('a'.repeat(48)+'.testnet'),/TESTNET_SUBACCOUNT_ID_TOO_LONG/);
});
test('generated setup pins upstream WASM, signs only Testnet through local keychain',()=>{
 const ps=renderSetupPowerShell(fixture);
 assert.ok(ps.includes(SOURCE.commit));
 assert.ok(ps.includes(SOURCE.lendingWasm));
 assert.ok(ps.includes(SOURCE.oracleWasm));
 assert.ok(ps.includes('DEPLOY-TESTNET'));
 assert.ok(ps.includes('Need at least 9 TNEAR'));
 assert.ok(ps.includes('Invoke-RestMethod'));
 assert.ok(ps.includes('ownerBalance'));
 assert.ok(ps.includes('with-init-call new'));
 assert.ok(ps.includes('without-init-call'));
 assert.ok(ps.includes('sign-with-keychain'));
 assert.ok(ps.includes('network-config testnet'));
 assert.ok(!ps.includes('--private-key'));
 assert.ok(!ps.includes('sign-with-plaintext-private-key'));
 assert.ok(!ps.includes('network-config mainnet'));
 assert.ok(!ps.includes('contract.burrow.testnet'));
 assert.ok(!ps.includes('arbivane-fixture-66971fd6.testnet'));
 assert.ok(ps.includes('"oracle_account_id":"oracle.validoperator.testnet"'));
 assert.ok(!ps.includes('unused'));
});
test('operator plan is write-once; refuses overwriting signed plans',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'arbivane-plan-'));
 try{
  const generated=await writePlan(owner,dir);
  assert.equal(generated.manifest.network,'testnet');
  assert.deepEqual(JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')),fixture);
  await assert.rejects(writePlan(owner,dir),/EEXIST/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('wrong-chain and public RPC mutation attempts fail closed',async()=>{
 await assert.rejects(rpc('broadcast_tx_commit',{},{}),/RPC_MUTATIONS_FORBIDDEN/);
 await assert.rejects(inspectManifest(fixture,{fetchImpl:rpcStub({chain:'mainnet'}).fetchImpl}),
  /WRONG_CHAIN_OR_RPC_SYNCING/);
});
test('new account plan reports missing owner without pretending deployment',async()=>{
 const stub=rpcStub({missing:[fixture.accountIds.root]});
 const state=await inspectManifest(fixture,{fetchImpl:stub.fetchImpl});
 assert.equal(state.readiness,'OWNER_ACCOUNT_NOT_FOUND');
 assert.equal(state.executionEnabled,false);
 assert.equal(state.verifiedLiquidations,0);
 assert.equal(state.liquidationTransactionVerified,false);
});
test('deployed but uninitialized lender is not a usable liquidation market',async()=>{
 const state=await inspectManifest(fixture,{fetchImpl:rpcStub().fetchImpl});
 assert.equal(state.readiness,'LENDING_UNINITIALIZED');
 assert.equal(state.initialized,false);
 assert.equal(state.verifiedLiquidations,0);
});
test('fully initialized lab still requires assets, receipts, profitability proof',async()=>{
 const stub=rpcStub({initialized:true});
 const state=await inspectManifest(fixture,{fetchImpl:stub.fetchImpl});
 assert.equal(state.readiness,'INITIALIZED_AWAITING_ASSETS');
 assert.equal(state.initialized,true);
 assert.equal(state.configuredOracleId,fixture.accountIds.oracle);
 assert.equal(state.liquidationEligibleVerified,false);
 assert.equal(state.executionEnabled,false);
 assert.equal(state.realizedPnl,null);
 assert.ok(stub.calls.every(c=>['status','query'].includes(c.method)));
});
test('invalid configured oracle, owner and bytecode fail closed',async()=>{
 const drift=await inspectManifest(fixture,{fetchImpl:rpcStub({codeDrift:true}).fetchImpl});
 assert.equal(drift.readiness,'CONTRACT_NOT_DEPLOYED_OR_CODE_MISMATCH');
 const oracle=await inspectManifest(fixture,{fetchImpl:rpcStub({initialized:true,wrongOracle:true}).fetchImpl});
 assert.equal(oracle.readiness,'CONFIG_MISMATCH');
 const ownerState=await inspectManifest(fixture,{fetchImpl:rpcStub({initialized:true,wrongOwner:true}).fetchImpl});
 assert.equal(ownerState.readiness,'CONFIG_MISMATCH');
 await assert.rejects(inspectManifest({...fixture,executionEnabled:true},
  {fetchImpl:rpcStub().fetchImpl}),/MANIFEST_TAMPERED_OR_INCOMPATIBLE/);
});

