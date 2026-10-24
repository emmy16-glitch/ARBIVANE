import test from 'node:test';
import assert from 'node:assert/strict';
import {attestFinalMainnetLiquidation} from '../src/rhea/stage36-mainnet-receipt-audit.ts';
const txHash='4zWtj3LppFhsSxY589ZqBBvVW5gKtmC6qYxRt53oezXV';
const receiver='contract.main.burrow.near',sender='collector1.near',ID='A'.repeat(43);
function specimen(fail=true){
 const args={actions:[
  {Borrow:{token_id:'usdt.tether-token.near',amount:'2500000000000000000000'}},
  {Liquidate:{account_id:'fambam.near',
   in_assets:[{token_id:'usdt.tether-token.near',amount:'2490000000000000000000'}],
   out_assets:[{token_id:'wrap.near',amount:'1820000000000000000000000'}]}},
  {Withdraw:{token_id:'wrap.near',amount:'1820000000000000000000000'}},
 ]};
 const callbackStatus=fail?{Failure:{ActionError:{kind:{FunctionCallError:{
  ExecutionError:"Smart contract panicked: Thi asset can't be used borrowed"}}}}}:{SuccessValue:''};
 return {
  final_execution_status:'FINAL',status:fail?{Failure:{ActionError:{kind:'Unknown'}}}:{SuccessValue:''},
  transaction:{hash:txHash,signer_id:sender,receiver_id:receiver,
   actions:[{FunctionCall:{method_name:'execute_with_pyth',
    args:btoa(JSON.stringify(args)),gas:'300000000000000',deposit:'0'}}]},
  receipts:[{receipt_id:ID,receiver_id:receiver,receipt:{Action:{actions:[{
   FunctionCall:{method_name:'callback_execute_with_pyth',args:''}}]}}}],
  receipts_outcome:[{id:ID,outcome:{status:callbackStatus,gas_burnt:6400000000000}}],
 };
}
const query={transactionHash:txHash,signerAccountId:sender};
test('realistic callback failure must NOT be claimed as successful liquidation',()=>{
 const r=attestFinalMainnetLiquidation(specimen(),query);
 assert.equal(r.status,'FAILED_EXECUTION_CONFIRMED');
 assert.equal(r.mainnetLiquidationTransactionSucceeded,false);
 assert.equal(r.callbackRejectionCategory,'BORROWED_ASSET_DISALLOWED');
 assert.equal(r.borrowerAccountId,'fambam.near');
 assert.equal(r.method,'execute_with_pyth');
 assert.equal(r.gasBurntGasUnits,'6400000000000');
 assert.equal(r.netProfitVerified,false);assert.equal(r.maySign,false);
});
test('successful callback still does not prove net profit or authorise trading',()=>{
 const r=attestFinalMainnetLiquidation(specimen(false),query);
 assert.equal(r.status,'SUCCESSFUL_CALLBACK_WITHOUT_PROFIT_PROOF');
 assert.equal(r.mainnetLiquidationTransactionSucceeded,true);
 assert.equal(r.netProfitVerified,false);assert.equal(r.executionPermissionGranted,false);
});
test('refuse stale or incomplete finalization and no callback receipt',()=>{
 const r=specimen();
 for(const v of [
  {...r,final_execution_status:'EXECUTED'},
  {...r,receipts:[]},
  {...r,receipts_outcome:[]},
  {...r,transaction:{...r.transaction,signer_id:'other.near'}},
  {...r,transaction:{...r.transaction,receiver_id:'priceoracle.near'}},
  {...r,receipts_outcome:[{id:ID,outcome:{status:{SuccessValue:''},gas_burnt:0}}]},
 ])assert.throws(()=>attestFinalMainnetLiquidation(v,query));
});
test('invalid action shape and borrowed token denial are not silently accepted',()=>{
 for(const mutate of [
  actions=>{actions.splice(1,1);},
  actions=>{actions[1].Liquidate.in_assets[0].token_id='wrap.near';},
  actions=>{actions[2].Withdraw.amount='1';},
  actions=>{actions[0].Borrow.amount='1';},
 ]){
  const r=specimen(),fn=r.transaction.actions[0].FunctionCall;
  const args=JSON.parse(atob(fn.args));
  mutate(args.actions);fn.args=btoa(JSON.stringify(args));
  assert.throws(()=>attestFinalMainnetLiquidation(r,query));
 }
});
test('Stage36 workflow uses only read-only tx RPC and no keys or submit methods',async()=>{
 const {readFile}=await import('node:fs/promises');
 const p=await readFile(new URL('../.github/workflows/rhea-stage36-observed-liquidation-receipts.yml',import.meta.url),'utf8');
 assert.ok(p.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(p.includes('stage36-mainnet-receipt-cli.ts'));
 assert.ok(!p.includes('broadcast_tx'));
 assert.ok(!p.includes('NEAR_PRIVATE_KEY'));
});
