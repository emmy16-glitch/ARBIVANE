import test from 'node:test';
import assert from 'node:assert/strict';
import {NearRpcHttpError} from '../src/rhea/rpc.ts';
import {selectStage39RateLimitedCandidates,retryStage39Candidates} from '../src/rhea/stage39-rate-limited-risk-retry.ts';
const H='2'.repeat(43),P='3'.repeat(43),total=652;
const F=i=>({accountId:'borrower'+i+'.near',classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
 positions:[{positionId:'REGULAR',debtAssetIds:['wrap.near'],collateralRecorded:true}]});
const source=()=>({mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',chain:'NEAR_MAINNET',
 status:'COMPLETE_DEBT_INDEX_READ_ONLY',blockHeight:'221436207',lendingCodeHash:H,
 totalAccounts:72782,scannedAccounts:72782,debtAccounts:total,debtPositions:total,
 shardCount:4,zeroSchemaErrors:true,completeSnapshot:true,
 findings:Array.from({length:total},(_,i)=>F(i)),
 executionEnabled:false,liquidationEligible:false,profitabilityVerified:false});
const opts={baseCursor:332,maxRetries:2,maxRetryDelayMs:60000,betweenAccountsMs:4500,maxTargetAccounts:12,
 maxRiskCandidates:12,concurrency:1,lendingContract:'contract.main.burrow.near',
 pythOracle:'aggregate-oracle.near',expectedLendingCodeHash:H,expectedPythOracleCodeHash:P,
 maxConfidenceBps:150,sanityMaxUsd:'10000000',
 minimumPaperGrossUsdE27:'1000000000000000000000000'};
