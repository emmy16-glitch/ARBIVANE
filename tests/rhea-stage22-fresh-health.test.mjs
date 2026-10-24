import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFreshBorrowers} from '../src/rhea/fresh-borrower-health.ts';
import {assessExecutionReadiness} from '../src/rhea/execution-readiness.ts';
const lending='contract.main.burrow.near',oracle='aggregate-oracle.near',HASH='2'.repeat(43);
const SOURCE_HEIGHT=101,FRESH_HEIGHT=102;
const now=Date.now(),FEED_A='a'.repeat(64),FEED_B='b'.repeat(64);
const detail={supplied:[],positions:{iso:{borrowed:[{token_id:'usn',shares:'4',balance:'4'}],collateral:[{token_id:'wrap.near',shares:'1',balance:'2'}]}}};
const assets=[['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}],
 ['wrap.near',{supplied:{shares:'10',balance:'20'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}]];
function source(overrides={}){
 return {version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,
  liquidationParityVerified:false,lendingContract:lending,blockHeight:String(SOURCE_HEIGHT),lendingCodeHash:HASH,
  codeHashPinProvided:true,totalAccounts:4,startIndex:0,targetEndIndex:2,nextIndex:2,scannedAccounts:2,
  invalidAccounts:0,schemaReasons:{},seenAccountIds:['alice.near','bob.near'],
  findings:[{accountId:'alice.near',classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
    positions:[{positionId:'iso',debtAssetIds:['usn'],collateralRecorded:true}]}],
  completeSnapshot:false,borrowedPoolBalancePositive:true,sourceView:'get_account_all_positions',...overrides};
}
const opts={lendingContract:lending,oracleContract:oracle,shardId:0,shardCount:2,
 fromFinding:0,maxFindings:1,nowMs:now,maxPriceAgeMs:60000,maxPriceQueries:6};
function rpc({freshId='alice.near',freshCodeHash=HASH,newBorrowing=detail,priceTimeMs=now-2000}={}){
 const calls=[];
 return {calls,client:{
  async viewAccount(account,block){calls.push(['account',account,block]);return {blockHeight:String(block??FRESH_HEIGHT),codeHash:account===lending?(block===SOURCE_HEIGHT?HASH:freshCodeHash):HASH};},
  async view(account,method,args,block){calls.push(['view',method,block,args]);let value;
   if(method==='get_assets_paged')value=assets;
   else if(method==='get_num_accounts')value=4;
   else if(method==='get_accounts_paged')value=[{account_id:block===SOURCE_HEIGHT?'alice.near':freshId,positions:{}}];
   else if(method==='get_account_all_positions')value=block===SOURCE_HEIGHT?detail:newBorrowing;
   else if(method==='get_all_token_pyth_infos')value={'usn':{price_identifier:FEED_A},'wrap.near':{price_identifier:FEED_B}};
   else if(method==='get_config')value={enable_pyth_oracle:true};
   else if(method==='get_price_no_older_than')value={price:'100000000',conf:'40000',expo:-8,publish_time:Math.floor(priceTimeMs/1000)};
   else throw Error('Unexpected view '+method);
   return {blockHeight:String(block),value};
  },
 }};
}
test('live refresh uses current same-block oracle quotes and never reuses historical prices',async()=>{
 const {client,calls}=rpc();const r=await inspectFreshBorrowers(client,source(),opts);
 assert.equal(r.freshBlockHeight,'102');assert.equal(r.refreshed,1);
 assert.equal(r.records[0].health.records[0].classification,'PAPER_AT_RISK_UNAPPROVED');
 assert.equal(r.records[0].health.records[0].liquidationEligible,false);
 assert.equal(r.executionEnabled,false);assert.equal(r.netProfitVerified,false);
 assert.ok(calls.filter(x=>x[1]==='get_price_no_older_than').every(x=>x[2]===FRESH_HEIGHT));
});
test('stale current quotes block health rather than lifting transaction restrictions',async()=>{
 const {client}=rpc({priceTimeMs:now-180000});
 const r=await inspectFreshBorrowers(client,source(),opts);
 assert.equal(r.records[0].health.records[0].classification,'BLOCKED');
 assert.equal(r.records[0].health.records[0].blockers[0],'PRICE_STALE_OR_UNCERTAIN');
 assert.equal(r.executionEnabled,false);
});
test('account index drift and changed code hash fail closed',async()=>{
 const shifted=await inspectFreshBorrowers(rpc({freshId:'someone.near'}).client,source(),opts);
 assert.equal(shifted.records[0].reason,'FRESH_INDEX_DRIFT');
 assert.equal(shifted.refreshed,0);
 const upgraded=await inspectFreshBorrowers(rpc({freshCodeHash:'3'.repeat(43)}).client,source(),opts);
 assert.equal(upgraded.records[0].reason,'CONTRACT_CHANGED');
});
test('a vanished debt is not a current liquidation candidate',async()=>{
 const d={supplied:[],positions:{iso:{borrowed:[],collateral:[{token_id:'wrap.near',shares:'1',balance:'2'}]}}};
 const r=await inspectFreshBorrowers(rpc({newBorrowing:d}).client,source(),opts);
 assert.equal(r.refreshed,0);assert.equal(r.records[0].reason,'NO_CURRENT_BORROWING');
});
test('unsupported source and unsafe options reject before market reads',async()=>{
 const client=rpc().client;
 await assert.rejects(inspectFreshBorrowers(client,source({codeHashPinProvided:false}),opts),/CHECKPOINT/);
 await assert.rejects(inspectFreshBorrowers(client,source(),{...opts,maxFindings:99}),/INVALID_FRESH_RESEARCH_OPTIONS/);
});
test('execution readiness enumerates blockers but never broadcasts even with all flags true',()=>{
 const e={currentBorrowerHealthVerified:false,deployedLiquidationMathAttested:false,
 oraclePriceParityAttested:false,financingGasAttested:false,nearTransactionSimulationAttested:false,
 walletCustodyLimitsApproved:false,competitionAndNetProfitVerified:false,independentReleaseApproved:false};
 const result=assessExecutionReadiness(e);assert.equal(result.blockers.length,8);
 assert.equal(result.executionEnabled,false);assert.equal(result.mayBroadcast,false);
 const all=assessExecutionReadiness(Object.fromEntries(Object.keys(e).map(k=>[k,true])));
 assert.equal(all.status,'RESEARCH_GATES_REPORTED_ONLY');assert.equal(all.executionEnabled,false);
 assert.throws(()=>assessExecutionReadiness({...e,unapproved:true}),/INVALID_ATTESTATIONS/);
});
