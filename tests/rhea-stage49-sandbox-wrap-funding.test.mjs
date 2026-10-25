import test from 'node:test';
import assert from 'node:assert/strict';
import {seedSandboxLiquidatorWithWrappedNear} from '../scripts/stage49-sandbox-wrap-funding.mjs';
const NEAR='1000000000000000000000000';
const receipt=()=>({result:{
 final_execution_status:'EXECUTED_OPTIMISTIC',status:{SuccessValue:''},
 receipts_outcome:[{outcome:{status:{SuccessValue:''}}}]
}});
function fixture({fail=null,canCollateral=true,zeroAfter=false}={}){
 const calls=[],storage={lending:false,wnear:false};
 let wrapped=0n,tokenSent=false;
 const accountId='arbivane-replay.test.near';
 const actor={accountId,callRaw:async(contract,method,args,settings)=>{
  calls.push({contract:contract.accountId,method,args,settings});
  if(fail===method)throw Error('sandbox rejection');
  if(method==='storage_deposit')storage[contract.accountId==='wrap.near'?'wnear':'lending']=true;
  if(method==='near_deposit')wrapped+=BigInt(settings.attachedDeposit);
  if(method==='ft_transfer_call'){wrapped-=BigInt(args.amount);tokenSent=true;}
  return receipt();
 }};
 const lending={accountId:'contract.main.burrow.near',view:async(method)=>{
  if(method==='storage_balance_of')return storage.lending?{total:NEAR}:null;
  if(method==='get_account_all_positions')
   return {positions:{REGULAR:{collateral:tokenSent&&!zeroAfter?
    [{token_id:'wrap.near',balance:NEAR,shares:NEAR}]:[],borrowed:[]}}};
  throw Error('unknown lending view');
 }};
 const wnear={accountId:'wrap.near',view:async(method)=>{
  if(method==='storage_balance_of')return storage.wnear?{total:NEAR}:null;
  if(method==='ft_balance_of')return wrapped.toString();
  throw Error('unknown token view');
 }};
 return {actor,lending,wrapped:wnear,calls,assetRows:[
  ['wrap.near',{config:{can_use_as_collateral:canCollateral,can_borrow:true}}],
 ]};
}
test('Stage49 uses genuine Sandbox wrapper deposit and NEP141 collateral-transfer calls, never balance patch',async()=>{
 const x=fixture();
 const r=await seedSandboxLiquidatorWithWrappedNear(x);
 assert.equal(r.status,'SANDBOX_WNEAR_COLLATERAL_DEPOSITED_NOT_BORROW_HEALTH_PROOF');
 assert.equal(r.observedActorCollateralReferenceInternal,NEAR);
 assert.equal(r.wrappedNativeSandboxYocto,NEAR);
 assert.equal(r.mainnetFundingVerified,false);
 assert.equal(r.mayBroadcastMainnet,false);
 assert.deepEqual(x.calls.map(y=>y.method),
  ['storage_deposit','storage_deposit','near_deposit','ft_transfer_call']);
 assert.equal(x.calls[3].args.msg,'"OnlyIncreaseCollateral"');
 assert.equal(x.calls[3].args.amount,NEAR);
 assert.equal(x.calls[3].settings.attachedDeposit,'1');
 assert.equal(x.calls[2].settings.attachedDeposit,NEAR);
 assert.ok(x.calls.every(y=>y.contract==='wrap.near'||y.contract==='contract.main.burrow.near'));
});
test('unsupported collateral config rejects without any token or Sandbox tx',async()=>{
 const x=fixture({canCollateral:false});
 await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),/STAGE49_WNEAR_IS_NOT_ENABLED_COLLATERAL/);
 assert.equal(x.calls.length,0);
});
test('successful FT transfer receipt is insufficient without actually increased lending collateral',async()=>{
 const x=fixture({zeroAfter:true});
 await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),/COLLATERAL_NOT_RECORDED/);
});
test('contract failures cannot be relabeled as funded liquidator proof',async()=>{
 for(const method of ['storage_deposit','near_deposit','ft_transfer_call']){
  const x=fixture({fail:method});
  await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),/sandbox rejection/);
 }
});