function shard(i){
 const start=332+i*80,atRisk=(i===1||i===3)?[3,15]:[];
 const items=Array.from({length:80},(_,n)=>({
  borrowerAccountId:'borrower'+(start+n)+'.near',sourcePositionIds:['REGULAR'],
  classification:atRisk.includes(n)?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
  freshBlockHeight:'221447441',freshHealthBps:atRisk.includes(n)?'8900':'11000',
  paperAtRiskPositions:atRisk.includes(n)?1:0,paperHealthyPositions:atRisk.includes(n)?0:1,
  reason:null,executionEligible:false,tradeProfitVerified:false,
 }));
 return {version:1,mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP',chain:'NEAR_MAINNET',
  sourceBlockHeight:'221436207',sourceCodeHash:H,sourceTotalAccounts:72782,sourceDebtAccounts:total,
  startFinding:start,targetEndFinding:start+80,nextFinding:start+80,processed:80,
  paperAtRisk:atRisk.length,paperHealthy:80-atRisk.length,noDebtNow:0,blocked:0,
  items,executionEnabled:false,maySign:false,mayBroadcast:false,
  liquidationEligibilityVerified:false,profitVerified:false};
}
const sweeps=()=>[0,1,2,3].map(shard);
function old(cp){
 const risks=cp.items.map((x,n)=>({x,index:cp.startFinding+n}))
  .filter(v=>v.x.classification==='PAPER_AT_RISK_UNAPPROVED');
 return {mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX',chain:'NEAR_MAINNET',
  status:'NO_EXECUTABLE_SOURCE_REFERENCE',sourceBlockHeight:'221436207',
  sourceDebtAccounts:total,startFinding:cp.startFinding,nextFinding:cp.nextFinding,
  reviewed:80,paperAtRiskFromPreviousScan:risks.length,positiveSourcePlans:0,
  refreshed:risks.length,failedFreshReads:risks.length,sandboxPlanReady:false,
  noEligibleMainnetTrades:true,mainnetExecutionEnabled:false,maySignMainnet:false,
  mayBroadcastMainnet:false,sandboxReplaySucceeded:false,liquidationRuleParityVerified:false,
  netProfitVerified:false,walletApproved:false,bestProposal:null,
  rows:risks.map(v=>({borrowerAccountId:v.x.borrowerAccountId,historicalFindingIndex:v.index,
   status:'BLOCKED_FRESH_READ',observationBlockHeight:null,
   reasonCode:'HTTP_RATE_LIMIT_OR_TIMEOUT',referenceInitialHealthBps:null,
   paperGrossUsdE27:null,executionEligible:false,netProfitVerified:false}))};
}
const prior=()=>sweeps().map(old);
function plan(id,positive=false){
 return {mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
  chain:'NEAR_MAINNET',borrowerAccountId:id,blockHeight:'221450000',
  lendingCodeHash:H,pythOracleCodeHash:P,
  status:positive?'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE':'NO_SAFE_SOURCE_SCENARIO',
  referenceRulesPass:positive,positionId:positive?'REGULAR':null,
  paperGrossUsdE27:positive?'2000000000000000000000000':null,
  referenceInitialHealthBps:'8900',
  repay:positive?{tokenId:'wrap.near',amountLendingInternalAtomic:'100000000000000000000',
   shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false}:null,
  seize:positive?{tokenId:'meta-pool.near',amountLendingInternalAtomic:'110000000000000000000',
   shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false}:null,
  contractRouteParityVerified:false,rawTokenDenominationsVerified:false,
  sandboxStateReplaySucceeded:false,gasAndSwapNetProfitVerified:false,
  walletCapitalVerified:false,mainnetWalletApproved:false,
  executionEnabled:false,maySign:false,mayBroadcast:false};
}
test('provenance selects four exact historical candidates instead of guessed names',()=>{
 const out=selectStage39RateLimitedCandidates(source(),sweeps(),prior(),opts);
 assert.deepEqual(out.map(x=>x.findingIndex),[415,427,575,587]);
 assert.equal(new Set(out.map(x=>x.borrowerAccountId)).size,4);
});
test('bounded rate limit backoff retries only transient failures then rejects unsafe source trades',async()=>{
 let calls=0;const delays=[];
 const out=await retryStage39Candidates({},source(),sweeps(),prior(),opts,
  async id=>{calls++;if(calls<=2)throw new NearRpcHttpError(429,'0');return plan(id);},
  async ms=>{delays.push(ms);});
 assert.equal(out.attemptedFresh,4);assert.equal(out.noSafeScenario,4);
 assert.equal(out.positiveSourcePlans,0);assert.equal(out.sandboxPlanReady,false);
 assert.equal(out.accountResults[0].attempts,3);
 assert.equal(out.mainnetExecutionEnabled,false);assert.equal(out.mayBroadcastMainnet,false);
 assert.ok(delays.includes(1500));assert.ok(delays.includes(3000));
 assert.equal(out.accountResults[0].executableMainnet,false);
});
test('valid positive reference is ONLY a sandbox-ready scenario and never mainnet authority',async()=>{
 const out=await retryStage39Candidates({},source(),sweeps(),prior(),{...opts,betweenAccountsMs:0},
  async id=>plan(id,true),async()=>{});
 assert.equal(out.positiveSourcePlans,4);
 assert.equal(out.sandboxPlanReady,true);assert.equal(out.bestProposal.borrowerAccountId,'borrower415.near');
 assert.equal(out.status,'SANDBOX_REFERENCE_READY_ONLY');assert.equal(out.profitVerified,false);
 assert.equal(out.sandboxReplayed,false);assert.equal(out.maySignMainnet,false);
});
test('reject forged prior Stage38 results before ANY network call',async()=>{
 const ps=prior();
 for(const fake of [
  ps.map((x,i)=>i===1?{...x,sandboxPlanReady:true}:x),
  ps.map((x,i)=>i===3?{...x,rows:[{...x.rows[0],borrowerAccountId:'faker.near'},x.rows[1]]}:x),
  ps.map((x,i)=>i===1?{...x,rows:x.rows.map((y,j)=>j===0?{...y,reasonCode:'POSITION_DATA_OR_REFERENCE_MATH'}:y)}:x),
  ps.slice(0,3),
 ]){
  await assert.rejects(()=>retryStage39Candidates({},source(),sweeps(),fake,opts,
   async()=>{throw Error('SHOULD_NOT_TOUCH_NETWORK');},async()=>{}));
 }
 const changed=sweeps();changed[0].sourceCodeHash=P;
 await assert.rejects(()=>retryStage39Candidates({},source(),changed,ps,opts,
  async()=>{throw Error('SHOULD_NOT_TOUCH_NETWORK');},async()=>{}));
});
test('non-transient errors never retry and oversized Retry-After does not hammer the RPC',async()=>{
 const delays=[];
 const result=await retryStage39Candidates({},source(),sweeps(),prior(),
  {...opts,maxRetries:4,maxRetryDelayMs:2000,betweenAccountsMs:0},
  async()=>{throw new NearRpcHttpError(429,'60');},
  async ms=>{delays.push(ms);});
 assert.equal(result.blockedFresh,4);
 assert.deepEqual(result.accountResults.map(x=>x.attempts),[1,1,1,1]);
 assert.equal(delays.length,0);
});
test('live workflow reads actual git action artifacts and does not sign mainnet',async()=>{
 const {readFile}=await import('node:fs/promises');
 const w=await readFile(new URL('../.github/workflows/rhea-stage39-risk-retry-to-sandbox.yml',import.meta.url),'utf8');
 assert.ok(w.includes('40136172144'));assert.ok(w.includes('40128285853'));
 assert.ok(w.includes('STAGE37_ALLOW_SANDBOX_MUTATION'));
 assert.ok(w.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(!w.includes('broadcast_tx'));assert.ok(!w.includes('NEAR_PRIVATE_KEY'));
});
