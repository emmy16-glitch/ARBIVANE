import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {seedSandboxLiquidatorWithWrappedNear,wrappedNearCollateralShares,settleFundingTransferReceipt} from '../scripts/stage49-sandbox-wrap-funding.mjs';
const NEAR='1000000000000000000000000';
const receipt=()=>({result:{
 final_execution_status:'EXECUTED_OPTIMISTIC',status:{SuccessValue:''},
 receipts_outcome:[{outcome:{status:{SuccessValue:''}}}]
}});
function fixture({fail=null,canCollateral=true,zeroAfter=false,
 wrongCollateral=false,vaultNotCredited=false,partialTransfer=false,
 preexistingFt=false,zeroShares=false,vaultMintDrift=false}={}){
 const calls=[],storage={lending:false,wnear:false};
 let wrapped=preexistingFt?1n:0n,vault=50n*BigInt(NEAR),tokenSent=false;
 const accountId='arbivane-replay.test.near';
 const actor={accountId,callRaw:async(contract,method,args,settings)=>{
  calls.push({contract:contract.accountId,method,args,settings});
  if(fail===method)throw Error('sandbox rejection');
  if(method==='storage_deposit')storage[contract.accountId==='wrap.near'?'wnear':'lending']=true;
  if(method==='near_deposit'){
   wrapped+=BigInt(settings.attachedDeposit);
   if(vaultMintDrift)vault+=1n;
  }
  if(method==='ft_transfer_call'){
   const outgoing=partialTransfer?BigInt(args.amount)/2n:BigInt(args.amount);
   wrapped-=outgoing;
   if(!vaultNotCredited)vault+=outgoing;
   tokenSent=true;
  }
  return receipt();
 }};
 const lending={accountId:'contract.main.burrow.near',view:async(method)=>{
  if(method==='storage_balance_bounds')return {min:'1250000000000000000000'};
  if(method==='storage_balance_of')return storage.lending?{total:NEAR}:null;
  if(method==='get_account_all_positions')
   return {positions:{REGULAR:{collateral:tokenSent&&!zeroAfter?
    [{token_id:wrongCollateral?'unrelated.near':'wrap.near',
      balance:NEAR,shares:zeroShares?'0':NEAR}]:[],borrowed:[]}}};
  throw Error('unknown lending view');
 }};
 const wnear={accountId:'wrap.near',view:async(method,args)=>{
  if(method==='storage_balance_bounds')return {min:'1250000000000000000000'};
  if(method==='storage_balance_of')return storage.wnear?{total:NEAR}:null;
  if(method==='ft_balance_of')
   return args.account_id==='contract.main.burrow.near'?vault.toString():wrapped.toString();
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
 assert.equal(r.observedWrappedNearCollateralInternal,NEAR);
 assert.equal(r.observedSenderWrappedTokenDecreaseAtomic,NEAR);
 assert.equal(r.observedRheaWrappedTokenVaultIncreaseAtomic,NEAR);
 assert.equal(r.wrappedTokenConservationVerified,true);
 assert.equal(r.observedWrappedNearCollateralShares,NEAR);
 assert.equal(r.vaultBalanceUnchangedDuringNativeWrapVerified,true);
 assert.equal(r.mainnetFundingVerified,false);
 assert.equal(r.mayBroadcastMainnet,false);
 assert.deepEqual(x.calls.map(y=>y.method),
  ['storage_deposit','storage_deposit','near_deposit','ft_transfer_call']);
 assert.equal(x.calls[3].args.msg,'"OnlyIncreaseCollateral"');
 assert.equal(x.calls[3].args.amount,NEAR);
 assert.equal(x.calls[3].settings.attachedDeposit,1n);
 assert.equal(x.calls[2].settings.attachedDeposit,BigInt(NEAR));
 assert.ok(x.calls.every(y=>y.contract==='wrap.near'||y.contract==='contract.main.burrow.near'));
 assert.ok(x.calls.every(y=>typeof y.settings.gas==='bigint'&&typeof y.settings.attachedDeposit==='bigint'));
});
test('unsupported collateral config rejects without any token or Sandbox tx',async()=>{
 const x=fixture({canCollateral:false});
 await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),/STAGE49_WNEAR_IS_NOT_ENABLED_COLLATERAL/);
 assert.equal(x.calls.length,0);
});
test('successful FT transfer receipt is insufficient without actually increased lending collateral',async()=>{
 const x=fixture({zeroAfter:true});
 await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),/STAGE53_WRAPPED_COLLATERAL_CREDIT_NOT_RECONCILED/);
});
test('contract failures cannot be relabeled as funded liquidator proof',async()=>{
 for(const method of ['storage_deposit','near_deposit','ft_transfer_call']){
  const x=fixture({fail:method});
  await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),/sandbox rejection/);
 }
});

test('Stage53 refuses dust collateral, non-wrapped collateral, missing Rhea token-vault credit and refunded tokens',async()=>{
 for(const [patch,code] of [
  [{zeroAfter:true},/STAGE53_WRAPPED_COLLATERAL_CREDIT_NOT_RECONCILED/],
  [{wrongCollateral:true},/STAGE53_WRAPPED_COLLATERAL_CREDIT_NOT_RECONCILED/],
  [{vaultNotCredited:true},/STAGE53_RHEA_WRAPPED_TOKEN_VAULT_CREDIT_NOT_EXACT/],
  [{partialTransfer:true},/STAGE53_ACTOR_WRAPPED_TOKEN_DEBIT_NOT_EXACT/],
  [{preexistingFt:true},/STAGE53_WRAPPED_TOKEN_PRESTATE_NOT_TRUSTED/],
 ]){
  const x=fixture(patch);
  await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),code);
 }
});

