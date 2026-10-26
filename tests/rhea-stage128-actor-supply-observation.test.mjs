import test from 'node:test';
import assert from 'node:assert/strict';
import {prefundStage124RheaSupply} from '../scripts/stage124-rhea-supply-prefund.mjs';
const token='linear-protocol.near',actorId='arbivane-replay.test.near';
const txHash='6Sq4VHBUvh96zkKP5AnY8J5vSzp5U6fs7tHw5uweYqc9';
const plan={
 chain:'NEAR_SANDBOX',method:'execute_with_pyth',
 executionEnabled:false,mayBroadcastMainnet:false,maySignMainnet:false,
 actions:[
  {Borrow:{token_id:token,amount:'100'}},
  {Liquidate:{account_id:'debtor.near',
   in_assets:[{token_id:token,max_amount:'100'}],
   out_assets:[{token_id:token,amount:'120'}]}},
  {Repay:{token_id:token,amount:'100'}},
  {Withdraw:{token_id:token,max_amount:'20'}}
 ],
};
const positions=(debt,supplied)=>({
 positions:{REGULAR:{borrowed:debt?[{token_id:token,balance:String(debt)}]:[],
  collateral:[]}},
 supplied:supplied?[{token_id:token,balance:String(supplied)}]:[]
});
test('Stage128 preserves BOTH source-backed real Rhea share credit and zero external FT and blocks synthetic transfers',async()=>{
 const captured=[];
 const reads=[positions(0,0),positions(100,100)];
 const fts=['0','0'];
 const data={
  actor:{accountId:actorId,
   callRaw:async()=>({
    final_execution_status:'FINAL',transaction:{hash:txHash,signer_id:actorId},
    status:{SuccessValue:''},receipts_outcome:[
     {id:'5'.repeat(43),outcome:{status:{SuccessValue:''}}}
    ]
   })},
  lending:{accountId:'contract.main.burrow.near',
   view:async()=>reads.shift()},
  repayToken:{accountId:token,view:async()=>fts.shift()},
  provider:{txStatus:async()=>{throw Error('unexpected actual RPC in mock FINAL');}},
  plan,repayReserve:{repayTokenId:token,extraDecimals:0,
   requiredFtAtomicRoundedUp:'100'},
  onBorrowSnapshot:async row=>captured.push(row),
 };
 await assert.rejects(()=>prefundStage124RheaSupply(data),
  /STAGE124_BORROW_NOT_FUNDED_IN_REAL_FT/);
 assert.equal(captured.length,1);
 const witness=captured[0];
 assert.equal(witness.chain,'NEAR_SANDBOX');
 assert.equal(witness.finalizedBorrowTransactionHash,txHash);
 assert.equal(witness.observedActorBorrowDebtInternal,'100');
 assert.equal(witness.observedActorRheaSuppliedInternal,'100');
 assert.equal(witness.observedActorExternalFtAtomic,'0');
 assert.equal(witness.eligibleForExternalFtPrefund,false);
 assert.equal(witness.protocolAccountingPathConfirmed,false);
 assert.equal(witness.mainnetExecutionEnabled,false);
});
test('Stage128 cannot silently install invalid balance evidence callback',async()=>{
 await assert.rejects(()=>prefundStage124RheaSupply({
  onBorrowSnapshot:true
 }),/STAGE128_INVALID_READONLY_BALANCE_EVIDENCE_WRITER/);
});
