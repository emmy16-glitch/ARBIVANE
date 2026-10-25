import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attestStage96PinnedRheaViews,stage96SafeError} from '../scripts/stage96-rhea-view-parity.mjs';

const id='contract.main.burrow.near',borrowerId='borrower.near';
const source={config:{max_positions:8},borrower:{account_id:borrowerId,positions:[]},assets:[['wrap.near',{config:{can_borrow:true}}]]};
function make(overrides={}){
 const written=[],calls=[];
 const lending={accountId:id,view:async(method,args)=>{
  calls.push(method);
  const key=method==='get_config'?'config':method==='get_account_all_positions'?'borrower':'assets';
  if(Object.hasOwn(overrides,key)){
   if(overrides[key] instanceof Error)throw overrides[key];
   return overrides[key];
  }
  if(key==='borrower')assert.equal(args.account_id,borrowerId);
  return source[key];
 }};
 return {lending,written,calls,persist:async data=>written.push(data)};
}
const run=m=>attestStage96PinnedRheaViews({
 lending:m.lending,borrowerAccountId:borrowerId,
 config:source.config,borrower:source.borrower,assets:source.assets,
 persist:m.persist,
});
test('Stage96 real source-clone view checks are sequential, incremental, hash-only and never liquidation proof',async()=>{
 const m=make(),w=await run(m);
 assert.deepEqual(m.calls,['get_config','get_account_all_positions','get_assets_paged']);
 assert.equal(w.status,'ALL_REQUIRED_PINNED_VIEWS_MATCH_NOT_LIQUIDATION');
 assert.equal(w.checks.length,3);
 assert.ok(w.checks.every(c=>c.status==='SOURCE_SANDBOX_MATCH'&&
  /^[a-f0-9]{64}$/.test(c.expectedSha256)&&c.expectedSha256===c.actualSha256));
 assert.equal(w.allSourceViewsVerified,true);
 assert.equal(w.liquidationAttempted,false);
 assert.equal(w.positiveNetProfitVerified,false);
 assert.equal(w.mayBroadcastMainnet,false);
 assert.equal(m.written.length,5);
 assert.equal(m.written.at(-1).checks.length,3);
 assert.ok(!JSON.stringify(m.written).includes('max_positions'));
 assert.ok(!JSON.stringify(m.written).includes('borrower.near'));
});
for(const [view,code,method] of [
 ['config','CONFIG','get_config'],['borrower','BORROWER','get_account_all_positions'],
 ['assets','ASSETS','get_assets_paged'],
]){
 test('Stage96 identifies only '+view+' view mismatch without continuing or declaring a trade',async()=>{
  const m=make({[view]:{unexpected_data:'hostile account info'}});
  await assert.rejects(()=>run(m),new RegExp('STAGE96_'+code+'_VIEW_MISMATCH'));
  const final=m.written.at(-1);
  assert.equal(final.status,'BLOCKED_PINNED_PARITY_MISMATCH');
  assert.equal(final.failedView,code);
  assert.equal(final.failureCode,'STAGE96_'+code+'_VIEW_MISMATCH');
  assert.equal(final.actualRheaSettlementVerified,false);
  assert.equal(final.allSourceViewsVerified,false);
  assert.ok(!JSON.stringify(m.written).includes('hostile account info'));
  assert.equal(m.calls.at(-1),method);
 });
 test('Stage96 records '+view+' SDK/RPC exception without revealing raw exception content',async()=>{
  const m=make({[view]:new Error('credential=https://example.test/private?token=SECRET')});
  await assert.rejects(()=>run(m),new RegExp('STAGE96_'+code+'_VIEW_CALL_FAILED'));
  const w=m.written.at(-1);
  assert.equal(w.failedView,code);
  assert.equal(w.status,'BLOCKED_SANDBOX_VIEW_EXCEPTION');
  assert.ok(!JSON.stringify(w).includes('SECRET'));
  assert.equal(w.liquidationAttempted,false);
 });
}
test('Stage96 persistence errors fail closed and sanitized error codes reject untrusted SDK strings',async()=>{
 const m=make();
 await assert.rejects(()=>attestStage96PinnedRheaViews({
  lending:m.lending,borrowerAccountId:borrowerId,
  config:source.config,borrower:source.borrower,assets:source.assets,
  persist:async()=>{throw Error('PRIVATE_KEY_IS_SECRET');},
 }),/STAGE96_PARITY_EVIDENCE_PERSISTENCE_FAILED/);
 assert.equal(m.calls.length,0);
 assert.equal(stage96SafeError(new Error('secret https://evil/?key=pass')),
  'STAGE96_UNCLASSIFIED_LOCAL_VIEW_ERROR');
 assert.equal(stage96SafeError(new Error('STAGE96_CONFIG_VIEW_MISMATCH')),
  'STAGE96_CONFIG_VIEW_MISMATCH');
});
test('Stage96 integrates before every Pyth, loan or liquidation attempt and uploads failure artifacts',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const index=runner.indexOf('await attestStage96PinnedRheaViews({');
 assert.ok(index>runner.indexOf('await cloneMonitor.finish()'));
 assert.ok(index<runner.indexOf("markStage55('SANDBOX_PYTH_PARITY')"));
 assert.ok(index<runner.indexOf('actor.callRaw(lending,plan.method'));
 assert.ok(runner.includes('STAGE96_POST_PROBE_SOURCE_VIEWS_DRIFTED'));
 for(const wf of ['rhea-stage69-fastlane.yml','rhea-stage87-one-borrower-execution.yml','rhea-stage93-borrower-settlement.yml']){
  const yaml=await readFile(new URL('../.github/workflows/'+wf,import.meta.url),'utf8');
  assert.ok(yaml.includes('stage96-rhea-view-parity.json'));
  assert.ok(yaml.includes("EXECUTION_ENABLED: 'false'"));
 }
 const yaml=await readFile(new URL('../.github/workflows/rhea-stage96-rhea-canary.yml',import.meta.url),'utf8');
 assert.ok(yaml.includes("run-id: '40209422774'"));
 assert.ok(yaml.includes('arbivane-stage96-rhea-post-clone-canary'));
 assert.ok(yaml.includes('stage96-authentic-rhea-view-diagnostic'));
 assert.ok(yaml.includes('.actualRheaLiquidationAttempted == false'));
 const canary=await readFile(new URL('../scripts/stage96-rhea-source-canary.mjs',import.meta.url),'utf8');
 assert.ok(canary.includes('cloneStage82BorrowerLending({'));
 assert.ok(!canary.includes('callRaw('));
 assert.ok(!canary.includes('broadcast_tx'));
});
