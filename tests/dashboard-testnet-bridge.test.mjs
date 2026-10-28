import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTestnet,getTestnetPositions,TESTNET_LENDING,TESTNET_LENDING_HASH}
 from '../dashboard/server/testnet-readonly.mjs';
function rpcMock(calls){
 return async(url,request)=>{
  calls.push({url,request});
  const input=JSON.parse(request.body);
  let result;
  if(input.method==='status')
   result={chain_id:'testnet',sync_info:{latest_block_height:250000000,syncing:false}};
  else if(input.params.request_type==='view_account')
   result={code_hash:TESTNET_LENDING_HASH};
  else{
   const method=input.params.method_name;
   const args=JSON.parse(Buffer.from(input.params.args_base64,'base64').toString());
   const value=method==='get_config'?
    {oracle_account_id:'mock-priceoracle.testnet',ref_exchange_id:'ref-finance-101.testnet'}:
    [{account_id:'legit.testnet',positions:{REGULAR:{RegularPosition:{
     borrowed:{'wrap.testnet':'1000000000000000000000000'},
     collateral:{'usdt.fakes.testnet':'1200000000000'}}}}}];
   assert.equal(method==='get_config'||method==='get_accounts_paged',true);
   if(method==='get_accounts_paged')assert.deepEqual(args,{from_index:0,limit:1});
   result={block_height:250000003,result:[...Buffer.from(JSON.stringify(value))]};
  }
  return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result})};
 }
}
test('Testnet bridge proves actual chain ID, contract hash and oracle config',async()=>{
 const calls=[];
 const h=await inspectTestnet({fetchImpl:rpcMock(calls)});
 assert.equal(h.chainId,'testnet');assert.equal(h.contract,TESTNET_LENDING);
 assert.equal(h.codeHash,TESTNET_LENDING_HASH);assert.equal(h.executionEnabled,false);
 assert.deepEqual(calls.map(c=>JSON.parse(c.request.body).method),
  ['status','query','query']);
 assert.ok(calls.every(c=>c.url==='https://rpc.testnet.near.org'));
});
test('Testnet bridge indexes genuine contract debt strings without profit or eligibility inference',async()=>{
 const calls=[];
 const x=await getTestnetPositions(0,1,{fetchImpl:rpcMock(calls)});
 assert.equal(x.accounts.length,1);
 assert.equal(x.accounts[0].accountId,'legit.testnet');
 assert.equal(x.accounts[0].hasDebt,true);
 assert.equal(x.accounts[0].borrowed[0].tokenId,'wrap.testnet');
 assert.equal(x.accounts[0].borrowed[0].atomic,'1000000000000000000000000');
 assert.equal(x.eligibilityVerified,false);
 assert.equal(x.realizedPnlVerified,false);
 assert.equal(x.blockHeight,250000003);
 assert.equal(calls.length,2);
});
test('public bridge denies user-supplied oversized or malformed pagination',async()=>{
 for(const [from,limit] of [[-1,1],[0,21],[0,0],[1500001,1],[1.5,3],[0,-2]])
  await assert.rejects(getTestnetPositions(from,limit),/INVALID_TESTNET_PAGE/);
});
test('code hash drift stops before borrower scan, never credits execution',async()=>{
 const fetchImpl=async(url,req)=>{
  const data=JSON.parse(req.body);
  if(data.method==='status')return {ok:true,json:async()=>({result:{
   chain_id:'testnet',sync_info:{latest_block_height:1,syncing:false}}})};
  return {ok:true,json:async()=>({result:{code_hash:'UNEXPECTED_HASH'}})};
 };
 await assert.rejects(inspectTestnet({fetchImpl}),/TESTNET_CONTRACT_CODE_HASH_CHANGED/);
 await assert.rejects(getTestnetPositions(0,1,{fetchImpl}),/TESTNET_CONTRACT_CODE_HASH_CHANGED/);
});
test('wrong chain ID cannot be presented as Testnet',async()=>{
 const fetchImpl=async(url,req)=>{
  const data=JSON.parse(req.body);
  return {ok:true,json:async()=>({result:data.method==='status'?
   {chain_id:'mainnet',sync_info:{latest_block_height:123,syncing:false}}:
   {code_hash:TESTNET_LENDING_HASH}})};
 };
 await assert.rejects(inspectTestnet({fetchImpl}),/WRONG_TESTNET_CHAIN/);
});

