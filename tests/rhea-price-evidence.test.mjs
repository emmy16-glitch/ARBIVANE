import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPositionOracleEvidence } from '../src/rhea/price-evidence.ts';
const HASH='2'.repeat(43),FEED='a'.repeat(64),SHARED='b'.repeat(64);
const NOW=1_800_000_000_000;
const pools=[
 ['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'}}],
 ['wrap.near',{supplied:{shares:'10',balance:'20'},borrowed:{shares:'5',balance:'10'}}],
 ['bridge.near',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'5',balance:'10'}}],
];
const borrower=(accountId,token='usn',collateral='wrap.near')=>({account_id:accountId,positions:{isolated:{borrowed:[{token_id:token,shares:'2'}],collateral:[{token_id:collateral,shares:'3'}]}}});
const detailed=(token='usn',collateral='wrap.near')=>({supplied:[],positions:{isolated:{borrowed:[{token_id:token,shares:'2',balance:'2'}],collateral:[{token_id:collateral,shares:'3',balance:'6'}]}}});
const all=[borrower('alice.near'),borrower('bob.near')];
const info={'usn':{price_identifier:FEED},'wrap.near':{price_identifier:SHARED},'bridge.near':{price_identifier:SHARED}};
const settings={lendingContract:'contract.main.burrow.near',oracleContract:'aggregate-oracle.near',fromIndex:0,maxAccounts:2,pageSize:2,maxFindings:5,maxDetails:2,maxFeedQueries:3,maxAgeMs:60000,maxFutureSkewMs:2000,maxConfidenceBps:150,oracleMethod:'get_price_no_older_than',nowMs:NOW};
function oracleQuote(feed){return {price:'100000000',conf:'40000',expo:-8,publish_time:Math.floor((NOW-20000)/1000)};}
function mock({rows=all,metadata=info,config=true,quotes={},badBlock=false,failQuote=false,detail=null,hash=HASH}={}){
 const calls=[];const rpc={
  async viewAccount(id,height){calls.push(['account',id,height]);return {blockHeight:'101',codeHash:hash};},
  async view(id,method,args={},height){calls.push(['view',id,method,args,height]);
   let value;
   if(method==='get_assets_paged')value=pools;
   else if(method==='get_num_accounts')value=rows.length;
   else if(method==='get_accounts_paged')value=rows.slice(args.from_index,args.from_index+args.limit);
   else if(method==='get_account_all_positions')value=detail??detailed();
   else if(method==='get_all_token_pyth_infos')value=metadata;
   else if(method==='get_config')value={enable_pyth_oracle:config};
   else if(method==='get_price_no_older_than'){
    if(failQuote)throw Error('PRIVATE_TOKEN_NEVER_ECHOED');
    value=quotes[args.price_id]??oracleQuote(args.price_id);
   } else throw Error('unexpected method '+method);
   return {blockHeight:badBlock&&method==='get_price_no_older_than'?'102':'101',value};
  }
 };return {rpc,calls};
}
const probe=(opts={},changes={})=>inspectPositionOracleEvidence(mock(opts).rpc,{...settings,...changes});
test('reads two distinct feed IDs, deduplicates across two borrowers, and never authorizes trades',async()=>{
 const {rpc,calls}=mock();const r=await inspectPositionOracleEvidence(rpc,settings);
 assert.equal(r.status,'QUOTES_OBSERVED_UNAPPROVED');assert.equal(r.feedQueries,2);
 assert.equal(r.successfulFeeds,2);assert.equal(r.blockedPositions,0);
 assert.equal(r.records.length,2);assert.ok(r.records.every(x=>x.quotes.length===2));
 assert.ok(r.records.every(x=>x.executable===false&&x.liquidationEligible===false&&x.indicativeHealthFactor===null&&x.estimatedProfit===null));
 assert.equal(r.executionEnabled,false);assert.equal(r.liquidationParityVerified,false);
 assert.ok(calls.filter(x=>x[0]==='view').every(x=>x[4]===101));
 assert.equal(calls.filter(x=>x[2]==='get_price_no_older_than').length,2);
});
test('known live feed is observed but does not establish financial eligibility',async()=>{
 const x=await probe();const q=x.records[0].quotes[0];
 assert.equal(q.priceMultiplier,'100000000');assert.equal(q.priceDecimals,8);assert.equal(q.ageMs,20000);
 assert.equal(q.confidenceBps,'4');assert.equal(x.priceParityVerified,false);
});
test('missing on-chain price metadata blocks any quote reads',async()=>{
 const {rpc,calls}=mock({metadata:{'wrap.near':info['wrap.near']}});
 const r=await inspectPositionOracleEvidence(rpc,settings);
 assert.equal(r.records[0].status,'BLOCKED');assert.deepEqual(r.records[0].blockers,['UPSTREAM_TRIAGE_BLOCKED']);
 assert.equal(calls.filter(x=>x[2]==='get_price_no_older_than').length,0);
});
test('on-chain default price cannot be substituted for a Pyth quote',async()=>{
 const {rpc,calls}=mock({metadata:{...info,'usn':{default_price:{multiplier:'10000',decimals:4},price_identifier:FEED}}});
 const r=await inspectPositionOracleEvidence(rpc,settings);
 assert.equal(r.records[0].status,'BLOCKED');assert.equal(r.feedQueries,0);
 assert.equal(calls.filter(x=>x[2]==='get_price_no_older_than').length,0);
});
test('disabled Pyth configuration prevents quote reads',async()=>{
 const r=await probe({config:false});assert.equal(r.feedQueries,0);
 assert.ok(r.records.every(x=>x.blockers.includes('PYTH_CONFIG_DISABLED')));
});
test('stale or high confidence prices are rejected and never admitted',async()=>{
 for(const quote of [{price:'100000000',conf:'40000',expo:-8,publish_time:(NOW-120000)/1000},
                     {price:'100000000',conf:'4000000',expo:-8,publish_time:(NOW-10000)/1000}]){
  const result=await probe({quotes:{[FEED]:quote}});
  assert.equal(result.status,'INCOMPLETE_ORACLE_EVIDENCE');
  assert.ok(result.records.every(x=>x.blockers.includes('STALE_OR_LOW_CONFIDENCE')));
  assert.ok(result.records.every(x=>x.estimatedProfit===null));
 }
});
test('rejected oracle view is sanitized, not shown with private RPC errors',async()=>{
 const r=await probe({failQuote:true});assert.equal(r.feedQueries,2);
 assert.ok(r.records.every(x=>x.blockers.includes('ORACLE_QUOTE_REJECTED')));
 assert.ok(!JSON.stringify(r).includes('PRIVATE_TOKEN_NEVER_ECHOED'));
});
test('wrong block quote aborts the whole run',async()=>{
 await assert.rejects(()=>probe({badBlock:true}),/CROSS_BLOCK_ORACLE_QUOTE/);
});
test('quote query cap blocks unqueried feeds, rather than silently relying on one',async()=>{
 const r=await probe({}, {maxFeedQueries:1});assert.equal(r.feedQueries,1);
 assert.ok(r.records.every(x=>x.blockers.includes('QUOTE_REQUEST_LIMIT')));
 assert.equal(r.blockedPositions,2);
});
test('a shared feed for two assets is requested only once',async()=>{
 const row=[borrower('alice.near','bridge.near','wrap.near')];
 const detail=detailed('bridge.near','wrap.near');
 const {rpc,calls}=mock({rows:row,detail});
 const r=await inspectPositionOracleEvidence(rpc,{...settings,maxAccounts:1});
 assert.equal(r.records[0].status,'QUOTED_UNAPPROVED');assert.equal(r.records[0].quotes.length,2);
 assert.equal(r.feedQueries,1);assert.equal(calls.filter(x=>x[2]==='get_price_no_older_than').length,1);
});
test('detailed position mismatch stops all quote requests',async()=>{
 const {rpc,calls}=mock({detail:detailed('bridge.near')});
 const r=await inspectPositionOracleEvidence(rpc,settings);
 assert.equal(r.records[0].status,'BLOCKED');assert.equal(r.records[0].blockers[0],'UPSTREAM_TRIAGE_BLOCKED');
 assert.equal(calls.filter(x=>x[2]==='get_price_no_older_than').length,0);
});
test('no debt produces an empty diagnostic and no price requests',async()=>{
 const rows=[{account_id:'no.near',positions:{}}];const r=await probe({rows}, {maxAccounts:1});
 assert.equal(r.status,'NO_DEBT_FOUND');assert.equal(r.feedQueries,0);assert.equal(r.records.length,0);
});
test('invalid caps and clock are rejected before any RPC reads',async()=>{
 for(const patch of [{maxFeedQueries:0},{maxFeedQueries:33},{maxAgeMs:0},{maxConfidenceBps:0},{nowMs:1},{oracleMethod:'get_random_price'}]){
  const {rpc,calls}=mock();await assert.rejects(()=>inspectPositionOracleEvidence(rpc,{...settings,...patch}),/invalid|unsupported|maxFeedQueries/);
  assert.equal(calls.length,0);
 }
});
test('pinned lending and oracle contract hashes are enforced',async()=>{
 await assert.rejects(()=>probe({},{expectedOracleCodeHash:'3'.repeat(43)}),/PINNED_ORACLE_CODE_HASH_MISMATCH/);
});
