import test from 'node:test';
import assert from 'node:assert/strict';
import {stage104AttestTemporalAccrual} from '../scripts/stage104-temporal-accrual-parity.mjs';
import {attestStage96PinnedRheaViews} from '../scripts/stage96-rhea-view-parity.mjs';

const addr='borrower.near', lendingId='contract.main.burrow.near';
const positions=(balance,apr,shares='100')=>({
 account_id:addr,supplied:[{token_id:'wrap.near',shares,balance,apr}],
 positions:{regular:{collateral:[],borrowed:[{
  token_id:'linear-protocol.near',shares:'40',balance:'40',apr,
 }]}},has_non_farmed_assets:false
});
const pool=(timestamp,supplied,borrowed,reserved,shares='500',config={can_borrow:true})=>[
 ['wrap.near',{supplied:{shares,balance:supplied},
  borrowed:{shares:'400',balance:borrowed},reserved,
  last_update_timestamp:timestamp,config}],
 ['linear-protocol.near',{supplied:{shares:'90',balance:'1000'},
  borrowed:{shares:'40',balance:'500'},reserved:'2',
  last_update_timestamp:timestamp,config:{can_borrow:true}}],
];
const src=positions('100','0.01');
const dst=positions('101','0.02');
const a=pool('1780000000000000000','600','450','5');
const b=pool('1780000002000000000','601','451','6');

test('Stage104 recognizes bounded monotone interest accrual without pretending exact historical view equality',()=>{
 const p=stage104AttestTemporalAccrual({
  sourceBorrower:src,sandboxBorrower:dst,sourceAssets:a,sandboxAssets:b
 });
 assert.equal(p.verified,true);
 assert.equal(p.class,'BOUNDED_SOURCE_BACKED_TEMPORAL_ACCRUAL_ONLY');
 assert.equal(p.fullHistoricalViewParity,false);
 assert.equal(p.actualRheaSettlementVerified,false);
 assert.equal(p.mayBroadcastMainnet,false);
 assert.equal(p.maySignMainnet,false);
 assert.equal(JSON.stringify(p).includes('wrap.near'),false);
 assert.equal(JSON.stringify(p).includes('178000'),false);
});
test('Stage104 never waives borrower shares, asset ID, market config, pool shares or contradictory accrual',()=>{
 const verify=(patch={})=>stage104AttestTemporalAccrual({
  sourceBorrower:src,sandboxBorrower:dst,sourceAssets:a,sandboxAssets:b,...patch
 }).verified;
 assert.equal(verify({sandboxBorrower:positions('101','0.02','101')}),false);
 assert.equal(verify({sandboxBorrower:{...dst,supplied:[
  {token_id:'linear-protocol.near',shares:'100',balance:'101',apr:'0.02'}]}}),false);
 assert.equal(verify({sandboxAssets:pool('1780000002000000000','601','451','6','501')}),false);
 assert.equal(verify({sandboxAssets:pool('1780000002000000000','601','451','6','500',{can_borrow:false})}),false);
 assert.equal(verify({sandboxAssets:pool('1780000002000000000','599','451','6')}),false);
 assert.equal(verify({sandboxAssets:pool('1779999999000000000','601','451','6')}),false);
 assert.equal(verify({sandboxAssets:pool('1780010801000000000','601','451','6')}),false);
 assert.equal(verify({sandboxAssets:pool('1780000002000000000','601','451','6').map(
  ([id,v])=>[id,{...v,oracle_cache:'different'}])}),false);
 assert.equal(verify({sandboxAssets:[b[0],b[0]]}),false);
});
test('Stage104 permits strictly bounded temporal source-backed Sandbox witness only on opt-in',async()=>{
 const config={max_positions:8};
 const store=[];
 const lending={accountId:lendingId,view:async method=>{
  if(method==='get_config')return config;
  if(method==='get_account_all_positions')return dst;
  if(method==='get_assets_paged')return b;
  throw Error('unexpected view');
 }};
 const params={lending,borrowerAccountId:addr,config,borrower:src,assets:a,
  persist:async witness=>store.push(witness)};
 await assert.rejects(
  attestStage96PinnedRheaViews(params),
  /STAGE96_BORROWER_VIEW_MISMATCH/);
 const result=await attestStage96PinnedRheaViews({
  ...params,allowSandboxTemporalAccrual:true
 });
 assert.equal(result.temporalAccrualVerified,true);
 assert.equal(result.allSourceViewsVerified,false);
 assert.equal(result.status,'BOUNDED_SOURCE_STORAGE_AND_TEMPORAL_ACCRUAL_NOT_EXACT_PARITY');
 assert.equal(result.liquidationAttempted,false);
 assert.equal(result.actualRheaSettlementVerified,false);
 assert.equal(result.mayBroadcastMainnet,false);
 assert.equal(result.checks[1].status,'SOURCE_SANDBOX_MISMATCH');
 assert.equal(result.checks[2].status,'SOURCE_SANDBOX_MISMATCH');
 assert.equal(JSON.stringify(store).includes('1780000002'),false);
});
test('Stage104 rejects mismatched immutable market state even with explicit Sandbox-only mode',async()=>{
 const config={max_positions:8};
 const altered=pool('1780000002000000000','601','451','6','999');
 const lending={accountId:lendingId,view:async method=>
  method==='get_config'?config:method==='get_account_all_positions'?dst:altered};
 await assert.rejects(attestStage96PinnedRheaViews({
  lending,borrowerAccountId:addr,config,borrower:src,assets:a,
  allowSandboxTemporalAccrual:true,persist:async()=>{},
 }),/STAGE96_BORROWER_VIEW_MISMATCH/);
});
