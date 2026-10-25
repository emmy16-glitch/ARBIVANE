import test from 'node:test';
import assert from 'node:assert/strict';
import {NearRpcHttpError} from '../src/rhea/rpc.ts';
import {qualifyStage38Candidates} from '../src/rhea/stage38-live-candidate-pipeline.ts';
const HASH='2'.repeat(43),ORACLE='3'.repeat(43),START=332,DEBT=800;
const source=()=>({mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',status:'COMPLETE_DEBT_INDEX_READ_ONLY',
 chain:'NEAR_MAINNET',blockHeight:'221436207',lendingCodeHash:HASH,
 totalAccounts:72782,scannedAccounts:72782,debtAccounts:DEBT,debtPositions:DEBT,
 shardCount:4,completeSnapshot:true,zeroSchemaErrors:true,executionEnabled:false,
 liquidationEligible:false,profitabilityVerified:false,
 findings:Array.from({length:DEBT},(_,i)=>({accountId:'borrower'+i+'.near',
  classification:'DEBT_SHARES_DISCOVERED_UNVALUED',positions:[{positionId:'REGULAR',
   debtAssetIds:['wrap.near'],collateralRecorded:true}]}))});
const options={startFinding:START,maxFindings:80,concurrency:2,maxRiskCandidates:12,
 lendingContract:'contract.main.burrow.near',pythOracle:'aggregate-oracle.near',
 expectedLendingCodeHash:HASH,expectedPythOracleCodeHash:ORACLE,
 minimumPaperGrossUsdE27:'1000000000000000000000000',
 maxConfidenceBps:150,sanityMaxUsd:'10000000'};
function stage32(){
 const items=Array.from({length:80},(_,i)=>({
  borrowerAccountId:'borrower'+(START+i)+'.near',sourcePositionIds:['REGULAR'],
  classification:i===3||i===6?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
  freshBlockHeight:'221440112',freshHealthBps:i===3||i===6?'8900':'12000',
  paperAtRiskPositions:i===3||i===6?1:0,paperHealthyPositions:i===3||i===6?0:1,
  reason:null,executionEligible:false,tradeProfitVerified:false,
 }));
 return {mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP',version:1,chain:'NEAR_MAINNET',
  sourceBlockHeight:'221436207',sourceCodeHash:HASH,
  sourceTotalAccounts:72782,sourceDebtAccounts:DEBT,
  startFinding:START,targetEndFinding:START+80,nextFinding:START+80,
  processed:80,paperAtRisk:2,paperHealthy:78,noDebtNow:0,blocked:0,
  items,executionEnabled:false,maySign:false,mayBroadcast:false,
  liquidationEligibilityVerified:false,profitVerified:false};
}
const ok=id=>({mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',borrowerAccountId:id,blockHeight:'221441990',
 status:'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE',referenceRulesPass:true,
 positionId:'REGULAR',lendingCodeHash:HASH,pythOracleCodeHash:ORACLE,
 referenceInitialHealthBps:'8900',referenceInitialDiscountE27:'40000000000000000000000000',
 repay:{tokenId:'wrap.near',amountLendingInternalAtomic:'1230000000000000000',
  referenceUsdE27:'2000000000000000000000000000',
  shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false},
 seize:{tokenId:'usdc.near',amountLendingInternalAtomic:'2200000000000000000',
  referenceUsdE27:'2500000000000000000000000000',
  shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false},
 paperGrossUsdE27:'500000000000000000000000000',
 contractRouteParityVerified:false,rawTokenDenominationsVerified:false,sandboxStateReplaySucceeded:false,
 gasAndSwapNetProfitVerified:false,walletCapitalVerified:false,mainnetWalletApproved:false,
 executionEnabled:false,maySign:false,mayBroadcast:false});
