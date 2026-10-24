import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCurrentBorrowerHealth} from '../src/rhea/current-borrower-health.ts';

const L='contract.main.burrow.near', O='aggregate-oracle.near', C='priceoracle.near', B='alice.near';
const HL='2'.repeat(43), HO='3'.repeat(43), HC='4'.repeat(43), HA='a'.repeat(64), HB='b'.repeat(64);
const NOW=Date.now(), HEIGHT='222222222';
const ASSETS=[
 ['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}],
 ['wrap.near',{supplied:{shares:'10',balance:'20'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}],
];
const DETAILS={positions:{iso:{borrowed:[{token_id:'usn',shares:'4',balance:'4'}],
 collateral:[{token_id:'wrap.near',shares:'1',balance:'2'}]}}};
const INFO={'usn':{price_identifier:HA},'wrap.near':{price_identifier:HB}};
const SETTINGS={lendingContract:L,oracleContract:O,configuredOracleContract:C,borrowerAccountId:B,
 expectedLendingCodeHash:HL,expectedOracleCodeHash:HO,expectedConfiguredOracleCodeHash:HC,
 nowMs:NOW,maxPriceAgeMs:60000,maxFutureSkewMs:2000,maxConfidenceBps:150,maxPriceQueries:8};
function mock({config={},metadata=INFO,detail=DETAILS,wrongMethod='',stale=false,oracleBad=false,emptyCollateral=false,latePrice=false}={}){
 const calls=[];
 const rpc={
 async viewAccount(id,block){
  calls.push(['account',id,block]);
  return {blockHeight:HEIGHT,codeHash:id===L?HL:id===O?(oracleBad?HL:HO):HC};
 },
 async view(id,method,args={},block){
  calls.push(['view',method,args,block]);
  let value;
  if(method==='get_config')value={oracle_account_id:C,enable_pyth_oracle:true,...config};
  else if(method==='get_assets_paged')value=ASSETS;
  else if(method==='get_all_token_pyth_infos')value=metadata;
  else if(method==='get_account_all_positions')value=emptyCollateral?{positions:{iso:{borrowed:DETAILS.positions.iso.borrowed,collateral:[]}}}:detail;
  else if(method==='get_price_no_older_than')value={price:'100000000',conf:'40000',expo:-8,
   publish_time:Math.floor((NOW-(stale?240000:5000))/1000)};
  else throw Error('unexpected view '+method);
  return {blockHeight:wrongMethod===method||latePrice&&method==='get_price_no_older_than'?'222222223':HEIGHT,value};
 }
 };return {rpc,calls};
}
test('one fresh finalized block yields paper at risk but never trade authorization',async()=>{
 const {rpc,calls}=mock();
 const report=await inspectCurrentBorrowerHealth(rpc,SETTINGS);
 assert.equal(report.status,'PAPER_HEALTH_UNAPPROVED');
 assert.equal(report.blockHeight,HEIGHT);
 assert.equal(report.paperAtRisk,1);assert.equal(report.paperHealthy,0);
 assert.equal(report.rows[0].healthFactorBps,'5000');
 assert.equal(report.rows[0].reason,null);
 assert.equal(report.executionEnabled,false);assert.equal(report.mayBroadcast,false);
 assert.equal(report.deployedExecutionOraclePriceParityVerified,false);
 assert.equal(report.transactionReplayVerified,false);
 assert.ok(calls.filter(x=>x[0]==='view').every(x=>x[3]===Number(HEIGHT)));
 assert.equal(calls.filter(x=>x[1]==='get_price_no_older_than').length,2);
});
test('more collateral is healthy on paper, still not executable',async()=>{
 const r=await inspectCurrentBorrowerHealth(mock({detail:{positions:{iso:{borrowed:DETAILS.positions.iso.borrowed,
  collateral:[{token_id:'wrap.near',shares:'4',balance:'8'}]}}}}).rpc,SETTINGS);
 assert.equal(r.paperHealthy,1);assert.equal(r.paperAtRisk,0);assert.equal(r.rows[0].executionEligible,false);
});
test('no debt yields no priced position or trade',async()=>{
 const {rpc,calls}=mock({detail:{positions:{}}});
 const r=await inspectCurrentBorrowerHealth(rpc,SETTINGS);
 assert.equal(r.status,'NO_DEBT');assert.equal(r.positions,0);
 assert.equal(calls.filter(x=>x[1]==='get_price_no_older_than').length,0);
});
test('default-priced assets and disabled Pyth are blocked before quote requests',async()=>{
 for(const param of [{metadata:{...INFO,'usn':{default_price:{multiplier:'100000000',decimals:8}}}},
                      {config:{enable_pyth_oracle:false}},{emptyCollateral:true}]){
  const {rpc,calls}=mock(param);
  const r=await inspectCurrentBorrowerHealth(rpc,SETTINGS);
  assert.equal(r.status,'INCOMPLETE_PRICE_EVIDENCE');
  assert.equal(r.blockedPositions,1);
  assert.equal(r.rows[0].healthFactorBps,null);
  assert.equal(calls.filter(x=>x[1]==='get_price_no_older_than').length,0);
 }
});
test('feed budget is atomic for whole position',async()=>{
 const {rpc,calls}=mock();
 const r=await inspectCurrentBorrowerHealth(rpc,{...SETTINGS,maxPriceQueries:1});
 assert.equal(r.rows[0].reason,'FEED_QUERY_BUDGET_EXCEEDED');
 assert.equal(r.queriedFeeds,0);
 assert.equal(calls.filter(x=>x[1]==='get_price_no_older_than').length,0);
});
test('stale price cannot be transformed into a health score',async()=>{
 const r=await inspectCurrentBorrowerHealth(mock({stale:true}).rpc,SETTINGS);
 assert.equal(r.rows[0].status,'BLOCKED');
 assert.equal(r.rows[0].reason,'PRICE_STALE_OR_UNCERTAIN');
 assert.equal(r.rows[0].healthFactorBps,null);
 assert.equal(r.mayBroadcast,false);
});
test('cross-block price and metadata and changed code abort',async()=>{
 for(const x of [{wrongMethod:'get_config'},{latePrice:true},{oracleBad:true}]){
  await assert.rejects(inspectCurrentBorrowerHealth(mock(x).rpc,SETTINGS),/CROSS_BLOCK|CODE_CHANGED/);
 }
});
test('oracle execution config drift aborts instead of falling back',async()=>{
 await assert.rejects(inspectCurrentBorrowerHealth(mock({config:{oracle_account_id:'bad.near'}}).rpc,SETTINGS),/EXECUTION_ORACLE_CONFIG_DRIFT/);
});
test('invalid settings reject before RPC, no stale clock bypass',async()=>{
 for(const cfg of [{nowMs:NOW-80000},{maxPriceQueries:40},{maxPriceAgeMs:999999},{expectedLendingCodeHash:'broken'}]){
  const {rpc,calls}=mock();
  await assert.rejects(inspectCurrentBorrowerHealth(rpc,{...SETTINGS,...cfg}),/INVALID_STAGE26_SETTINGS/);
  assert.equal(calls.length,0);
 }
});
test('workflow is read-only mainnet and reports evidence completeness, not readiness',async()=>{
 const {readFile}=await import('node:fs/promises');
 const s=await readFile(new URL('../.github/workflows/rhea-stage26-current-borrower-health.yml',import.meta.url),'utf8');
 assert.ok(s.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(s.includes('.transactionReplayVerified == false'));
 assert.ok(s.includes('.mayBroadcast == false'));
 assert.ok(!s.includes('broadcast_tx'));
});
