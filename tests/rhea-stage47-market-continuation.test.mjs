import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planStage47Continuation} from '../scripts/stage47-next-market-window.mjs';

function report(changes={}){
 return {
  mode:'RHEA_STAGE42_VERIFIED_BORROWER_WINDOW',
  chain:'NEAR_MAINNET',status:'WINDOW_RECONCILED_WITH_BLOCKED_READS',
  everyHistoricalFindingVisited:true,allCurrentHealthVerified:false,
  liquidationEligibilityVerified:false,positiveNetProfitVerified:false,
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  shardsReconciled:4,accountsVisited:320,baseCursor:1292,endCursor:1612,
  historicalSourceDebtAccounts:7801,paperAtRisk:4,paperHealthy:303,
  noDebtNow:5,blockedInitialReads:8,failedRiskRefreshes:2,
  sourceReferencePlansForSandboxOnly:0,
  blockers:['BLOCKED_ORACLE_OR_RPC_READS_REMAIN_UNRESOLVED'],...changes
 };
}
const plan=(p=report(),opts={expectedBaseCursor:1292,followupsRemaining:3})=>
 planStage47Continuation(p,opts);

test('Stage47 advances exactly one real historical window and decreases finite budget',()=>{
 const r=plan();
 assert.equal(r.dispatch,true);
 assert.equal(r.previousCursor,1292);
 assert.equal(r.verifiedEndCursor,1612);
 assert.equal(r.nextCursor,1612);
 assert.equal(r.followupsRemaining,2);
 assert.equal(r.blockedInitialReads,8);
 assert.equal(r.mainnetExecutionEnabled,false);
 assert.equal(r.positiveNetProfitVerified,false);
 assert.equal(r.liquidationsExecutedByThisPlanner,0);
});
test('finite continuation budget stops cleanly and never loops',()=>{
 const r=plan(report(),{expectedBaseCursor:1292,followupsRemaining:0});
 assert.equal(r.dispatch,false);assert.equal(r.nextCursor,null);
 assert.equal(r.reason,'AUTOMATIC_CONTINUATION_BUDGET_EXHAUSTED');
});
test('Stage59 continues past source-positive candidates after the separately gated Sandbox evidence',()=>{
 const r=plan(report({sourceReferencePlansForSandboxOnly:1}));
 assert.equal(r.dispatch,true);
 assert.equal(r.reason,'CONTINUE_AFTER_SOURCE_PLAN_SANDBOX_EVIDENCE');
 assert.equal(r.continuesAfterSourcePlanEvidence,true);
 assert.equal(r.sourcePlansForSandboxOnly,1);
 assert.equal(r.followupsRemaining,2);
 assert.equal(r.mainnetExecutionEnabled,false);
 assert.equal(r.maySignMainnet,false);
});
test('does not skip end-of-registry partial window',()=>{
 const r=plan(report({baseCursor:7481,endCursor:7801}),{expectedBaseCursor:7481,followupsRemaining:3});
 assert.equal(r.dispatch,false);assert.equal(r.reason,'LESS_THAN_ONE_FULL_WINDOW_REMAINS');
});
test('rejects forged, duplicate or incomplete historical windows',()=>{
 for(const changes of [
  {endCursor:1611},{baseCursor:1300},{shardsReconciled:3},
  {accountsVisited:319},{everyHistoricalFindingVisited:false},
  {maySignMainnet:true},{positiveNetProfitVerified:true},
  {paperHealthy:302},{status:'EXECUTED_MAINNET'},
  {allCurrentHealthVerified:true},{liquidationEligibilityVerified:true},
  {historicalSourceDebtAccounts:1500},{sourceReferencePlansForSandboxOnly:-1}
 ]) assert.throws(()=>plan(report(changes)),/STAGE47_UNTRUSTED/);
 assert.throws(()=>plan(report(),{expectedBaseCursor:972,followupsRemaining:3}),/STAGE47_UNTRUSTED/);
 assert.throws(()=>plan(report(),{expectedBaseCursor:1292,followupsRemaining:24}),/STAGE47_UNTRUSTED/);
});
test('workflow has bounded authenticated dispatch, archived proof and no mainnet signer',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage42-reconciled-continuation.yml',import.meta.url),'utf8');
 assert.match(workflow,/default: '1292'/);
 assert.match(workflow,/followups_remaining/);
 assert.match(workflow,/stage47-next-market-window-cli.mjs/);
 assert.match(workflow,/stage47-next-window.json/);
 assert.match(workflow,/actions: write/);
 assert.match(workflow,/gh api --method POST/);
 assert.match(workflow,/STAGE37_ALLOW_SANDBOX_MUTATION=true/);
 assert.match(workflow,/EXECUTION_ENABLED: 'false'/);
 assert.doesNotMatch(workflow,/NEAR_PRIVATE_KEY:/);
});

