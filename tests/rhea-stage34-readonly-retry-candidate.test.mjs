import test from 'node:test';
import assert from 'node:assert/strict';
import {ResilientNearReadOnlyRpc} from '../src/rhea/resilient-readonly-rpc.ts';
import {NearRpcHttpError} from '../src/rhea/rpc.ts';
import {inspectStage34Candidate} from '../src/rhea/stage34-candidate-preflight.ts';
const L='6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa';
const C='4sUttxKK4gJpWr1mhfNddBt497ZiXsRMbTYvCeQQbjR2';
const P='9vafnXzrPYQ4ErDqt2triRkQJHdxtG7tfkyb24t5Ttrg';
const opts={lendingContract:'contract.main.burrow.near',configuredOracle:'priceoracle.near',
 pythOracle:'aggregate-oracle.near',borrowerAccountId:'godlike.near',
 expectedLendingCodeHash:L,expectedConfiguredOracleCodeHash:C,expectedPythCodeHash:P};
const source=()=>({async viewAccount(_id,block){return {blockHeight:String(block??221444000),codeHash:L};},
 async view(){throw Error('no mock side-effects');}});
const health=(risk=true)=>({mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
 status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',borrowerAccountId:'godlike.near',
 blockHeight:'221444000',lendingCodeHash:L,pythOracleCodeHash:P,priceConstructionMatchesCurrentSdk:true,
 deployedMetadataAndConfigObserved:true,sourceWasmReproduciblyMatched:false,
 pythEnabled:true,legacyOracleEnabled:false,candidatePositions:1,
 positions:[{positionId:'REGULAR',status:risk?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
 healthFactorBps:risk?'8908':'11000',legs:[{role:'borrowed',tokenId:'wrap.near'}]}],
 executionEnabled:false,maySign:false,mayBroadcast:false,profitVerified:false,transactionReplayVerified:false});
const entry=()=>({mode:'RHEA_STAGE25_MAINNET_LIQUIDATION_ENTRY_READ_ONLY',
 borrowerAccountId:'godlike.near',blockHeight:'221444000',lendingCodeHash:L,
 configuredOracleCodeHash:C,aggregatePriceReaderCodeHash:P,oracleConfigMatches:true,
 pythOracleEnabled:true,borrowerPositionCount:1,borrowerStillHasDebt:true,
 borrowerDebtAssets:['wrap.near'],blockers:['NO_LIVE_TRADE'],
 executionEnabled:false,mayBroadcast:false,transactionReplayVerified:false,realNetProfitVerified:false});
