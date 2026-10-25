import test from 'node:test';
import assert from 'node:assert/strict';
import {sweepIndexedDebtWithActivePyth,checkSweepCheckpoint} from '../src/rhea/full-active-pyth-sweep.ts';
import {NearRpcHttpError} from '../src/rhea/rpc.ts';

const H='2'.repeat(43),O='3'.repeat(43),count=45;
const f=(id)=>({accountId:'borrower'+id+'.near',classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
 positions:[{positionId:'REGULAR',debtAssetIds:['wrap.near'],collateralRecorded:true}]});
const source=()=>({mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',status:'COMPLETE_DEBT_INDEX_READ_ONLY',
 chain:'NEAR_MAINNET',sourceView:'get_accounts_all_positions_paged',
 blockHeight:'221436207',lendingCodeHash:H,totalAccounts:72782,scannedAccounts:72782,
 debtAccounts:count,debtPositions:count,shardCount:4,zeroSchemaErrors:true,
 completeSnapshot:true,findings:Array.from({length:count},(_,i)=>f(i)),
 executionEnabled:false,liquidationEligible:false,profitabilityVerified:false});
const options={startFinding:2,maxFindings:25,batchSize:10,concurrency:2,
 lendingContract:'contract.main.burrow.near',pythOracle:'aggregate-oracle.near',
 expectedLendingCodeHash:H,expectedPythOracleCodeHash:O,
 maxConfidenceBps:150,sanityMaxUsd:'10000000'};
const evaluation=(account,atRisk=false)=>({
 mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
 status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',borrowerAccountId:account,
 blockHeight:'221438700',candidatePositions:1,
 positions:[{positionId:'REGULAR',status:atRisk?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
  healthFactorBps:atRisk?'9012':'15678',legs:[{role:'borrowed',tokenId:'wrap.near'}]}],
 executionEnabled:false,maySign:false,mayBroadcast:false,
 transactionReplayVerified:false,profitVerified:false,
 sourceWasmReproduciblyMatched:false,priceConstructionMatchesCurrentSdk:true,
 deployedMetadataAndConfigObserved:true,
});
test('Stage32 completes exact bounded slice with checkpoints and no trade authority',async()=>{
 const checkpoints=[],called=[];
 const out=await sweepIndexedDebtWithActivePyth({},source(),options,undefined,async(cp,report)=>{
  checkpoints.push({cp:structuredClone(cp),remaining:report.remainingTotalDebtFindings});
 },async id=>{called.push(id);return evaluation(id,id==='borrower9.near');});
 assert.equal(out.processed,25);assert.equal(out.startFinding,2);assert.equal(out.nextFinding,27);
 assert.equal(out.paperAtRisk,1);assert.equal(out.paperHealthy,24);assert.equal(out.remainingTotalDebtFindings,18);
 assert.equal(out.completeSnapshotPriced,false);assert.equal(out.executionEnabled,false);
 assert.equal(out.mayBroadcast,false);assert.equal(out.liquidationEligibilityVerified,false);
 assert.deepEqual(checkpoints.map(x=>x.cp.nextFinding),[12,22,27]);
 assert.equal(new Set(called).size,25);
});
test('Stage32 resumes successfully without replaying previously completed borrowers',async()=>{
 let last;
 await assert.rejects(()=>sweepIndexedDebtWithActivePyth({},source(),options,undefined,async(cp)=>{
  last=cp;if(cp.nextFinding===12)throw Error('interrupted upload');
 },async id=>evaluation(id)),/interrupted upload/);
 assert.equal(last.nextFinding,12);
 const next=[];const out=await sweepIndexedDebtWithActivePyth({},source(),options,last,undefined,async id=>{
  next.push(id);return evaluation(id);
 });
 assert.equal(next.length,15);assert.equal(out.processed,25);assert.equal(out.nextFinding,27);
 assert.equal(out.blocked,0);
});
test('Stage32 fail closed on stale or corrupted checkpoint',async()=>{
 const original=await sweepIndexedDebtWithActivePyth({},source(),{...options,maxFindings:10},undefined,undefined,async id=>evaluation(id));
 const cp={...original};
 for(const changed of [
  {...cp,processed:8},{...cp,nextFinding:11},{...cp,maySign:true},
  {...cp,sourceBlockHeight:'1'}, {...cp,paperHealthy:0},
  {...cp,items:cp.items.map((x,i)=>i===0?{...x,borrowerAccountId:'forged.near'}:x)},
  {...cp,items:cp.items.map((x,i)=>i===0?{...x,executionEligible:true}:x)},
 ]){
  assert.throws(()=>checkSweepCheckpoint(source(),{...options,maxFindings:10},changed));
 }
});
test('Stage32 retains RPC failures as blocked instead of claiming scanned accounts are healthy',async()=>{
 const r=await sweepIndexedDebtWithActivePyth({},source(),{...options,maxFindings:5},undefined,undefined,
  async id=>{if(id==='borrower4.near')throw Error('hidden external auth failure');return evaluation(id);});
 assert.equal(r.processed,5);assert.equal(r.blocked,1);assert.equal(r.paperHealthy,4);
 assert.equal(JSON.stringify(r).includes('external auth'),false);
 assert.equal(r.items[2].classification,'BLOCKED_RPC');
});
test('Stage32 rejects an impossible source and oversized scanning windows',async()=>{
 for(const x of [{...source(),completeSnapshot:false},
  {...source(),debtAccounts:46},{...source(),liquidationEligible:true}]){
  await assert.rejects(()=>sweepIndexedDebtWithActivePyth({},x,options));
 }
 for(const opts of [{maxFindings:321},{batchSize:21},{concurrency:4},{startFinding:46}]){
  await assert.rejects(()=>sweepIndexedDebtWithActivePyth({},source(),{...options,...opts}));
 }
});
test('workflow never signs and only uses the verified full-scan artifact',async()=>{
 const {readFile}=await import('node:fs/promises');
 const y=await readFile(new URL('../.github/workflows/rhea-stage32-resumable-pyth-sweep.yml',import.meta.url),'utf8');
 assert.ok(y.includes('rhea-full-paged-verified-market'));assert.ok(y.includes('EXECUTION_ENABLED: \'false\''));
 assert.ok(y.includes('stage32-reprice-checkpoint'));assert.ok(!y.includes('broadcast_tx'));
});

