import test from 'node:test';
import assert from 'node:assert/strict';
import {
 prefundStage124RheaSupply,stage126PrefundFailureCode,
} from '../scripts/stage124-rhea-supply-prefund.mjs';

const token='linear-protocol.near';
const plan=()=>({
 chain:'NEAR_SANDBOX',method:'execute_with_pyth',executionEnabled:false,
 maySignMainnet:false,mayBroadcastMainnet:false,
 actions:[
  {Borrow:{token_id:token,amount:'100'}},
  {Liquidate:{account_id:'debtor.near',
   in_assets:[{token_id:token,max_amount:'100'}],
   out_assets:[{token_id:token,amount:'110'}]}},
  {Repay:{token_id:token,amount:'100'}},
  {Withdraw:{token_id:token,amount:'10'}},
 ],
});
const pos=(borrow='0',supplied='0')=>({
 positions:{REGULAR:{borrowed:borrow==='0'?[]:[{token_id:token,balance:borrow}]}},
 supplied:supplied==='0'?[]:[{token_id:token,balance:supplied}],
});
const args=({callRaw,positions,ft,events})=>({
 actor:{accountId:'actor.test.near',callRaw},
 lending:{accountId:'contract.main.burrow.near',
  view:async()=>positions.shift()},
 repayToken:{accountId:token,view:async()=>ft.shift()},
 plan:plan(),repayReserve:{repayTokenId:token,extraDecimals:0,
  requiredFtAtomicRoundedUp:'100'},
 provider:{txStatus:async()=>{throw Error('Unexpected network status read')}},
 onEvidence:async(kind,raw)=>{events.push({kind,raw});},
});
const success=(hash)=>({
 final_execution_status:'FINAL',transaction:{hash,signer_id:'actor.test.near'},
 status:{SuccessValue:''},receipts_outcome:[{
  id:'receipt-'+hash,outcome:{status:{SuccessValue:''}},
 }],
});

test('Stage126 preserves genuine failed borrowing receipt but never claims funding',async()=>{
 const events=[];
 const failed={result:{
  final_execution_status:'FINAL',transaction:{hash:'local-rejected'},
  status:{Failure:{reason:'Contract rejected'}},
  receipts_outcome:[{
   id:'borrow-child',outcome:{status:{Failure:{reason:'Rejected'}}},
  }],
 }};
 let attempted=0;
 const input=args({events,callRaw:async()=>{
  attempted++;
  return failed;
 },positions:[pos()],ft:['0']});
 await assert.rejects(prefundStage124RheaSupply(input),
  /STAGE124_BORROW_UNVERIFIED_RECEIPTS/);
 assert.equal(attempted,1);
 assert.deepEqual(events.map(x=>x.kind),['borrowRaw']);
 assert.deepEqual(events[0].raw.receipts_outcome,failed.result.receipts_outcome);
});

test('Stage126 saves both raw and final signed prefinance transactions',async()=>{
 const events=[];
 const tx=[success('borrow-hash'),success('supply-hash')];
 const input=args({events,callRaw:async()=>tx.shift(),
  positions:[pos(),pos('100'),pos('100','100')],
  ft:['0','100','0']});
 const res=await prefundStage124RheaSupply(input);
 assert.equal(res.mode,'STAGE124_AUTHENTIC_BORROW_TO_SUPPLIED_FT_PREFUND');
 assert.equal(res.actualFtReturnedToSupply,true);
 assert.deepEqual(events.map(x=>x.kind),
  ['borrowRaw','borrowFinal','depositRaw','depositFinal']);
 assert.equal(events[0].raw.transaction.hash,'borrow-hash');
 assert.equal(events[2].raw.transaction.hash,'supply-hash');
});

test('Stage126 redacts provider exceptions and retains only fixed error codes',()=>{
 assert.equal(stage126PrefundFailureCode(
  Error('STAGE124_BORROW_NOT_FUNDED_IN_REAL_FT')),
  'STAGE124_BORROW_NOT_FUNDED_IN_REAL_FT');
 assert.equal(stage126PrefundFailureCode(
  Error('rpc failure https://example.com/?token=SECRET')),
  'STAGE126_PREFUND_UNCLASSIFIED_REJECTION');
 assert.equal(stage126PrefundFailureCode({message:'STAGE124_FAKE'}),
  'STAGE126_PREFUND_UNCLASSIFIED_REJECTION');
});
