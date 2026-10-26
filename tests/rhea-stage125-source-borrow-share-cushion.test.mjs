import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceBackedBorrowShareCushion} from '../scripts/stage125-source-borrow-share-cushion.mjs';
import {attestStage125ActorBorrowCushion} from '../src/rhea/stage125-route-margin.ts';
const R=10n**15n,S=R+10n**12n;
function plan(){
 return {mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
  chain:'NEAR_SANDBOX',method:'execute_with_pyth',
  mainnetSourceBlockHeight:'221675606',borrowerAccountId:'borrower.near',
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  actions:[
   {Borrow:{token_id:'linear-protocol.near',amount:R.toString()}},
   {Liquidate:{account_id:'borrower.near',
    in_assets:[{token_id:'linear-protocol.near',amount:R.toString()}],
    out_assets:[{token_id:'linear-protocol.near',amount:S.toString()}]}},
   {Repay:{token_id:'linear-protocol.near',amount:R.toString()}},
   {Withdraw:{token_id:'linear-protocol.near',amount:(S-R).toString()}}
  ]};
}
function assets(supply='1200000',shares='1000000'){
 return [['linear-protocol.near',{config:{can_borrow:true},
  supplied:{balance:supply,shares},
  borrowed:{balance:'1000'}}]];
}
test('Stage125 authentic pool share ratio only cushions disposable actor Borrow and Repay',()=>{
 const p=plan();const evidence=sourceBackedBorrowShareCushion(p,assets());
 const excess=BigInt(p.sourceBackedBorrowCushionInternal);
 assert.equal(excess,12n);
 assert.equal(p.actions[0].Borrow.amount,(R+excess).toString());
 assert.equal(p.actions[2].Repay.amount,(R+excess).toString());
 assert.equal(p.actions[1].Liquidate.in_assets[0].amount,R.toString());
 assert.equal(p.actions[1].Liquidate.out_assets[0].amount,S.toString());
 assert.equal(p.actions[3].Withdraw.amount,(S-R).toString());
 assert.equal(evidence.originalBorrowerLiquidationUnchanged,true);
 assert.equal(evidence.mainnetExecutionEnabled,false);
 assert.equal(attestStage125ActorBorrowCushion(p,(R+excess).toString(),R.toString(),S.toString(),true),true);
});
test('Stage125 rejects absent, forged, outsized or non-source-backed actor cushions',()=>{
 const original=plan();
 assert.equal(attestStage125ActorBorrowCushion(original,R.toString(),R.toString(),S.toString(),true),true);
 assert.equal(attestStage125ActorBorrowCushion(original,(R+12n).toString(),R.toString(),S.toString(),true),false);
 assert.equal(attestStage125ActorBorrowCushion({...original,sourceBackedBorrowCushionInternal:'12'},(R+13n).toString(),R.toString(),S.toString(),true),false);
 assert.equal(attestStage125ActorBorrowCushion({...original,sourceBackedBorrowCushionInternal:'12'},(R+12n).toString(),R.toString(),(R+11n).toString(),true),false);
 for(const rows of [[],assets('10','0'),assets('1','1000'),
  [['linear-protocol.near',{config:{can_borrow:false},supplied:{balance:'1200000',shares:'1000000'}}]],
  [...assets(),...assets()]]){
  assert.throws(()=>sourceBackedBorrowShareCushion(plan(),rows),/STAGE125_/);
 }
});
test('Stage125 never compares cross-token repay and seize units or enables the cushion for such routes',()=>{
 const p=plan();
 assert.equal(attestStage125ActorBorrowCushion(p,R.toString(),R.toString(),'1',false),true);
 assert.equal(attestStage125ActorBorrowCushion(p,(R+12n).toString(),R.toString(),'1',false),false);
 p.actions[1].Liquidate.out_assets[0].token_id='wrap.near';
 assert.throws(()=>sourceBackedBorrowShareCushion(p,assets()),/STAGE125_AUTHENTIC_ROUTE_CHANGED/);
});
