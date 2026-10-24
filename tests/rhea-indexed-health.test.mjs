import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectIndexedRheaHealth, scoreIndexedPaperScenarios, validateIndexedCheckpoint } from '../src/rhea/indexed-health-pipeline.ts';
const HASH='2'.repeat(43), FEED_A='a'.repeat(64), FEED_B='b'.repeat(64), NOW=1_800_000_000_000;
const account='alice.near',lending='contract.main.burrow.near',oracle='aggregate-oracle.near';
const assets=[
 ['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}],
 ['wrap.near',{supplied:{shares:'10',balance:'20'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}],
];
const alice={account_id:account,positions:{iso:{borrowed:[{token_id:'usn',shares:'4'}],collateral:[{token_id:'wrap.near',shares:'1'}]}}};
const bob={account_id:'bob.near',positions:{}};
const aliceDetail={supplied:[],positions:{iso:{borrowed:[{token_id:'usn',shares:'4',balance:'4'}],collateral:[{token_id:'wrap.near',shares:'1',balance:'2'}]}}};
const hit={accountId:account,classification:'DEBT_SHARES_DISCOVERED_UNVALUED',positions:[{positionId:'iso',debtAssetIds:['usn'],collateralRecorded:true}]};
function checkpoint(overrides={}){
 return {version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,
  liquidationParityVerified:false,lendingContract:lending,blockHeight:'101',lendingCodeHash:HASH,
  codeHashPinProvided:false,totalAccounts:2,startIndex:0,targetEndIndex:2,nextIndex:2,scannedAccounts:2,invalidAccounts:0,
  schemaReasons:{},seenAccountIds:['alice.near','bob.near'],findings:[hit],completeSnapshot:true,...overrides};
}
const options={lendingContract:lending,oracleContract:oracle,fromFinding:0,maxFoundAccounts:2,
 maxPriceQueries:2,nowMs:NOW,maxAgeMs:60_000,maxFutureSkewMs:2000,maxConfidenceBps:150};
function mock({rows=[alice,bob],detail=aliceDetail,metadata={'usn':{price_identifier:FEED_A},'wrap.near':{price_identifier:FEED_B}},
  oracleQuotes={},wrongBlockMethod='',hash=HASH,config=true,unavailable='',assetsOverride=assets}={}){
 const calls=[];
 const rpc={
  async viewAccount(id,b){calls.push(['account',id,b]);return {blockHeight:'101',codeHash:hash};},
  async view(id,method,args={},b){calls.push(['view',method,args,b]);
   if(method===unavailable)throw Error('unavailable private provider information');
   let value;
   if(method==='get_assets_paged')value=assetsOverride;
   else if(method==='get_num_accounts')value=2;
   else if(method==='get_all_token_pyth_infos')value=metadata;
   else if(method==='get_config')value={enable_pyth_oracle:config};
   else if(method==='get_accounts_paged')value=rows.slice(args.from_index,args.from_index+args.limit);
   else if(method==='get_account_all_positions')value=detail;
   else if(method==='get_price_no_older_than')value=oracleQuotes[args.price_id]??{
    price:'100000000',conf:'40000',expo:-8,publish_time:(NOW-20000)/1000};
   else throw Error('unexpected read-only method '+method);
   return {blockHeight:method===wrongBlockMethod?'102':'101',value};
  },
 };return {rpc,calls};
}
const inspect=(opts={},params={},cp=checkpoint())=>inspectIndexedRheaHealth(mock(opts).rpc,cp,{...options,...params});
test('real indexed borrower is rechecked at same NEAR block and classified paper-at-risk only',async()=>{
 const {rpc,calls}=mock();const res=await inspectIndexedRheaHealth(rpc,checkpoint(),options);
 assert.equal(res.status,'PAPER_HEALTH_OBSERVED_UNAPPROVED');
 assert.equal(res.paperAtRisk,1);assert.equal(res.blockedPositions,0);assert.equal(res.sourceDebtAccounts,1);
 assert.equal(res.records[0].classification,'PAPER_AT_RISK_UNAPPROVED');
 assert.equal(res.records[0].liquidationEligible,false);assert.equal(res.profitabilityVerified,false);
 assert.equal(res.executionEnabled,false);assert.equal(res.healthReport.liquidationParityVerified,false);
 assert.ok(calls.filter(x=>x[0]==='view').every(x=>x[3]===101));
 assert.deepEqual(calls.filter(x=>x[1]==='get_accounts_paged').map(x=>x[2]),[{from_index:0,limit:1}]);
 assert.equal(calls.filter(x=>x[1]==='get_price_no_older_than').length,2);
});
test('more collateral changes paper screen to healthy, never eligible',async()=>{
 const rows=[{...alice,positions:{iso:{borrowed:[{token_id:'usn',shares:'4'}],collateral:[{token_id:'wrap.near',shares:'4'}]}}},bob];
 const detail={supplied:[],positions:{iso:{borrowed:[{token_id:'usn',shares:'4',balance:'4'}],collateral:[{token_id:'wrap.near',shares:'4',balance:'8'}]}}};
 const r=await inspect({rows,detail});assert.equal(r.paperHealthy,1);assert.equal(r.paperAtRisk,0);
 assert.equal(r.records[0].liquidationEligible,false);
});
test('no debt findings never guesses borrower or requests a price feed',async()=>{
 const {rpc,calls}=mock();const r=await inspectIndexedRheaHealth(rpc,checkpoint({findings:[]}),options);
 assert.equal(r.status,'NO_FINDINGS');assert.equal(r.positionCount,0);
 assert.equal(calls.filter(x=>x[1]==='get_accounts_paged'||x[1]==='get_price_no_older_than').length,0);
});
test('cursor at final finding performs no borrower calls',async()=>{
 const {rpc,calls}=mock();const r=await inspectIndexedRheaHealth(rpc,checkpoint(),{...options,fromFinding:1});
 assert.equal(r.nextFinding,1);assert.equal(r.examinedAccounts,0);
 assert.equal(calls.filter(x=>x[1]==='get_account_all_positions').length,0);
});
test('reject checkpoints that lie about completion or count',()=>{
 for(const c of [checkpoint({completeSnapshot:false}),checkpoint({scannedAccounts:3}),checkpoint({seenAccountIds:['alice.near','alice.near']}),
   checkpoint({findings:[hit,hit]}),checkpoint({blockHeight:'0'}),checkpoint({invalidAccounts:1}),
   checkpoint({findings:[{...hit,positions:[{...hit.positions[0],debtAssetIds:['usn','usn']}]}]})]){
  assert.throws(()=>validateIndexedCheckpoint(c),/INVALID_CHECKPOINT/);
 }
});
test('invalid budgets and independent hash pin reject before any RPC',async()=>{
 for(const o of [{maxFoundAccounts:0},{maxPriceQueries:33},{fromFinding:3},{maxAgeMs:0},{expectedLendingCodeHash:'3'.repeat(43)}]){
  const {rpc,calls}=mock();await assert.rejects(()=>inspectIndexedRheaHealth(rpc,checkpoint(),{...options,...o}));
  assert.equal(calls.length,0);
 }
});
test('checkpoint lending code drift aborts rather than silently recovering',async()=>{
 await assert.rejects(()=>inspect({hash:'3'.repeat(43)}),/CROSS_BLOCK_OR_CODE_HASH_DRIFT/);
});
test('same block changed shares cannot pass independent detailed share parity',async()=>{
 const rows=[{...alice,positions:{iso:{borrowed:[{token_id:'usn',shares:'5'}],collateral:[{token_id:'wrap.near',shares:'1'}]}}},bob];
 const r=await inspect({rows});assert.equal(r.records[0].blockers[0],'DETAILED_SHARE_PARITY_FAILED');assert.equal(r.queriedFeeds,0);
});
test('mismatched detailed debt asset sets block all oracle calls',async()=>{
 const detail={supplied:[],positions:{iso:{borrowed:[{token_id:'wrap.near',shares:'4',balance:'8'}],collateral:[{token_id:'wrap.near',shares:'1',balance:'2'}]}}};
 const r=await inspect({detail});assert.equal(r.records[0].blockers[0],'POSITION_SCOPE_MISMATCH');assert.equal(r.queriedFeeds,0);
});
test('share-to-balance disagreement rejects before fetching price data',async()=>{
 const detail={supplied:[],positions:{iso:{borrowed:[{token_id:'usn',shares:'4',balance:'5'}],collateral:[{token_id:'wrap.near',shares:'1',balance:'2'}]}}};
 const r=await inspect({detail});assert.equal(r.records[0].blockers[0],'DETAILED_SHARE_PARITY_FAILED');assert.equal(r.queriedFeeds,0);
});
test('legacy debt is blocked and never mapped to isolated position zero',async()=>{
 const row={account_id:'alice.near',borrowed:{usn:'4'},collateral:{'wrap.near':'1'}};
 const c=checkpoint({findings:[{...hit,positions:[{positionId:null,debtAssetIds:['usn'],collateralRecorded:true}]}]});
 const r=await inspect({rows:[row,bob]}, {}, c);
 assert.equal(r.records[0].blockers[0],'LEGACY_SCOPE_UNSUPPORTED');assert.equal(r.records[0].positionId,null);
});
test('Pyth disabled or unmapped or default token feed blocks without price RPC',async()=>{
 for(const p of [{config:false},{metadata:{'usn':{price_identifier:FEED_A}}},
                   {metadata:{'usn':{price_identifier:FEED_A},'wrap.near':{default_price:{multiplier:'1',decimals:0}}}}]){
  const {rpc,calls}=mock(p);const r=await inspectIndexedRheaHealth(rpc,checkpoint(),options);
  assert.equal(r.records[0].classification,'BLOCKED');assert.equal(r.queriedFeeds,0);
  assert.equal(calls.filter(x=>x[1]==='get_price_no_older_than').length,0);
 }
});
test('insufficient query budget never prices half a position as valid',async()=>{
 const r=await inspect({}, {maxPriceQueries:1});assert.equal(r.records[0].blockers[0],'PRICE_QUERY_BUDGET_EXHAUSTED');
 assert.equal(r.queriedFeeds,1);
});
test('stale or low-confidence quote blocks position',async()=>{
 for(const q of [{price:'100000000',conf:'40000',expo:-8,publish_time:(NOW-120000)/1000},
                 {price:'100000000',conf:'4000000',expo:-8,publish_time:(NOW-10000)/1000}]){
  const r=await inspect({oracleQuotes:{[FEED_A]:q}});assert.equal(r.records[0].blockers[0],'PRICE_STALE_OR_UNCERTAIN');
 }
});
test('RPC details failure is sanitized and does not become health',async()=>{
 const r=await inspect({unavailable:'get_account_all_positions'});
 assert.equal(r.records[0].blockers[0],'DETAIL_VIEW_UNAVAILABLE');
 assert.ok(!JSON.stringify(r).includes('private provider'));
});
test('cross block detailed and oracle reads always abort',async()=>{
 for(const wrongBlockMethod of ['get_account_all_positions','get_price_no_older_than','get_assets_paged']){
  await assert.rejects(()=>inspect({wrongBlockMethod}),/CROSS_BLOCK/);
 }
});
test('operator scenarios are optional and missing funding remains blocked',async()=>{
 const result=await inspect();
 const sample={scenarioId:'test1',accountId:'alice.near',positionId:'iso',blockHeight:'101',asOfFinalizedHeight:'101',
  lendingCodeHash:HASH,oracleCodeHash:HASH,repay:[{tokenId:'usn',grossUsdE27:'1000000000000000000000000000',volatilityBps:10000}],
  seize:[{tokenId:'wrap.near',grossUsdE27:'1000000000000000000000000000',volatilityBps:10000}],
  fundingCapacityUsdE27:null,costs:null,competition:{kind:'UNKNOWN'}};
 const scored=scoreIndexedPaperScenarios(result,[sample]);
 assert.equal(scored.blocked,1);assert.equal(scored.paperPositive,0);
 assert.equal(scored.records[0].profitabilityVerified,false);assert.equal(scored.records[0].hypotheticalNetAfterMaximumCostsUsdE27,null);
 assert.equal(scored.executionEnabled,false);
});

test('snapshot claiming a different on-chain total fails hard',async()=>{
 const {rpc}=mock();const wrapped={...rpc,view:async(...args)=>args[1]==='get_num_accounts'?{blockHeight:'101',value:3}:rpc.view(...args)};
 await assert.rejects(()=>inspectIndexedRheaHealth(wrapped,checkpoint(),options),/CHECKPOINT_ONCHAIN_ACCOUNT_COUNT_MISMATCH/);
});
test('partial checkpoint cannot claim a fully verified research status',async()=>{
 const c=checkpoint({nextIndex:1,scannedAccounts:1,targetEndIndex:2,seenAccountIds:['alice.near'],completeSnapshot:false});
 const r=await inspectIndexedRheaHealth(mock().rpc,c,options);
 assert.equal(r.sourceSnapshotComplete,false);assert.equal(r.status,'INCOMPLETE_EVIDENCE');
 assert.ok(r.warnings.includes('INCOMPLETE_MARKET_BACKFILL'));
});