test('only ACTUAL Stage32 at-risk index findings get fresh source sizing',async()=>{
 const called=[];const result=await qualifyStage38Candidates({},source(),stage32(),options,async id=>{
  called.push(id);
  return id==='borrower335.near'?ok(id):{...ok(id),
   status:'NO_SAFE_SOURCE_SCENARIO',referenceRulesPass:false,
   repay:null,seize:null};
 });
 assert.deepEqual(called,['borrower335.near','borrower338.near']);
 assert.equal(result.reviewed,80);assert.equal(result.refreshed,2);
 assert.equal(result.positiveSourcePlans,1);assert.equal(result.sandboxPlanReady,true);
 assert.equal(result.bestProposal.borrowerAccountId,'borrower335.near');
 assert.equal(result.noEligibleMainnetTrades,true);
 assert.equal(result.mainnetExecutionEnabled,false);assert.equal(result.netProfitVerified,false);
});
test('zero safe source plans means no Sandbox mutation can be attempted',async()=>{
 const result=await qualifyStage38Candidates({},source(),stage32(),options,
  async id=>({...ok(id),status:'NO_SAFE_SOURCE_SCENARIO',referenceRulesPass:false,
   repay:null,seize:null}));
 assert.equal(result.sandboxPlanReady,false);assert.equal(result.bestProposal,null);
 assert.equal(result.positiveSourcePlans,0);
 assert.equal(result.status,'NO_EXECUTABLE_SOURCE_REFERENCE');
});
test('candidate Oracle failures remain blocked and never leak secrets',async()=>{
 const result=await qualifyStage38Candidates({},source(),stage32(),options,
  async()=>{throw Error('NEAR RPC HTTP 429 secret endpoint');});
 assert.equal(result.failedFreshReads,2);
 assert.ok(result.rows.every(x=>x.status==='BLOCKED_FRESH_READ'));
 assert.equal(JSON.stringify(result).includes('secret endpoint'),false);
});
test('reject partial, forged and cross-source historic checkpoints before RPC',async()=>{
 for(const fake of [
  {...stage32(),nextFinding:411},
  {...stage32(),sourceCodeHash:ORACLE},
  {...stage32(),items:stage32().items.map((x,i)=>i===3?{...x,borrowerAccountId:'other.near'}:x)},
  {...stage32(),mayBroadcast:true},
  {...stage32(),paperAtRisk:0},
 ]){
  await assert.rejects(()=>qualifyStage38Candidates({},source(),fake,options,
   async()=>{throw Error('NETWORK_MUST_NOT_BE_ACCESSED');}));
 }
});
test('bogus successful or wallet-authorized sizing cannot enter Sandbox',async()=>{
 const result=await qualifyStage38Candidates({},source(),stage32(),options,
  async id=>({...ok(id),mainnetWalletApproved:true}));
 assert.equal(result.sandboxPlanReady,false);
 assert.equal(result.failedFreshReads,2);
});
test('cannot silently exclude an oversized risk cohort',async()=>{
 const cp=stage32();cp.items=cp.items.map(x=>({...x,classification:'PAPER_AT_RISK_UNAPPROVED'}));
 cp.paperAtRisk=80;cp.paperHealthy=0;
 const result=await qualifyStage38Candidates({},source(),cp,options,async()=>{
  throw Error('NETWORK_MUST_NOT_BE_ACCESSED');
 });
 assert.equal(result.status,'BLOCKED_CANDIDATE_LIMIT');
 assert.equal(result.refreshed,0);
 assert.equal(result.sandboxPlanReady,false);
});

