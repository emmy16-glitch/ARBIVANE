import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePaperPositionHealth, inspectRheaPaperHealth } from '../src/rhea/health-screen.ts';
const HASH='2'.repeat(43),F1='a'.repeat(64),F2='b'.repeat(64), NOW=1_800_000_000_000;
const assets=[
 ['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}],
 ['wrap.near',{supplied:{shares:'10',balance:'20'},borrowed:{shares:'5',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}],
];
const shares=(token,sh)=>({token_id:token,shares:sh});
const borrower=(name='alice.near')=>({account_id:name,positions:{one:{borrowed:[shares('usn','4')],collateral:[shares('wrap.near','3')]}}});
const detail={supplied:[],positions:{one:{borrowed:[{...shares('usn','4'),balance:'4'}],collateral:[{...shares('wrap.near','3'),balance:'6'}]}}};
const info={'usn':{price_identifier:F1},'wrap.near':{price_identifier:F2}};
const quote=(price=100000000)=>({price:String(price),conf:'1000',expo:-8,publish_time:(NOW-10000)/1000});
const settings={lendingContract:'contract.main.burrow.near',oracleContract:'aggregate-oracle.near',fromIndex:0,maxAccounts:2,
 pageSize:2,maxFindings:2,maxDetails:2,maxFeedQueries:3,maxAgeMs:60000,maxFutureSkewMs:2000,
 maxConfidenceBps:150,oracleMethod:'get_price_no_older_than',nowMs:NOW,maxHealthDetails:2};
function record(patch={}){
 return {accountId:'alice.near',positionId:'one',debtAssetIds:['usn'],collateralAssetIds:['wrap.near'],status:'QUOTED_UNAPPROVED',blockers:[],
  quotes:[{assetId:'usn',feedId:F1,priceMultiplier:'100000000',priceDecimals:8,publishTimeMs:NOW-10000,ageMs:10000,confidenceBps:'1'},
   {assetId:'wrap.near',feedId:F2,priceMultiplier:'100000000',priceDecimals:8,publishTimeMs:NOW-10000,ageMs:10000,confidenceBps:'1'}],
 ...patch};
}
function mock({rows=[borrower()],fullDetail=detail,market=assets,quotes={},metadata=info,wrongBlock=false,failDetail=false,invalidRecord=false}={}){
 const calls=[];const rpc={
 async viewAccount(id,block){calls.push({method:'view_account',id,block});return {blockHeight:'101',codeHash:HASH};},
 async view(id,method,args={},block){calls.push({method,id,args,block});let value;
  if(method==='get_assets_paged')value=market;
  else if(method==='get_num_accounts')value=rows.length;
  else if(method==='get_accounts_paged')value=rows.slice(args.from_index,args.from_index+args.limit);
  else if(method==='get_account_all_positions'){if(failDetail)throw Error('private network failure');value=fullDetail;}
  else if(method==='get_all_token_pyth_infos')value=metadata;
  else if(method==='get_config')value={enable_pyth_oracle:true};
  else if(method==='get_price_no_older_than')value=quotes[args.price_id]??quote();
  else throw Error('unexpected method '+method);
  return {blockHeight:wrongBlock&&method==='get_account_all_positions'?'102':'101',value};
 }};return {rpc,calls};
}
test('pure model: healthy position, exact integer values, explicitly no approval',()=>{
 const result=calculatePaperPositionHealth(record(),detail,assets);
 assert.equal(result.classification,'PAPER_HEALTHY_UNAPPROVED');
 assert.equal(result.healthFactorBps,'15000');
 assert.equal(result.adjustedCollateralE27,(6n*10n**27n).toString());
 assert.equal(result.adjustedDebtE27,(4n*10n**27n).toString());
 assert.equal(result.discountE27,'0');assert.equal(result.executionEnabled,false);
 assert.equal(result.liquidationEligible,false);assert.equal(result.estimatedProfit,null);
});
test('pure model: borrower with low collateral quotes is only a paper at-risk flag',()=>{
 const r=record({quotes:record().quotes.map(x=>x.assetId==='wrap.near'?{...x,priceMultiplier:'50000000'}:x)});
 const health=calculatePaperPositionHealth(r,detail,assets);
 assert.equal(health.classification,'PAPER_AT_RISK_UNAPPROVED');
 assert.equal(health.healthFactorBps,'7500');
 assert.equal(health.discountE27,(125n*10n**24n).toString());
 assert.equal(health.liquidationEligible,false);
});
test('pool share mismatch blocks entire source valuation rather than trusting token balance',()=>{
 const bad={...detail,positions:{one:{...detail.positions.one,borrowed:[{token_id:'usn',shares:'4',balance:'5'}]}}};
 assert.throws(()=>calculatePaperPositionHealth(record(),bad,assets),/SOURCE_SHARE_BALANCE_MISMATCH/);
});
test('unknown quote token and duplicate feed-priced token cannot pass',()=>{
 const p=record();
 for(const quotes of [[...p.quotes,p.quotes[0]],[p.quotes[0]],p.quotes.map(x=>x.assetId==='wrap.near'?{...x,assetId:'other.near'}:x)])
  assert.throws(()=>calculatePaperPositionHealth({...p,quotes},detail,assets),/quote|price/);
});
test('zero shares, missing position, duplicate collateral and wrong ID set block',()=>{
 const p=record();
 const x={...detail,positions:{other:detail.positions.one}};
 assert.throws(()=>calculatePaperPositionHealth(p,x,assets),/position not found/);
 const y={...detail,positions:{one:{...detail.positions.one,collateral:[...detail.positions.one.collateral,detail.positions.one.collateral[0]]}}};
 assert.throws(()=>calculatePaperPositionHealth(p,y,assets),/set mismatch/);
 const z={...detail,positions:{one:{...detail.positions.one,borrowed:[{token_id:'usn',shares:'0',balance:'4'}]}}};
 assert.throws(()=>calculatePaperPositionHealth(p,z,assets),/zero share/);
});
test('invalid config ratios and missing asset config fail without defaults',()=>{
 for(const val of [0,10001,'1.5',-1]){
  const a=structuredClone(assets);a[0][1].config.volatility_ratio=val;
  assert.throws(()=>calculatePaperPositionHealth(record(),detail,a),/volatility ratio/);
 }
 const a=structuredClone(assets);delete a[0][1].config;
 assert.throws(()=>calculatePaperPositionHealth(record(),detail,a),/asset config/);
});
test('source model never values upstream blocked or legacy position',()=>{
 for(const p of [record({status:'BLOCKED',blockers:['UPSTREAM_TRIAGE_BLOCKED']}),record({positionId:null})]){
  const r=calculatePaperPositionHealth(p,detail,assets);
  assert.equal(r.classification,'BLOCKED');assert.equal(r.healthFactorBps,null);
 }
});
test('integration: same block, healthy read-only health result',async()=>{
 const {rpc,calls}=mock();const r=await inspectRheaPaperHealth(rpc,settings);
 assert.equal(r.status,'PAPER_HEALTH_EVIDENCE_UNAPPROVED');
 assert.equal(r.paperHealthy,1);assert.equal(r.paperAtRisk,0);assert.equal(r.blockedPositions,0);
 assert.equal(r.records[0].healthFactorBps,'15000');
 assert.equal(r.executionEnabled,false);assert.equal(r.liquidationParityVerified,false);
 assert.ok(calls.filter(x=>x.method!=='view_account').every(x=>x.block===101));
});
test('integration: distinct price changes trigger paper at-risk flag, never execution',async()=>{
 const {rpc}=mock({quotes:{[F2]:quote(50000000)}});
 const r=await inspectRheaPaperHealth(rpc,settings);
 assert.equal(r.paperAtRisk,1);assert.equal(r.records[0].healthFactorBps,'7500');
 assert.equal(r.records[0].liquidationEligible,false);
});
test('integration: price metadata missing blocks before math, never fabricates health',async()=>{
 const {rpc}=mock({metadata:{usn:{price_identifier:F1}}});
 const r=await inspectRheaPaperHealth(rpc,settings);
 assert.equal(r.status,'INCOMPLETE_HEALTH_EVIDENCE');assert.equal(r.records[0].classification,'BLOCKED');
 assert.equal(r.records[0].healthFactorBps,null);assert.equal(r.blockedPositions,1);
});
test('integration: if detailed source balance disagrees with shares, report clear blocker',async()=>{
 const modified=structuredClone(detail);modified.positions.one.collateral[0].balance='7';
 const {rpc}=mock({fullDetail:modified});const r=await inspectRheaPaperHealth(rpc,settings);
 assert.equal(r.records[0].classification,'BLOCKED');
 assert.deepEqual(r.records[0].blockers,['SOURCE_SHARE_BALANCE_MISMATCH']);
});
test('integration: health detail budget fails closed and counts unique account reads',async()=>{
 const {rpc,calls}=mock({rows:[borrower('alice.near'),borrower('bob.near')]});
 const r=await inspectRheaPaperHealth(rpc,{...settings,maxHealthDetails:1});
 assert.equal(r.records.length,2);assert.equal(r.blockedPositions,1);
 assert.deepEqual(r.records[1].blockers,['DETAIL_BUDGET_EXHAUSTED']);
 assert.equal(calls.filter(x=>x.method==='get_account_all_positions').length,3);
});
test('integration: no debt never converts into healthy borrower result',async()=>{
 const {rpc}=mock({rows:[{account_id:'a.near',positions:{}}]});
 const r=await inspectRheaPaperHealth(rpc,{...settings,maxAccounts:1});
 assert.equal(r.status,'NO_DEBT_FOUND');assert.equal(r.paperHealthy,0);assert.equal(r.records.length,0);
});
test('integration: cross-block health detail throws rather than treating as risk',async()=>{
 const {rpc}=mock();const original=rpc.view;let called=0;
 rpc.view=async(...args)=>{const o=await original(...args);if(args[1]==='get_account_all_positions'&&++called===2)return {...o,blockHeight:'102'};return o;};
 await assert.rejects(()=>inspectRheaPaperHealth(rpc,settings),/CROSS_BLOCK_READ/);
});
test('reject invalid detail caps before touching RPC',async()=>{
 for(const cap of [0,21,-1,1.5]){
  const {rpc,calls}=mock();await assert.rejects(()=>inspectRheaPaperHealth(rpc,{...settings,maxHealthDetails:cap}),/invalid maxHealthDetails/);
  assert.equal(calls.length,0);
 }
});
