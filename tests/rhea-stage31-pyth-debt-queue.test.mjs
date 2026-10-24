import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshIndexedBorrowerCandidates} from '../src/rhea/active-pyth-debt-queue.ts';

const HASH='2'.repeat(43),ORACLE='3'.repeat(43);
const F=id=>({accountId:id,classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
 positions:[{positionId:'REGULAR',debtAssetIds:['wrap.near'],collateralRecorded:true}]});
const src=()=>({
 mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',chain:'NEAR_MAINNET',
 status:'COMPLETE_DEBT_INDEX_READ_ONLY',blockHeight:'221433162',lendingCodeHash:HASH,
 totalAccounts:72882,scannedAccounts:72882,debtAccounts:3,debtPositions:3,
 shardCount:4,zeroSchemaErrors:true,completeSnapshot:true,
 findings:[F('alice.near'),F('bob.near'),F('carol.near')],
 executionEnabled:false,liquidationEligible:false,profitabilityVerified:false,
});
const options={fromFinding:0,maxFindings:2,concurrency:2,
 lendingContract:'contract.main.burrow.near',pythOracle:'aggregate-oracle.near',
 expectedLendingCodeHash:HASH,expectedPythOracleCodeHash:ORACLE,
 maxConfidenceBps:150,sanityMaxUsd:'10000000'};
const P=(account,kind='PAPER_AT_RISK_UNAPPROVED')=>({
 mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
 status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',
 borrowerAccountId:account,blockHeight:'221434901',candidatePositions:1,
 positions:[{positionId:'REGULAR',status:kind,
  healthFactorBps:kind==='PAPER_AT_RISK_UNAPPROVED'?'9432':'13627',
  legs:[{role:'borrowed',tokenId:'wrap.near'}]}],
 executionEnabled:false,maySign:false,mayBroadcast:false,
 transactionReplayVerified:false,profitVerified:false,
 sourceWasmReproduciblyMatched:false,priceConstructionMatchesCurrentSdk:true,
 deployedMetadataAndConfigObserved:true,
});
const rpc={};
test('price refreshed candidates from verified full index with bounded cursor and never execute',async()=>{
 const calls=[];const out=await refreshIndexedBorrowerCandidates(rpc,src(),options,async id=>{
  calls.push(id);return P(id,id==='alice.near'?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED');
 });
 assert.deepEqual(calls,['alice.near','bob.near']);
 assert.equal(out.processed,2);assert.equal(out.remainingFindings,1);assert.equal(out.nextFinding,2);
 assert.equal(out.paperAtRisk,1);assert.equal(out.paperHealthy,1);
 assert.equal(out.items[0].freshHealthBps,'9432');
 assert.equal(out.items[0].executionEligible,false);assert.equal(out.maySign,false);assert.equal(out.mayBroadcast,false);
 assert.equal(out.currentLiquidationEligibilityProven,false);
});
test('supports subsequent cursor and end of discovered debt',async()=>{
 const a=await refreshIndexedBorrowerCandidates(rpc,src(),{...options,fromFinding:2},async id=>P(id));
 assert.equal(a.items[0].borrowerAccountId,'carol.near');
 assert.equal(a.nextFinding,3);assert.equal(a.remainingFindings,0);
 const b=await refreshIndexedBorrowerCandidates(rpc,src(),{...options,fromFinding:3},async()=>{throw Error('must not call');});
 assert.equal(b.status,'NO_MORE_FINDINGS');assert.equal(b.processed,0);
});
test('stale source position identity drift blocks and does not invent liquidatable balance',async()=>{
 const out=await refreshIndexedBorrowerCandidates(rpc,src(),options,async id=>({
 ...P(id),positions:[{...P(id).positions[0],legs:[{role:'borrowed',tokenId:'newtoken.near'}]}]
 }));
 assert.equal(out.items[0].classification,'BLOCKED_SOURCE_POSITION_CHANGED');
 assert.equal(out.items[0].freshHealthBps,null);assert.equal(out.blocked,2);
});
test('RPC failures, missing prices and changed source debt are never reclassified healthy',async()=>{
 const out=await refreshIndexedBorrowerCandidates(rpc,src(),options,async id=>{
  if(id==='alice.near')throw Error('private RPC error including credentials');
  return {...P(id),status:'INCOMPLETE_ACTIVE_PYTH_VALUATION',
   positions:[{...P(id).positions[0],status:'BLOCKED'}]};
 });
 assert.equal(out.blocked,2);assert.equal(out.items[0].classification,'BLOCKED_RPC');
 assert.equal(out.items[1].classification,'BLOCKED_INCOMPLETE_QUOTES');
 assert.equal(JSON.stringify(out).includes('credentials'),false);
});
test('no debt after index produces no trade opportunity',async()=>{
 const out=await refreshIndexedBorrowerCandidates(rpc,src(),options,async id=>({
 ...P(id),status:'NO_DEBT',positions:[],candidatePositions:0,
 }));
 assert.equal(out.noDebtNow,2);assert.equal(out.paperAtRisk,0);
 assert.equal(out.items[0].classification,'NO_DEBT_NOW');
});
test('fabricated full-index completion or safety flags reject before any network call',async()=>{
 const valid=src();
 for(const s of [{...valid,completeSnapshot:false},
  {...valid,totalAccounts:100},
  {...valid,liquidationEligible:true},
  {...valid,findings:[F('alice.near'),F('alice.near'),F('carol.near')]},
  {...valid,findings:[F('alice.near'),{...F('bob.near'),positions:[{...F('bob.near').positions[0],debtAssetIds:['wrap.near','wrap.near']}]},F('carol.near')]},
 ]){
  await assert.rejects(()=>refreshIndexedBorrowerCandidates(rpc,s,options,async()=>{throw Error('SHOULD_NOT_TOUCH_NETWORK');}));
 }
 for(const o of [{maxFindings:21},{fromFinding:4},{concurrency:4},{expectedLendingCodeHash:ORACLE}]){
  await assert.rejects(()=>refreshIndexedBorrowerCandidates(rpc,src(),{...options,...o}));
 }
});
test('untrusted reprice attempt cannot claim execution authorization',async()=>{
 const out=await refreshIndexedBorrowerCandidates(rpc,src(),options,async id=>({
  ...P(id),mayBroadcast:true,
 }));
 assert.equal(out.blocked,2);
 assert.equal(out.paperAtRisk,0);
 assert.equal(out.items[0].reason,'RPC_OR_ORACLE_READ_FAILED');
});
