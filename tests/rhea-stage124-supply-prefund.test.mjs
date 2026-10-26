import test from 'node:test';
import assert from 'node:assert/strict';
import {prefundStage124RheaSupply} from '../scripts/stage124-rhea-supply-prefund.mjs';

function replay(supplied='999990'){
 const tokenId='linear-protocol.near',actorAccountId='arbivane-replay.test.near';
 const amount='1000000';
 let borrowed=false, deposited=false;
 const calls=[];
 const account=()=>{
  const borrowedLeg=borrowed?[{token_id:tokenId,balance:amount,shares:amount}]:[];
  return {account_id:actorAccountId,supplied:deposited?
   [{token_id:tokenId,balance:supplied,shares:supplied}]:[],
   positions:{REGULAR:{borrowed:borrowedLeg,collateral:[]}}};
 };
 const raw=(hash)=>({final_execution_status:'FINAL',status:{SuccessValue:''},
  transaction:{hash,signer_id:actorAccountId},receipts_outcome:[
   {id:'5'.repeat(43),outcome:{status:{SuccessValue:''}}}
  ]});
 const actor={accountId:actorAccountId,async callRaw(contract,method,args,opts){
  calls.push({contract:contract.accountId,method,args,opts});
  if(method==='execute_with_pyth'&&
   args.actions?.length===1&&args.actions[0].Borrow?.amount===amount){
   assert.equal(opts.attachedDeposit,1n);
   borrowed=true;
   return raw('2'.repeat(43));
  }
  if(method==='ft_transfer_call'&&args.amount===amount&&args.msg===''&&borrowed){
   assert.equal(contract.accountId,tokenId);
   assert.equal(args.receiver_id,'contract.main.burrow.near');
   deposited=true;
   return raw('3'.repeat(43));
  }
  throw Error('UNEXPECTED_SANDBOX_CALL');
 }};
 const lending={accountId:'contract.main.burrow.near',
  async view(name,args){
   assert.equal(name,'get_account_all_positions');
   assert.equal(args.account_id,actorAccountId);
   return account();
  }};
 const repayToken={accountId:tokenId,async view(name,args){
  assert.equal(name,'ft_balance_of');
  assert.equal(args.account_id,actorAccountId);
  return deposited?'0':borrowed?amount:'0';
 }};
 const plan={chain:'NEAR_SANDBOX',method:'execute_with_pyth',
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  actions:[
   {Borrow:{token_id:tokenId,amount}},
   {Liquidate:{in_assets:[{token_id:tokenId,max_amount:amount}],
    out_assets:[{token_id:tokenId,amount:'1000100'}]}},
   {Repay:{token_id:tokenId,amount}},
   {Withdraw:{token_id:tokenId,amount:'100'}}
  ]};
 const repayReserve={repayTokenId:tokenId,extraDecimals:0,
  requiredFtAtomicRoundedUp:amount};
 return {args:{actor,lending,repayToken,plan,repayReserve,
  provider:{txStatus:async()=>{throw Error('SHOULD_NOT_NEED_STATUS_POLL');}}},
  calls};
}
test('Stage125 genuine FT supply accepts bounded 10 ppm share rounding, not synthetic supplied units',async()=>{
 const {args,calls}=replay();
 const result=await prefundStage124RheaSupply(args);
 assert.equal(result.suppliedInternal,'999990');
 assert.equal(result.actualBorrowFtCredited,true);
 assert.equal(result.actualFtReturnedToSupply,true);
 assert.equal(result.priorActorBorrowDebtInternal,'0');
 assert.equal(result.mainnetExecutionEnabled,false);
 assert.deepEqual(calls.map(x=>x.method),['execute_with_pyth','ft_transfer_call']);
});
test('Stage125 fails closed if real supplied balance falls below bounded 10 ppm or source units drift',async()=>{
 const short=replay('999989');
 await assert.rejects(prefundStage124RheaSupply(short.args),
  /STAGE124_REPAY_SUPPLY_OR_CONSERVATION_FAILED/);
 const wrong=replay('999990');
 wrong.args.repayReserve.requiredFtAtomicRoundedUp='1000001';
 await assert.rejects(prefundStage124RheaSupply(wrong.args),
  /STAGE124_REPAY_FT_UNITS_OR_ROUTE_UNATTESTED/);
});
