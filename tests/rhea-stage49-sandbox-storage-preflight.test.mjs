import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectStage49BorrowRoute,registerStage49SandboxTokenStorage}
 from '../scripts/stage49-sandbox-asset-storage-preflight.mjs';

const plan=()=>({
 mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
 chain:'NEAR_SANDBOX',method:'execute_with_pyth',
 borrowerAccountId:'borrower.near',executionEnabled:false,maySignMainnet:false,
 mayBroadcastMainnet:false,
 actions:[
  {Borrow:{token_id:'wrap.near',amount:'25'}},
  {Liquidate:{account_id:'borrower.near',
   in_assets:[{token_id:'wrap.near',amount:'25'}],
   out_assets:[{token_id:'usdt.near',amount:'30'}]}},
  {Withdraw:{token_id:'usdt.near',amount:'30'}}
 ]
});
const asset=(enabled=true)=>[
 ['wrap.near',{config:{can_borrow:enabled},
  supplied:{balance:'200',shares:'200'},borrowed:{balance:'70',shares:'70'}}],
 ['usdt.near',{config:{can_borrow:false},
  supplied:{balance:'900',shares:'900'},borrowed:{balance:'100',shares:'100'}}]
];
test('Stage49 checks actual pinned borrow eligibility and NEVER equates pool units with wallet funds',()=>{
 const a=asset();
 const r=inspectStage49BorrowRoute(plan(),a,structuredClone(a));
 assert.equal(r.borrowEnabled,true);
 assert.equal(r.indicativeAvailablePoolBalanceInternal,'130');
 assert.equal(r.exactBorrowCapacityAndSharesVerified,false);
 assert.equal(r.rawFtTokenAmountEquivalentToLendingUnitsVerified,false);
 assert.equal(r.actorBorrowPermissionVerified,false);
 assert.equal(r.mainnetTradingAllowed,false);
});
test('borrowing a disabled asset reproduces a real historical blocker rather than submitting a tx',()=>{
 const a=asset(false);
 assert.throws(()=>inspectStage49BorrowRoute(plan(),a,a),/REPAY_ASSET_BORROW_DISABLED/);
});
test('unsafe or inconsistent source/action/replayed pool evidence blocks without signing',()=>{
 const a=asset();
 for(const [p,remote,local] of [
  [plan(),a,asset(false)],
  [{...plan(),mayBroadcastMainnet:true},a,a],
  [{...plan(),actions:[{Borrow:{token_id:'bad.near',amount:'25'}},...plan().actions.slice(1)]},a,a],
  [{...plan(),actions:[{Borrow:{token_id:'wrap.near',amount:'26'}},...plan().actions.slice(1)]},a,a],
  [plan(),[['wrap.near',a[0][1]],['wrap.near',a[0][1]]],a],
  [plan(),[['wrap.near',{...a[0][1],supplied:{balance:'70'}}],a[1]], [['wrap.near',{...a[0][1],supplied:{balance:'70'}}],a[1]]]
 ]) assert.throws(()=>inspectStage49BorrowRoute(p,remote,local),/STAGE49_/);
});
function storageFixture(changes={}){
 const calls=[],tok=new Map(),vals={};
 const success=()=>({result:{final_execution_status:'EXECUTED_OPTIMISTIC',
  status:{SuccessValue:''},receipts_outcome:[
   {outcome:{status:{SuccessValue:''}}}
  ]}});
 for(const id of ['wrap.near','usdt.near']){
  vals[id]=null;
  tok.set(id,{
   view:async(method)=>{
    if(method==='storage_balance_of')return vals[id];
    if(method==='storage_balance_bounds')
     return {min:changes.min??'1250000000000000000000',max:null};
    throw Error('bad method');
   }
  });
 }
 const actor={accountId:'arbivane-replay.test.near',
  callRaw:async(token,method,args,options)=>{
   calls.push({token,method,args,options});
   const id=[...tok.entries()].find(([,v])=>v===token)?.[0];
   if(!changes.noPersistence)vals[id]={total:String(options.attachedDeposit),available:'0'};
   return changes.badReceipt?{result:{status:{Failure:'failed'}}}:success();
  }
 };
 return {tokens:tok,actor,calls,vals};
}
test('registers only two Sandbox FT storage accounts with exact NEP-145 minimums',async()=>{
 const x=storageFixture();
 const r=await registerStage49SandboxTokenStorage({...x,plan:plan()});
 assert.equal(x.calls.length,2);
 assert.equal(x.calls[0].method,'storage_deposit');
 assert.equal(x.calls[0].options.attachedDeposit,1250000000000000000000n);
 assert.equal(x.calls[0].options.gas,100000000000000n);
 assert.deepEqual(x.calls[0].args,{account_id:x.actor.accountId,registration_only:true});
 assert.equal(r.totalNativeStorageDepositYocto,'2500000000000000000000');
 assert.equal(r.neP141WalletCapitalFunded,false);
 assert.equal(r.actualPoolLiquidityVerified,false);
 assert.equal(r.mayBroadcastMainnet,false);
});
test('already-registered actor has zero additional native storage deposit',async()=>{
 const x=storageFixture();
 x.vals['wrap.near']={total:'1250000000000000000000',available:'0'};
 x.vals['usdt.near']={total:'1250000000000000000000',available:'0'};
 const r=await registerStage49SandboxTokenStorage({...x,plan:plan()});
 assert.equal(x.calls.length,0);
 assert.equal(r.totalNativeStorageDepositYocto,'0');
});
test('storage cap, failed token receipt and absent post-registration state block fail-closed',async()=>{
 const tooBig=storageFixture({min:'100000000000000000000001'});
 await assert.rejects(()=>registerStage49SandboxTokenStorage({...tooBig,plan:plan()}),/STORAGE_DEPOSIT_OVER_CAP/);
 assert.equal(tooBig.calls.length,0);
 const failed=storageFixture({badReceipt:true});
 await assert.rejects(()=>registerStage49SandboxTokenStorage({...failed,plan:plan()}),/REGISTRATION_RECEIPT_FAILED/);
 const phantom=storageFixture({noPersistence:true});
 await assert.rejects(()=>registerStage49SandboxTokenStorage({...phantom,plan:plan()}),/REGISTRATION_NOT_PERSISTED/);
 const unsafe=storageFixture();
 await assert.rejects(()=>registerStage49SandboxTokenStorage({...unsafe,plan:{...plan(),executionEnabled:true}}),/SANDBOX_ONLY/);
});
test('Stage49 occurs before the actual Rhea call with mainnet execution disabled',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes('inspectStage49BorrowRoute'));
 assert.ok(runner.includes('registerStage49SandboxTokenStorage'));
 assert.ok(runner.includes('stage49-sandbox-asset-storage-preflight.json'));
 assert.ok(runner.indexOf('registerStage49SandboxTokenStorage({')<runner.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(runner.includes("NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(!runner.includes('signAndSend'));
 assert.ok(!runner.includes('broadcast_tx'));
});