test('Stage59 can traverse all full pinned 320-account windows with finite 19-followup budget',()=>{
 // For 7,801 authentic historical debt findings, 20 full windows beginning
 // at the existing verified cursor 1292 visit 6,400 distinct accounts.
 // The final 109 findings are NOT silently called scanned.
 let cursor=1292,budget=19,dispatches=0,totalVisited=0,last;
 while(true){
  const input=report({
   baseCursor:cursor,endCursor:cursor+320,
   paperAtRisk:0,paperHealthy:320,noDebtNow:0,blockedInitialReads:0,
   failedRiskRefreshes:0,sourceReferencePlansForSandboxOnly:0
  });
  const r=plan(input,{expectedBaseCursor:cursor,followupsRemaining:budget});
  totalVisited+=320;last=r;
  if(!r.dispatch)break;
  assert.equal(r.nextCursor,cursor+320);
  assert.equal(r.followupsRemaining,budget-1);
  cursor=r.nextCursor;budget=r.followupsRemaining;dispatches++;
  assert.ok(dispatches<=19,'unbounded continuation');
 }
 assert.equal(totalVisited,6400);
 assert.equal(dispatches,19);
 assert.equal(last.verifiedEndCursor,7692);
 assert.equal(last.remainingHistoricalFindings,109);
 assert.equal(last.tailFindingsBeyondFullWindows,109);
 assert.equal(last.fullWindowsRemaining,0);
 assert.equal(last.reason,'LESS_THAN_ONE_FULL_WINDOW_REMAINS');
 assert.equal(last.dispatch,false);
 assert.equal(last.mayBroadcastMainnet,false);
});
test('Stage59 source-positive terminal window cannot skip the last full or remaining partial accounts',()=>{
 const last=report({
  baseCursor:7372,endCursor:7692,
  sourceReferencePlansForSandboxOnly:2,
  paperAtRisk:2,paperHealthy:318,noDebtNow:0,blockedInitialReads:0
 });
 const out=plan(last,{expectedBaseCursor:7372,followupsRemaining:3});
 assert.equal(out.dispatch,false);
 assert.equal(out.reason,'LESS_THAN_ONE_FULL_WINDOW_REMAINS');
 assert.equal(out.continuesAfterSourcePlanEvidence,true);
 assert.equal(out.remainingHistoricalFindings,109);
 assert.equal(out.tailFindingsBeyondFullWindows,109);
 assert.equal(out.mainnetExecutionEnabled,false);
});
test('Stage59 GitHub Action uses finite extended budget and restricts dispatch input and signing',async()=>{
 const w=await readFile(new URL('../.github/workflows/rhea-stage42-reconciled-continuation.yml',import.meta.url),'utf8');
 assert.ok(w.includes('STAGE47_FOLLOWUPS_REMAINING: ${{ inputs.followups_remaining }}'));
 assert.ok(w.includes('tailFindingsBeyondFullWindows'));
 assert.ok(w.includes('sourcePlansForSandboxOnly'));
 assert.ok(w.includes('2[0-3]'));
 assert.ok(w.includes('NEAR_WORKSPACES_NETWORK=sandbox'));
 assert.ok(!w.includes('broadcast_tx'));
 assert.ok(!w.includes('NEAR_PRIVATE_KEY:'));
});

test('Stage63 prevents code pushes from launching duplicate fixed-cursor scans',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage42-reconciled-continuation.yml',import.meta.url),'utf8');
 const block=workflow.match(/^concurrency:\n((?: {2}[^\n]*\n|  #.*\n)*)/m)?.[1]??'';
 assert.match(block,/^  group: arbivane-stage42-\$\{\{ github\.ref \}\}$/m);
 assert.match(block,/^  cancel-in-progress: false$/m);
 assert.ok(!block.includes('cancel-in-progress: true'));
 assert.doesNotMatch(workflow,/^  push:$/m);
 assert.ok(!block.includes('queue:'));
 assert.ok(workflow.includes('STAGE47_FOLLOWUPS_REMAINING: ${{ inputs.followups_remaining }}'));
 assert.ok(workflow.includes('stage47-next-window.json'));
 assert.ok(workflow.includes('boundedRecoveryAttempts,recoveredRateLimitedFindings'));
 assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(!workflow.includes('NEAR_PRIVATE_KEY:'));
 assert.ok(!workflow.includes('broadcast_tx'));
});
