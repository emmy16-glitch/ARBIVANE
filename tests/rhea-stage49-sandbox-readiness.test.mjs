import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 inspectStage49RheaAssets,registerStage49SandboxActor
} from '../scripts/stage49-sandbox-route-readiness.mjs';

const lending='contract.main.burrow.near';
const repay='usdt.tether-token.near',seize='wrap.near';
function plan(overrides={}){
 return {mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
  chain:'NEAR_SANDBOX',executionEnabled:false,maySignMainnet:false,
  borrowerAccountId:'debtor.near',
  mayBroadcastMainnet:false,mainnetSourceBlockHeight:'221433162',
  lendingContract:lending,
  actions:[
   {Borrow:{token_id:repay,amount:'100'}},
   {Liquidate:{account_id:'debtor.near',in_assets:[{token_id:repay,amount:'100'}],
    out_assets:[{token_id:seize,amount:'110'}]}},
   {Withdraw:{token_id:seize,amount:'110'}}
  ],...overrides};
}
function assets(debt={},collateral={}){
 return [
  [repay,{supplied:{balance:'100000',shares:'100000'},
   borrowed:{balance:'40000',shares:'40000'},
   config:{can_borrow:true,can_withdraw:true},...debt}],
  [seize,{supplied:{balance:'10000',shares:'10000'},
   borrowed:{balance:'0',shares:'0'},
   config:{can_withdraw:true,can_borrow:false},...collateral}]
 ];
}
test('Rhea borrows only current pinned can_borrow tokens and keeps pool liquidity unproven',()=>{
 const r=inspectStage49RheaAssets(plan(),assets(),221433162);
 assert.equal(r.repayCanBorrow,true);
 assert.equal(r.seizedCanWithdraw,true);
 assert.equal(r.grossPoolDifferenceInternal,'60000');
 assert.equal(r.poolAvailabilityVerified,false);
 assert.equal(r.mainnetExecutionEnabled,false);
 assert.equal(r.status,'PINNED_PERMISSIONS_PASS_LIQUIDITY_UNVERIFIED');
});
test('disabled Borrow, disabled Withdraw, missing asset, empty pool, or forged pin block',()=>{
 for(const data of [
  assets({config:{can_borrow:false}}),
  assets({}, {config:{can_withdraw:false}}),
  assets({supplied:{balance:'40000'}}),
  assets({supplied:{balance:'0'}}),
  assets({supplied:{balance:'bad'}}),
  [[repay,assets()[0][1]]],
  [...assets(),assets()[0]],
 ])assert.throws(()=>inspectStage49RheaAssets(plan(),data,221433162),/STAGE49_/);
 assert.throws(()=>inspectStage49RheaAssets(plan(),assets(),221433161),/CROSS_BLOCK/);
 assert.throws(()=>inspectStage49RheaAssets(plan({mayBroadcastMainnet:true}),assets(),221433162),/UNTRUSTED/);
});
const MIN='10000000000000000000000';// Sandbox-local 0.01 NEAR, not real wallet funding
function scenario(overrides={}){
 const state=new Map(),transactions=[];
 const contracts=new Map([lending,repay,seize].map(id=>[id,{
  accountId:id,
  view:async(method,args)=>{
   if(method==='storage_balance_bounds')return {min:MIN,max:MIN};
   if(method==='storage_balance_of')return state.get(id)??null;
   throw Error('UNSUPPORTED_VIEW_METHOD');
  },
 }]));
 const actor={accountId:'arbivane-replay.test.near',
  callRaw:async(contract,method,args,opt)=>{
   transactions.push({contract:contract.accountId,method,args,opt});
   if(method!=='storage_deposit')throw Error('WRONG_METHOD');
   state.set(contract.accountId,{total:MIN,available:'0'});
   return {result:{status:{SuccessValue:''},receipts_outcome:[
    {outcome:{status:{SuccessValue:''},gas_burnt:'123'}}]}};
  },
 };
 return {args:{actor,contracts,plan:plan(),...overrides},state,transactions};
}
test('Stage49 registers exactly Rhea lending and both FTs using bounded local NEP-145 minimum',async()=>{
 const x=scenario();
 const result=await registerStage49SandboxActor(x.args);
 assert.equal(result.status,'LOCAL_STORAGE_REGISTRATION_CONFIRMED');
 assert.equal(result.registrations.length,3);
 assert.equal(result.storagePaidYocto,'30000000000000000000000');
 assert.deepEqual(x.transactions.map(a=>a.contract),[lending,repay,seize]);
 for(const one of x.transactions){
  assert.equal(one.method,'storage_deposit');
  assert.equal(one.opt.attachedDeposit,BigInt(MIN));
  assert.equal(one.opt.gas,30000000000000n);
  assert.deepEqual(one.args,{account_id:x.args.actor.accountId,registration_only:true});
 }
 assert.equal(result.positiveNetProfitVerified,false);
 assert.equal(result.mayBroadcastMainnet,false);
});
test('repeat NEP-145 registration is idempotent with no additional Sandbox deposits',async()=>{
 const x=scenario();
 await registerStage49SandboxActor(x.args);
 x.transactions.length=0;
 const twice=await registerStage49SandboxActor(x.args);
 assert.equal(twice.storagePaidYocto,'0');
 assert.equal(x.transactions.length,0);
 assert.ok(twice.registrations.every(r=>r.alreadyRegistered));
});
test('oversized minimum, missing storage contract and failing callback prevent false readiness',async()=>{
 const x=scenario();
 x.args.contracts.get(seize).view=async method=>
  method==='storage_balance_bounds'?{min:'200000000000000000000000',max:null}:null;
 await assert.rejects(()=>registerStage49SandboxActor(x.args),/EXCESSIVE_CONTRACT_REGISTRATION_COST/);
 assert.equal(x.transactions.length,0);
 const y=scenario();y.args.contracts.delete(repay);
 await assert.rejects(()=>registerStage49SandboxActor(y.args),/CONTRACT_MISSING/);
 const z=scenario();
 z.args.actor.callRaw=async()=>({result:{status:{Failure:'not allowed'},receipts_outcome:[
  {outcome:{status:{Failure:'not allowed'},gas_burnt:'1'}}]}});
 await assert.rejects(()=>registerStage49SandboxActor(z.args),/RECEIPT_NOT_SUCCESSFUL/);
});
test('Stage49 registration is strictly before actor pre-balance and actual Rhea call',async()=>{
 const s=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(s.indexOf('inspectStage49RheaAssets')>0);
 assert.ok(s.indexOf('registerStage49SandboxActor({actor,contracts,plan})')>0);
 assert.ok(s.indexOf('registerStage49SandboxActor({actor,contracts,plan})')<s.indexOf('const snapshot='));
 assert.ok(s.indexOf('inspectStage49RheaAssets(plan,assets.value,block)')<s.indexOf('await initHistoricalSandbox('));
 assert.match(s,/initialBalance:3n\*10n\*\*24n/);
 assert.ok(s.includes('stage49-sandbox-registration.json'));
 assert.doesNotMatch(s,/broadcast_tx|signAndSend/);
});

