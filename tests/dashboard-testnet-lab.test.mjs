import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTestnetLab,TESTNET_LAB} from '../dashboard/server/testnet-lab.mjs';

function mock({initialized=false,codeDrift=false,wrongChain=false,incorrectOracle=false}={}){
 const calls=[];
 const fetchImpl=async(uri,opts)=>{
  assert.equal(uri,'https://rpc.testnet.near.org');
  const req=JSON.parse(opts.body);calls.push(req);
  if(req.method==='status')return {ok:true,json:async()=>({result:{
   chain_id:wrongChain?'mainnet':'testnet',sync_info:{syncing:false}}})};
  if(req.params.request_type==='view_account'){
   const account=req.params.account_id;
   const expected=[TESTNET_LAB.lending,TESTNET_LAB.oracle].find(c=>c.accountId===account);
   assert.ok(expected);
   return {ok:true,json:async()=>({result:{block_height:275000000,
    code_hash:codeDrift?'different-wasm':expected.codeHash}})};
  }
  assert.equal(req.params.request_type,'call_function');
  assert.equal(req.params.account_id,TESTNET_LAB.lending.accountId);
  assert.equal(req.params.method_name,'get_config');
  assert.equal(Buffer.from(req.params.args_base64,'base64').toString(),'{}');
  return {ok:true,json:async()=>({result:initialized?
   {block_height:275000004,result:[...Buffer.from(JSON.stringify({
    oracle_account_id:incorrectOracle?'wrongoracle.testnet':TESTNET_LAB.oracle.accountId,
    owner_id:TESTNET_LAB.account}))]}:
   {block_height:275000003,error:'wasm execution failed: The contract is not initialized'}})};
 };
 return {fetchImpl,calls};
}
test('live fixture is transparently deployed but uninitialized, with no receipts',async()=>{
 const stub=mock();const report=await inspectTestnetLab({fetchImpl:stub.fetchImpl});
 assert.equal(report.status,'DEPLOYED_UNINITIALIZED');
 assert.equal(report.initialized,false);
 assert.equal(report.verifiedTransactions,0);
 assert.equal(report.executionEnabled,false);
 assert.equal(report.signerConnected,false);
 assert.equal(report.assetsVerified,false);
 assert.equal(report.borrowerHealthVerified,false);
 assert.equal(report.contracts.length,2);
 assert.ok(report.contracts.every(c=>c.codeVerified));
 assert.ok(stub.calls.every(c=>c.method==='query'||c.method==='status'));
 assert.ok(stub.calls.every(c=>c.method!=='broadcast_tx_commit'&&c.method!=='send_tx'));
});
test('even correctly initialized lending cannot claim liquidation readiness',async()=>{
 const stub=mock({initialized:true});const x=await inspectTestnetLab({fetchImpl:stub.fetchImpl});
 assert.equal(x.status,'MARKET_SETUP_REQUIRED');
 assert.equal(x.initialized,true);
 assert.equal(x.configuredOracleId,TESTNET_LAB.oracle.accountId);
 assert.equal(x.verifiedTransactions,0);
 assert.equal(x.executionEnabled,false);
});
test('mismatched oracle id fails readiness rather than promoting a receipt',async()=>{
 const x=await inspectTestnetLab({fetchImpl:mock({initialized:true,incorrectOracle:true}).fetchImpl});
 assert.equal(x.status,'INVALID_LENDING_CONFIGURATION');
 assert.equal(x.executionEnabled,false);
});
test('pinned WASM drift fails closed without a dynamic RPC method',async()=>{
 const stub=mock({codeDrift:true});const x=await inspectTestnetLab({fetchImpl:stub.fetchImpl});
 assert.equal(x.status,'CODE_DRIFT');
 assert.equal(x.verifiedTransactions,0);
 assert.ok(!stub.calls.some(c=>c.params?.method_name));
});
test('wrong blockchain is refused',async()=>{
 await assert.rejects(inspectTestnetLab({fetchImpl:mock({wrongChain:true}).fetchImpl}),
   /TESTNET_LAB_WRONG_CHAIN/);
});

