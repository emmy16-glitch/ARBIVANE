import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attestStage96PinnedRheaViews,stage96SafeError,stage101SameBorrowerView,stage102BorrowerAssetDifferenceClasses,stage103MarketAssetDifferenceClasses} from '../scripts/stage96-rhea-view-parity.mjs';

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
  assert.equal(m.calls.at(-1),view==='borrower'?'get_assets_paged':method);
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

test('Stage101 accepts only reordered genuine borrower map-derived collections',async()=>{
 const a={account_id:borrowerId,
  supplied:[{token_id:'wrap.near',balance:'5'},{token_id:'linear-protocol.near',balance:'3'}],
  positions:{regular:{collateral:[{token_id:'wrap.near',shares:'1'},{token_id:'linear-protocol.near',shares:'2'}],
   borrowed:[{token_id:'wrap.near',shares:'4'}]}},
  farms:[{farm_id:'x',rewards:[{reward_token_id:'a',boosted_shares:'1'},{reward_token_id:'z',boosted_shares:'2'}]}],
  has_non_farmed_assets:false,is_locked:false};
 const b={is_locked:false,farms:[{rewards:[{boosted_shares:'2',reward_token_id:'z'},{boosted_shares:'1',reward_token_id:'a'}],farm_id:'x'}],
  positions:{regular:{borrowed:[{shares:'4',token_id:'wrap.near'}],
   collateral:[{shares:'2',token_id:'linear-protocol.near'},{shares:'1',token_id:'wrap.near'}]}},
  supplied:[{balance:'3',token_id:'linear-protocol.near'},{balance:'5',token_id:'wrap.near'}],
  account_id:borrowerId,has_non_farmed_assets:false};
 assert.equal(stage101SameBorrowerView(a,b),true);
 const m=make({borrower:b});
 const w=await attestStage96PinnedRheaViews({lending:m.lending,
  borrowerAccountId:borrowerId,config:source.config,borrower:a,
  assets:source.assets,persist:m.persist});
 assert.equal(w.allSourceViewsVerified,true);
 assert.equal(w.actualRheaSettlementVerified,false);
 assert.equal(w.mayBroadcastMainnet,false);
});
test('Stage101 still blocks authentic numeric differences with data-free section hints',async()=>{
 const a={account_id:borrowerId,supplied:[{token_id:'wrap.near',balance:'5'}],
  positions:{regular:{collateral:[],borrowed:[{token_id:'wrap.near',shares:'4'}]}}};
 const b={...a,positions:{regular:{collateral:[],borrowed:[{token_id:'wrap.near',shares:'5'}]}}};
 assert.equal(stage101SameBorrowerView(a,b),false);
 const m=make({borrower:b});
 await assert.rejects(attestStage96PinnedRheaViews({
  lending:m.lending,borrowerAccountId:borrowerId,
  config:source.config,borrower:a,assets:source.assets,persist:m.persist,
 }),/STAGE96_BORROWER_VIEW_MISMATCH/);
 const check=m.written.at(-1).checks.find(c=>c.view==='BORROWER');
 assert.deepEqual(check.stage101DifferentSections,['POSITIONS']);
 assert.equal(m.written.at(-1).allSourceViewsVerified,false);
 assert.ok(!JSON.stringify(m.written).includes('wrap.near'));
});

test('Stage102 distinguishes changed shares from timestamp-dependent balance and APR without leaking data',async()=>{
 const base={account_id:borrowerId,
  supplied:[{token_id:'wrap.near',balance:'1234',shares:'55',apr:'0.12'}],
  positions:{regular:{collateral:[{token_id:'wrap.near',balance:'1234',shares:'55',apr:'0.12'}],borrowed:[]}}};
 const observed={...base,
  supplied:[{token_id:'wrap.near',balance:'1235',shares:'55',apr:'0.13'}],
  positions:{regular:{collateral:[{token_id:'wrap.near',balance:'1235',shares:'55',apr:'0.13'}],borrowed:[]}}};
 const classes=stage102BorrowerAssetDifferenceClasses(base,observed);
 assert.deepEqual(classes,['ASSET_APR_DIFFERENT','ASSET_BALANCE_DIFFERENT']);
 const m=make({borrower:observed});
 await assert.rejects(attestStage96PinnedRheaViews({
  lending:m.lending,borrowerAccountId:borrowerId,config:source.config,
  borrower:base,assets:source.assets,persist:m.persist
 }),/STAGE96_BORROWER_VIEW_MISMATCH/);
 const witness=m.written.at(-1),serialized=JSON.stringify(witness);
 assert.deepEqual(witness.checks.find(c=>c.view==='BORROWER').stage102AssetDifferenceClasses,classes);
 assert.equal(witness.allSourceViewsVerified,false);
 assert.equal(witness.liquidationAttempted,false);
 assert.equal(serialized.includes('wrap.near'),false);
 assert.equal(serialized.includes('1235'),false);
 assert.equal(serialized.includes('0.13'),false);
});
test('Stage102 never treats a share mismatch or different asset identity as harmless',()=>{
 const original={supplied:[{token_id:'wrap.near',shares:'5',balance:'7',apr:'0'}],
  positions:{regular:{collateral:[],borrowed:[]}}};
 const modified={supplied:[{token_id:'wrap.near',shares:'6',balance:'7',apr:'0'}],
  positions:{regular:{collateral:[],borrowed:[]}}};
 assert.deepEqual(stage102BorrowerAssetDifferenceClasses(original,modified),
  ['ASSET_SHARES_DIFFERENT']);
 assert.equal(stage101SameBorrowerView(original,modified),false);
 modified.supplied[0].token_id='linear-protocol.near';
 assert.deepEqual(stage102BorrowerAssetDifferenceClasses(original,modified),
  ['ASSET_MEMBERSHIP_DIFFERENT']);
});