test('Stage54 rejects a nominal wrapped NEAR collateral balance without actual lending shares',async()=>{
 const x=fixture({zeroShares:true});
 await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),
  /STAGE53_WRAPPED_COLLATERAL_CREDIT_NOT_RECONCILED/);
});
test('Stage54 prevents unrelated vault mutation during the local native-to-wNEAR wrap',async()=>{
 const x=fixture({vaultMintDrift:true});
 await assert.rejects(()=>seedSandboxLiquidatorWithWrappedNear(x),
  /STAGE54_RHEA_VAULT_CHANGED_DURING_ACTOR_WRAP/);
});
test('Stage54 token-specific collateral-share parser rejects malformed, duplicate and overflowed rows',()=>{
 assert.equal(wrappedNearCollateralShares({
  positions:{REGULAR:{collateral:[{token_id:'wrap.near',shares:NEAR,balance:NEAR}]}},
 }),BigInt(NEAR));
 assert.equal(wrappedNearCollateralShares({
  positions:{REGULAR:{collateral:[{token_id:'unrelated.near',shares:NEAR,balance:NEAR}]}},
 }),0n);
 for(const positions of [
  [],
  {REGULAR:{collateral:[{token_id:'wrap.near',shares:'-1',balance:NEAR}]}},
  {REGULAR:{collateral:[{token_id:'wrap.near',shares:NEAR,balance:NEAR},
   {token_id:'wrap.near',shares:NEAR,balance:NEAR}]}},
  {REGULAR:{collateral:[{token_id:'wrap.near',shares:(1n<<128n).toString(),balance:NEAR}]}},
 ])assert.throws(()=>wrappedNearCollateralShares({positions}),/STAGE54_/);
});

test('Stage121 resolves real asynchronous FT SuccessReceiptId using finalized local Sandbox tx status',async()=>{
 const hash='9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R';
 const pending={result:{
  final_execution_status:'EXECUTED_OPTIMISTIC',
  transaction:{hash},status:{SuccessReceiptId:hash},
  receipts_outcome:[{id:hash,outcome:{status:{SuccessReceiptId:hash}}}],
 }};
 const finalized={final_execution_status:'FINAL',transaction:{hash},
  status:{SuccessValue:'dHJ1ZQ=='},
  receipts_outcome:[
   {id:hash,outcome:{status:{SuccessReceiptId:hash}}},
   {id:'callback',outcome:{status:{SuccessValue:''}}}
  ]};
 const calls=[];
 const provider={txStatus:async(...args)=>{calls.push(args);return finalized;}};
 const r=await settleFundingTransferReceipt({
  raw:pending,provider,actorAccountId:'arbivane-replay.test.near',
 });
 assert.equal(r.result,finalized);
 assert.deepEqual(calls,[[hash,'arbivane-replay.test.near','FINAL']]);
});
test('Stage121 refuses pending FT receipt without a final Sandbox status provider',async()=>{
 const hash='9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R';
 await assert.rejects(()=>settleFundingTransferReceipt({
  raw:{result:{transaction:{hash},final_execution_status:'EXECUTED_OPTIMISTIC',
   status:{SuccessReceiptId:hash},receipts_outcome:[]}},
  actorAccountId:'arbivane-replay.test.near',
 }),/STAGE49_WNEAR_COLLATERAL_TRANSFER_FINAL_STATUS_UNAVAILABLE/);
});
test('Stage121 never accepts successful top-level status with failed callback',async()=>{
 const hash='9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R';
 await assert.rejects(()=>settleFundingTransferReceipt({
  raw:{result:{transaction:{hash},final_execution_status:'FINAL',
   status:{SuccessValue:''},
   receipts_outcome:[{outcome:{status:{Failure:'panic'}}}]}},
  actorAccountId:'arbivane-replay.test.near',
 }),/STAGE49_WNEAR_COLLATERAL_TRANSFER_FAILED_CALLBACK/);
});
test('Stage121 never accepts unresolved status even if the provider returns an incomplete outcome',async()=>{
 const hash='9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R';
 const raw={result:{transaction:{hash},final_execution_status:'EXECUTED_OPTIMISTIC',
  status:{SuccessReceiptId:hash},receipts_outcome:[]}};
 await assert.rejects(()=>settleFundingTransferReceipt({
  raw,provider:{txStatus:async()=>raw.result},
  actorAccountId:'arbivane-replay.test.near',
 }),/STAGE49_WNEAR_COLLATERAL_TRANSFER_UNVERIFIED_RECEIPT/);
});


test('Stage123 persists valid JSON for finalized genuine FT transfer without inventing a settlement',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'arbivane-stage123-'));
 try{
  const path=join(directory,'funding.json');
  const raw={result:{
   final_execution_status:'FINAL',
   transaction:{hash:'9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R'},
   status:{SuccessValue:''},
   receipts_outcome:[{outcome:{status:{SuccessValue:''}}}],
  }};
  await settleFundingTransferReceipt({
   raw,actorAccountId:'arbivane-replay.test.near',evidencePath:path,
  });
  const body=await readFile(path,'utf8');
  assert.ok(body.endsWith('\n'));
  const data=JSON.parse(body);
  assert.equal(data.mode,'STAGE121_GENUINE_SANDBOX_WNEAR_TRANSFER_RECEIPTS');
  assert.equal(data.classification,'FINAL_STATUS_OBSERVED');
  assert.equal(data.actualLiquidationAttempted,false);
  assert.equal(data.mainnetExecutionEnabled,false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