test('Stage50 rejects counterfeit or contradictory Rhea three-action amounts and borrower',()=>{
 const correct=plan();
 const rewrite=(fn)=>{
  const p=structuredClone(correct);
  fn(p.actions);
  return p;
 };
 const adversarial=[
  {...correct,borrowerAccountId:'another.near'},
  rewrite(a=>a[1].Liquidate.in_assets[0].amount='99'),
  rewrite(a=>a[1].Liquidate.out_assets[0].amount='111'),
  rewrite(a=>a[0].Borrow.amount='0'),
  rewrite(a=>a[2].Withdraw.amount='0'),
  rewrite(a=>a[1].Liquidate.in_assets.push({token_id:repay,amount:'2'})),
  rewrite(a=>a[1].Liquidate.out_assets=[]),
  {...correct,actions:[...correct.actions,{Withdraw:{token_id:seize,amount:'1'}}]},
 ];
 for(const p of adversarial)
  assert.throws(()=>inspectStage49RheaAssets(p,assets(),221433162),/STAGE49_/);
});
test('Stage50 real Rhea Workspaces call uses bigint gas/deposit, not JSON strings',async()=>{
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(script.includes('gas:BigInt(plan.gasUnits),attachedDeposit:BigInt(plan.depositYocto)'));
 assert.ok(!script.includes('gas:plan.gasUnits,attachedDeposit:plan.depositYocto'));
 assert.ok(script.includes("NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(!script.includes('broadcast_tx'));
});


const sameAssetPlan=()=>plan({actions:[
 {Borrow:{token_id:repay,amount:'100'}},
 {Liquidate:{account_id:'debtor.near',
  in_assets:[{token_id:repay,amount:'100'}],
  out_assets:[{token_id:repay,amount:'110'}]}},
 {Repay:{token_id:repay,amount:'100'}},
 {Withdraw:{token_id:repay,amount:'10'}}
]});
test('Stage71 keeps four-action same-token route source-pinned and borrow repaid before surplus withdrawal',()=>{
 const r=inspectStage49RheaAssets(sameAssetPlan(),assets(),221433162);
 assert.equal(r.repayTokenId,repay);
 assert.equal(r.seizeTokenId,repay);
 assert.equal(r.repayCanBorrow,true);
 assert.equal(r.seizedCanWithdraw,true);
 assert.equal(r.mayBroadcastMainnet,false);
});
test('Stage71 rejects forged or missing self-repay and anything withdrawing borrowed funds',()=>{
 const bad=[
  p=>p.actions[2].Repay.amount='99',
  p=>p.actions[2].Repay.token_id=seize,
  p=>p.actions[3].Withdraw.amount='110',
  p=>p.actions[3].Withdraw.amount='0',
  p=>p.actions[1].Liquidate.out_assets[0].amount='100',
  p=>p.actions.splice(2,1),
 ];
 for(const change of bad){
  const p=structuredClone(sameAssetPlan());change(p);
  assert.throws(()=>inspectStage49RheaAssets(p,assets(),221433162),/STAGE49_/);
 }
});
test('Stage71 registers only the lending contract and one unique NEP-141 token',async()=>{
 const x=scenario({plan:sameAssetPlan()});
 const s=await registerStage49SandboxActor(x.args);
 assert.equal(s.status,'LOCAL_STORAGE_REGISTRATION_CONFIRMED');
 assert.equal(s.registrations.length,2);
 assert.deepEqual(x.transactions.map(q=>q.contract),[lending,repay]);
 assert.equal(s.storagePaidYocto,(2n*BigInt(MIN)).toString());
 assert.equal(s.mainnetExecutionEnabled,undefined);
 assert.equal(s.maySignMainnet,false);
});