test('Stage66 recovers a genuine first-pass RPC failure before committing cursor',async()=>{
 const calls=new Map(),sleeps=[];
 const out=await sweepIndexedDebtWithActivePyth({},source(),
  {...options,maxFindings:5,batchSize:5},undefined,undefined,
  async id=>{
   const n=(calls.get(id)??0)+1;calls.set(id,n);
   if(id==='borrower4.near'&&n===1)throw new NearRpcHttpError(429,'0');
   return evaluation(id,id==='borrower4.near');
  },async ms=>{sleeps.push(ms);});
 assert.equal(out.processed,5);
 assert.equal(out.paperAtRisk,1);
 assert.equal(out.paperHealthy,4);
 assert.equal(out.blocked,0);
 assert.equal(out.items[2].borrowerAccountId,'borrower4.near');
 assert.equal(out.items[2].classification,'PAPER_AT_RISK_UNAPPROVED');
 assert.equal(out.items[2].executionEligible,false);
 assert.equal(out.profitVerified,false);
 assert.equal(calls.get('borrower4.near'),2);
 assert.deepEqual(sleeps,[1500]);
 checkSweepCheckpoint(source(),{...options,maxFindings:5,batchSize:5},out);
});

test('Stage66 caps retry volume and never clears persistent unknown health',async()=>{
 const calls=new Map();
 const out=await sweepIndexedDebtWithActivePyth({},source(),
  {...options,maxFindings:6,batchSize:6},undefined,undefined,
  async id=>{calls.set(id,(calls.get(id)??0)+1);throw new NearRpcHttpError(429,'0');},
  async()=>{});
 assert.equal(out.processed,6);
 assert.equal(out.blocked,6);
 assert.equal(out.paperHealthy,0);
 assert.equal(out.paperAtRisk,0);
 assert.equal([...calls.values()].reduce((a,b)=>a+b,0),12);
 assert.equal(out.completeSnapshotPriced,false);
 assert.equal(out.maySign,false);
 assert.equal(out.mayBroadcast,false);
});

test('Stage67 skips retries on permanent schema failures and does not mark them healthy',async()=>{
 const calls=new Map(),waits=[];
 const out=await sweepIndexedDebtWithActivePyth({},source(),
  {...options,maxFindings:5,batchSize:5},undefined,undefined,
  async id=>{calls.set(id,(calls.get(id)??0)+1);throw Error('invalid oracle asset schema');},
  async ms=>waits.push(ms));
 assert.equal(out.processed,5);
 assert.equal(out.blocked,5);
 assert.equal(out.paperHealthy,0);
 assert.equal(out.paperAtRisk,0);
 assert.deepEqual([...calls.values()],[1,1,1,1,1]);
 assert.deepEqual(waits,[]);
 assert.ok(out.items.every(x=>x.reason==='RPC_OR_ORACLE_READ_FAILED'));
 assert.equal(out.executionEnabled,false);
 assert.equal(out.mayBroadcast,false);
});

test('Stage67 applies bounded cooldown on a transient error burst and keeps every unresolved row blocked',async()=>{
 const delays=[],calls=new Map();
 const out=await sweepIndexedDebtWithActivePyth({},source(),
  {...options,maxFindings:12,batchSize:12},undefined,undefined,
  async id=>{calls.set(id,(calls.get(id)??0)+1);throw new NearRpcHttpError(429,'0');},
  async ms=>delays.push(ms));
 assert.equal(out.processed,12);
 assert.equal(out.blocked,12);
 assert.equal(out.paperHealthy,0);
 assert.equal(out.paperAtRisk,0);
 assert.equal(delays.filter(x=>x===12000).length,1);
 assert.equal(delays.filter(x=>x===1500).length,8);
 assert.equal([...calls.values()].reduce((n,k)=>n+k,0),20);
 assert.ok(out.items.every(x=>x.reason==='RPC_TRANSIENT_RATE_LIMIT_OR_TIMEOUT'));
 checkSweepCheckpoint(source(),{...options,maxFindings:12,batchSize:12},out);
});
