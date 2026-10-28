import test from 'node:test';
import assert from 'node:assert/strict';
import {assessTestnetPage,interpretBorrower,classifyTestnetAccount}
 from '../dashboard/server/testnet-assessment.mjs';
const HASH='5r4GsfdDATmriAdT6ZteFpPjDNSfPn4NneETiNuckUc6';
const NOW=1793200000000;
const indexed=[
 {account_id:'active.testnet',positions:{REGULAR:{RegularPosition:{
  borrowed:{'wrap.testnet':'10000'},collateral:{'ref.fakes.testnet':'20000'}}}}},
 {account_id:'stale.testnet',positions:{REGULAR:{RegularPosition:{
  borrowed:{'usdc.fakes.testnet':'10000'},collateral:{'ref.fakes.testnet':'20000'}}}}}
];
function makeMock({priced=false,staleOracle=false,wrongChain=false,drift=false}={}){
 const called=[];
 async function fetchImpl(url,request){
  assert.equal(url,'https://rpc.testnet.near.org');
  const body=JSON.parse(request.body);called.push(body);
  if(body.method==='status')return {ok:true,json:async()=>({result:{
   chain_id:wrongChain?'mainnet':'testnet',
   sync_info:{latest_block_height:276000020,syncing:false}}})};
  const q=body.params;
  if(q.request_type==='view_account')return {ok:true,json:async()=>({result:{
   code_hash:q.account_id==='contract.burrow.testnet'?(drift?'changed-code-hash':HASH):
    'valid-other-oracle-code-hash'}})};
  const args=JSON.parse(Buffer.from(q.args_base64,'base64').toString());
  let value;
  if(q.method_name==='get_config'){
   value={oracle_account_id:'mock-priceoracle.testnet',ref_exchange_id:'ref-finance-101.testnet',
    enable_price_oracle:true};
  }else if(q.method_name==='get_accounts_paged'){
   assert.deepEqual(args,{from_index:0,limit:20});value=indexed;
  }else if(q.method_name==='get_account'){
   if(args.account_id==='active.testnet'){
    value={account_id:args.account_id,borrowed:[{token_id:'wrap.testnet',balance:'10000'}],
     collateral:[{token_id:'ref.fakes.testnet',balance:'20000'}]};
   }else {
    value={account_id:args.account_id,borrowed:[],collateral:[{token_id:'ref.fakes.testnet',balance:'20000'}]};
   }
  }else if(q.method_name==='get_price_data'){
   assert.deepEqual(new Set(args.asset_ids),new Set(['wrap.testnet','ref.fakes.testnet']));
   value={timestamp:String(BigInt(staleOracle?NOW-250000:NOW)*1000000n),
    recency_duration_sec:90,prices:[
     {asset_id:'wrap.testnet',price:priced?{multiplier:'1',decimals:24}:null},
     {asset_id:'ref.fakes.testnet',price:{multiplier:'5',decimals:24}}
    ]};
  }else throw Error('unexpected contract method '+q.method_name);
  return {ok:true,json:async()=>({result:{
   block_height:276000022,result:[...Buffer.from(JSON.stringify(value))]}})};
 }
 return {fetchImpl,called};
}
test('fresh borrower recheck removes stale debt; missing oracle price blocks execution',async()=>{
 const mock=makeMock();
 const result=await assessTestnetPage(0,20,{fetchImpl:mock.fetchImpl,nowMs:NOW});
 assert.equal(result.returned,2);
 assert.equal(result.indexedDebt,2);
 assert.equal(result.freshDebt,1);
 assert.equal(result.staleIndexedDebt,1);
 assert.equal(result.blocked,1);
 assert.equal(result.pending,0);
 assert.equal(result.eligibleVerified,0);
 assert.equal(result.transactionsExecuted,0);
 assert.equal(result.executionEnabled,false);
 assert.equal(result.accounts[0].reason,'MISSING_ORACLE_PRICE');
 assert.deepEqual(result.accounts[0].missingPrices,['wrap.testnet']);
 assert.equal(result.accounts[1].reason,'NO_CURRENT_DEBT');
 assert.equal(result.accounts[1].hasDebt,false);
 assert.ok(mock.called.every(x=>x.method==='status'||x.method==='query'));
 assert.ok(mock.called.every(x=>x.method!=='broadcast_tx_commit'));
});
test('full quotes are not enough to claim liquidation eligibility without health verification',async()=>{
 const mock=makeMock({priced:true});
 const r=await assessTestnetPage(0,20,{fetchImpl:mock.fetchImpl,nowMs:NOW});
 assert.equal(r.freshDebt,1);
 assert.equal(r.pending,1);
 assert.equal(r.blocked,0);
 assert.equal(r.accounts[0].reason,'HEALTH_FACTOR_NOT_VERIFIED');
 assert.equal(r.accounts[0].eligible,false);
 assert.equal(r.accounts[0].eligibilityVerified,false);
});
test('stale price update blocks even otherwise priced account',async()=>{
 const mock=makeMock({priced:true,staleOracle:true});
 const r=await assessTestnetPage(0,20,{fetchImpl:mock.fetchImpl,nowMs:NOW});
 assert.equal(r.blocked,1);
 assert.equal(r.accounts[0].reason,'ORACLE_STALE');
 assert.equal(r.oracle.fresh,false);
});
test('invalid requests and chain/contract drift fail closed',async()=>{
 for(const [from,limit] of [[-1,20],[0,21],[1500001,1],[1.2,1]])
  await assert.rejects(assessTestnetPage(from,limit),/INVALID_TESTNET_ASSESSMENT_PAGE/);
 await assert.rejects(assessTestnetPage(0,20,{fetchImpl:makeMock({wrongChain:true}).fetchImpl}),
  /WRONG_TESTNET_CHAIN/);
 await assert.rejects(assessTestnetPage(0,20,{fetchImpl:makeMock({drift:true}).fetchImpl}),
  /TESTNET_CONTRACT_CODE_HASH_CHANGED/);
});
test('borrower parser rejects unsigned, non-decimal or unrelated account values',()=>{
 assert.throws(()=>interpretBorrower('joe.testnet',{account_id:'different.testnet',
  borrowed:[],collateral:[]}),/TESTNET_FRESH_ACCOUNT_INVALID/);
 const a=interpretBorrower('joe.testnet',{account_id:'joe.testnet',
  borrowed:[{token_id:'wrap.testnet',balance:'100'},{token_id:'bad.testnet',balance:'-1'}],
  collateral:[{token_id:'ref.fakes.testnet',balance:'500'}]});
 assert.equal(a.borrowed.length,1);assert.equal(a.hasDebt,true);
 assert.deepEqual(classifyTestnetAccount(a,new Map([['wrap.testnet',true]]),true).missingPrices,
  ['ref.fakes.testnet']);
});