test('Stage58 refreshes ALL 80 authentic paper-at-risk borrowers, not just the first twelve',async()=>{
 const cp=stage32();
 cp.items=cp.items.map(x=>({...x,classification:'PAPER_AT_RISK_UNAPPROVED'}));
 cp.paperAtRisk=80;cp.paperHealthy=0;
 let active=0,highWater=0;
 const called=[];
 const result=await qualifyStage38Candidates({},source(),cp,
  {...options,maxRiskCandidates:80,concurrency:2},async id=>{
   active++;highWater=Math.max(highWater,active);called.push(id);
   try{
    await Promise.resolve();
    return {...ok(id),status:'NO_SAFE_SOURCE_SCENARIO',referenceRulesPass:false,
     repay:null,seize:null};
   }finally{active--;}
  });
 assert.equal(result.status,'NO_EXECUTABLE_SOURCE_REFERENCE');
 assert.equal(result.refreshed,80);
 assert.equal(result.paperAtRiskFromPreviousScan,80);
 assert.equal(result.rows.length,80);
 assert.equal(result.failedFreshReads,0);
 assert.equal(result.positiveSourcePlans,0);
 assert.equal(result.sandboxPlanReady,false);
 assert.equal(result.bestProposal,null);
 assert.equal(result.noEligibleMainnetTrades,true);
 assert.equal(result.mayBroadcastMainnet,false);
 assert.equal(highWater,2);
 assert.deepEqual(called,cp.items.map(x=>x.borrowerAccountId));
});
test('Stage58 still blocks a caller that explicitly asks to discard some of the risk cohort',async()=>{
 const cp=stage32();
 cp.items=cp.items.map(x=>({...x,classification:'PAPER_AT_RISK_UNAPPROVED'}));
 cp.paperAtRisk=80;cp.paperHealthy=0;
 const result=await qualifyStage38Candidates({},source(),cp,
  {...options,maxRiskCandidates:79},async()=>{throw Error('MUST_NOT_CALL');});
 assert.equal(result.status,'BLOCKED_CANDIDATE_LIMIT');
 assert.equal(result.refreshed,0);
 assert.equal(result.sandboxPlanReady,false);
});
test('Stage58 live CLI chooses full-shard exhaustive risk limit without enabling mainnet',async()=>{
 const {readFile}=await import('node:fs/promises');
 const cli=await readFile(new URL('../src/rhea/stage38-live-candidate-cli.ts',import.meta.url),'utf8');
 const wf=await readFile(new URL('../.github/workflows/rhea-stage42-reconciled-continuation.yml',import.meta.url),'utf8');
 assert.ok(cli.includes('maxRiskCandidates:80,concurrency:2'));
 assert.ok(wf.includes("'src/rhea/stage38-live-candidate-cli.ts'"));
 assert.ok(wf.includes("'src/rhea/stage38-live-candidate-pipeline.ts'"));
 assert.ok(wf.includes('STAGE37_ALLOW_SANDBOX_MUTATION=true'));
 assert.ok(wf.includes('STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING=true'));
 assert.ok(!wf.includes('broadcast_tx'));
});

test('Stage60 recovers two genuinely at-risk borrowers after bounded sequential 429 retries',async()=>{
 const attempts=new Map(),delays=[];
 const result=await qualifyStage38Candidates({},source(),stage32(),options,
  async id=>{
   const count=(attempts.get(id)??0)+1;attempts.set(id,count);
   if(count===1)throw new NearRpcHttpError(429,'0');
   return id==='borrower335.near'?ok(id):{...ok(id),
    status:'NO_SAFE_SOURCE_SCENARIO',referenceRulesPass:false,repay:null,seize:null};
  },async ms=>{delays.push(ms);});
 assert.deepEqual([...attempts.values()],[2,2]);
 assert.deepEqual(delays,[1500,1500]);
 assert.equal(result.boundedRecoveryAttempts,2);
 assert.equal(result.recoveredRateLimitedFindings,2);
 assert.equal(result.failedFreshReads,0);
 assert.equal(result.positiveSourcePlans,1);
 assert.equal(result.bestProposal.borrowerAccountId,'borrower335.near');
 assert.equal(result.sandboxPlanReady,true);
 assert.equal(result.maySignMainnet,false);
 assert.equal(result.mayBroadcastMainnet,false);
 assert.equal(result.netProfitVerified,false);
});
test('Stage60 honors long provider Retry-After and never retries invalid source evidence',async()=>{
 const calls=[];const delays=[];
 const result=await qualifyStage38Candidates({},source(),stage32(),options,
  async id=>{calls.push(id);throw new NearRpcHttpError(429,'90');},
  async ms=>{delays.push(ms);});
 assert.equal(result.failedFreshReads,2);
 assert.equal(result.boundedRecoveryAttempts,0);
 assert.equal(result.recoveredRateLimitedFindings,0);
 assert.equal(calls.length,2);
 assert.deepEqual(delays,[]);
 assert.equal(result.sandboxPlanReady,false);
});
test('Stage60 caps re-attempts and does not promote permanent 429 failures',async()=>{
 let calls=0;const delays=[];
 const result=await qualifyStage38Candidates({},source(),stage32(),options,
  async()=>{calls++;throw new NearRpcHttpError(429,'0');},
  async ms=>{delays.push(ms);});
 assert.equal(calls,6);
 assert.equal(result.boundedRecoveryAttempts,4);
 assert.equal(result.recoveredRateLimitedFindings,0);
 assert.deepEqual(delays,[1500,3000,1500,3000]);
 assert.equal(result.positiveSourcePlans,0);
 assert.equal(result.sandboxPlanReady,false);
 assert.equal(result.mayBroadcastMainnet,false);
});