test('read-only RPC retries 429 and 503 with bounded budget, caches pinned views',async()=>{
 let n=0;const underlying={async viewAccount(){return {blockHeight:'8',codeHash:L};},
 async view(){n++;if(n<3)throw new NearRpcHttpError(n===1?429:503,'0');
 return {blockHeight:'8',value:{n:42}};}};
 const r=new ResilientNearReadOnlyRpc(underlying,{maxRetries:2,initialDelayMs:0,maxDelayMs:0});
 const one=await r.view('contract.main.burrow.near','get_config',{},8);
 one.value.n=100;
 const two=await r.view('contract.main.burrow.near','get_config',{},8);
 assert.equal(two.value.n,42);assert.equal(n,3);
 assert.equal(r.getStats().retried,2);assert.equal(r.getStats().cachedHits,1);
 assert.equal(r.getStats().networkAttempts,3);
});
test('unpinned calls are never cached and pinned concurrent duplicates coalesce',async()=>{
 let count=0;const r=new ResilientNearReadOnlyRpc({async viewAccount(){count++;return {blockHeight:'8',codeHash:L};},
 async view(){count++;return {blockHeight:'8',value:{good:true}};}},{maxRetries:0,initialDelayMs:0,maxDelayMs:0});
 await Promise.all([r.view('contract.main.burrow.near','get_config',{},8),
  r.view('contract.main.burrow.near','get_config',{},8)]);
 assert.equal(count,1);
 await r.view('contract.main.burrow.near','get_config');
 await r.view('contract.main.burrow.near','get_config');assert.equal(count,3);
});
test('invalid contract evidence, long rate limit and stale quote are never retried',async()=>{
 for(const error of [new NearRpcHttpError(400,null),
  new Error('STALE_OR_FUTURE_PYTH_PRICE'),new Error('inconsistent snapshot block')]){
  let count=0;const rpc=new ResilientNearReadOnlyRpc({
   async viewAccount(){count++;throw error;},
   async view(){throw Error('not called');}
  },{maxRetries:4,initialDelayMs:0,maxDelayMs:0});
  await assert.rejects(()=>rpc.viewAccount('contract.main.burrow.near',8));
  assert.equal(count,1);
 }
 const rate=new ResilientNearReadOnlyRpc({async viewAccount(){throw new NearRpcHttpError(429,'60');},
  async view(){throw Error('unexpected');}},{maxRetries:2,initialDelayMs:0,maxDelayMs:1000});
 await assert.rejects(()=>rate.viewAccount('contract.main.burrow.near'));
 assert.equal(rate.getStats().networkAttempts,1);
});
test('failed pinned cache entry must be removable for later safe retry',async()=>{
 let n=0;const r=new ResilientNearReadOnlyRpc({async viewAccount(){n++;if(n===1)throw Error('temporary schema issue');return {blockHeight:'9',codeHash:L};},
  async view(){throw Error('unused');}},{maxRetries:0});
 await assert.rejects(()=>r.viewAccount('contract.main.burrow.near',9));
 assert.equal((await r.viewAccount('contract.main.burrow.near',9)).blockHeight,'9');
 assert.equal(n,2);
});
test('same pinned block and risk evidence are paper-only',async()=>{
 let gotBlock=null;
 const result=await inspectStage34Candidate(source(),opts,async (_rpc,block)=>{
  gotBlock=block;return [health(true),entry()];
 });
 assert.equal(gotBlock,221444000);assert.equal(result.status,'PAPER_AT_RISK_UNAPPROVED');
 assert.equal(result.positionHealthBps[0].referenceHealthBps,'8908');
 assert.equal(result.mayInferReferenceLiquidatable,true);
 assert.equal(result.liquidationContractLogicVerified,false);
 assert.equal(result.liquidationRepaymentAtomicVerified,false);
 assert.equal(result.executionEnabled,false);assert.equal(result.mayBroadcast,false);
});
test('healthy recheck never marks candidate at risk',async()=>{
 const result=await inspectStage34Candidate(source(),opts,async()=>[health(false),entry()]);
 assert.equal(result.status,'PAPER_HEALTHY_UNAPPROVED');
 assert.equal(result.mayInferReferenceLiquidatable,false);
});
test('mismatched block, contract code, false execution flags are always rejected',async()=>{
 for(const pair of [[{...health(),blockHeight:'221444001'},entry()],
  [health(),{...entry(),configuredOracleCodeHash:P}],
  [{...health(),mayBroadcast:true},entry()],
  [health(),{...entry(),transactionReplayVerified:true}],
 ]){
  await assert.rejects(()=>inspectStage34Candidate(source(),opts,async()=>pair),
   /STAGE34_CROSS_PROBE_PINNED_STATE_CONTRADICTION/);
 }
});
test('different live debt asset set blocks eligibility rather than producing a trade',async()=>{
 const result=await inspectStage34Candidate(source(),opts,async()=>[health(),{
  ...entry(),borrowerDebtAssets:['not-wrap.near']
 }]);
 assert.equal(result.status,'BLOCKED_CONTRADICTORY_POSITION');
 assert.equal(result.mayInferReferenceLiquidatable,false);
});
test('a missing Pyth quote stays blocked with no health numbers',async()=>{
 const report=health();report.status='INCOMPLETE_ACTIVE_PYTH_VALUATION';
 report.positions[0].status='BLOCKED';report.positions[0].healthFactorBps=null;
 const result=await inspectStage34Candidate(source(),opts,async()=>[report,entry()]);
 assert.equal(result.status,'BLOCKED_INCOMPLETE_PRICE_EVIDENCE');
 assert.deepEqual(result.positionHealthBps,[]);
});