test('Stage103 compares authentic market pool shares and time-derived balances without leaking records',async()=>{
 const base={account_id:borrowerId,supplied:[
  {token_id:'wrap.near',shares:'100',balance:'101',apr:'0.01'}],positions:{}};
 const accrued={...base,supplied:[
  {token_id:'wrap.near',shares:'100',balance:'102',apr:'0.02'}]};
 const marketBefore=[['wrap.near',{supplied:{shares:'800',balance:'801'},
  borrowed:{shares:'400',balance:'450'},reserved:'5',
  last_update_timestamp:'1000000',config:{can_borrow:true}}]];
 const marketAfter=[['wrap.near',{supplied:{shares:'800',balance:'802'},
  borrowed:{shares:'400',balance:'451'},reserved:'6',
  last_update_timestamp:'2000000',config:{can_borrow:true}}]];
 assert.deepEqual(stage103MarketAssetDifferenceClasses(marketBefore,marketAfter),[
  'MARKET_ACCRUAL_TIMESTAMP_DIFFERENT','MARKET_POOL_BALANCES_DIFFERENT',
  'MARKET_RESERVED_DIFFERENT']);
 const m=make({borrower:accrued,assets:marketAfter});
 await assert.rejects(attestStage96PinnedRheaViews({
  lending:m.lending,borrowerAccountId:borrowerId,
  config:source.config,borrower:base,assets:marketBefore,persist:m.persist,
 }),/STAGE96_BORROWER_VIEW_MISMATCH/);
 const witness=m.written.at(-1);
 assert.deepEqual(m.calls,['get_config','get_account_all_positions','get_assets_paged']);
 assert.equal(witness.failedView,'BORROWER');
 assert.equal(witness.status,'BLOCKED_PINNED_PARITY_MISMATCH');
 assert.deepEqual(witness.checks.find(c=>c.view==='ASSETS').stage103MarketDifferenceClasses,
  ['MARKET_ACCRUAL_TIMESTAMP_DIFFERENT','MARKET_POOL_BALANCES_DIFFERENT',
   'MARKET_RESERVED_DIFFERENT']);
 assert.equal(witness.allSourceViewsVerified,false);
 assert.equal(witness.liquidationAttempted,false);
 assert.equal(witness.mayBroadcastMainnet,false);
 const serialized=JSON.stringify(m.written);
 assert.equal(serialized.includes('wrap.near'),false);
 assert.equal(serialized.includes('2000000'),false);
 assert.equal(serialized.includes('802'),false);
});
test('Stage103 never attributes real share, config or identity changes solely to accrual',()=>{
 const before=[['wrap.near',{supplied:{shares:'4',balance:'5'},
  borrowed:{shares:'2',balance:'3'},last_update_timestamp:'1',config:{can_borrow:true}}]];
 const after=[['wrap.near',{supplied:{shares:'8',balance:'5'},
  borrowed:{shares:'2',balance:'3'},last_update_timestamp:'1',config:{can_borrow:false}}]];
 assert.deepEqual(stage103MarketAssetDifferenceClasses(before,after),
  ['MARKET_CONFIG_DIFFERENT','MARKET_POOL_SHARES_DIFFERENT']);
 assert.deepEqual(stage103MarketAssetDifferenceClasses(before,[['linear-protocol.near',after[0][1]]]),
  ['MARKET_ASSET_MEMBERSHIP_DIFFERENT']);
 assert.deepEqual(stage103MarketAssetDifferenceClasses(before,[before[0],before[0]]),
  ['MARKET_COLLECTION_SHAPE_OR_BUDGET']);
});
