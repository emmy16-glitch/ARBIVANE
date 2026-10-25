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
test('stops for a source-positive candidate needing local Sandbox review',()=>{
 const r=plan(report({sourceReferencePlansForSandboxOnly:1}));
 assert.equal(r.dispatch,false);assert.equal(r.reason,'SOURCE_PLAN_REQUIRES_SANDBOX_REVIEW');
 assert.equal(r.mainnetExecutionEnabled,false);
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
 assert.throws(()=>plan(report(),{expectedBaseCursor:1292,followupsRemaining:25}),/STAGE47_UNTRUSTED/);
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

test('Stage59 allows 20 authenticated continuation steps, then stops at the historical source bound',()=>{
 let base=1292,remaining=20,count=0;
 while(true){
  const row=report({baseCursor:base,endCursor:base+320});
  const next=plan(row,{expectedBaseCursor:base,followupsRemaining:remaining});
  count++;
  assert.equal(next.positiveNetProfitVerified,false);
  assert.equal(next.mainnetExecutionEnabled,false);
  assert.equal(next.maySignMainnet,false);
  assert.equal(next.mayBroadcastMainnet,false);
  if(!next.dispatch){
   assert.equal(next.reason,'LESS_THAN_ONE_FULL_WINDOW_REMAINS');
   assert.equal(next.verifiedEndCursor,7692);
   assert.equal(next.nextCursor,null);
   break;
  }
  assert.equal(next.nextCursor,base+320);
  assert.equal(next.followupsRemaining,remaining-1);
  base=next.nextCursor;remaining=next.followupsRemaining;
  assert.ok(count<25);
 }
 assert.equal(count,20);
 assert.equal(7801-base-320,109);
});
test('Stage59 cannot loop after finite budget exhaustion or bypass a source-positive borrower',()=>{
 assert.equal(plan(report(),{expectedBaseCursor:1292,followupsRemaining:24}).followupsRemaining,23);
 assert.equal(plan(report(),{expectedBaseCursor:1292,followupsRemaining:0}).dispatch,false);
 assert.equal(plan(report({sourceReferencePlansForSandboxOnly:1}),{
  expectedBaseCursor:1292,followupsRemaining:24
 }).reason,'SOURCE_PLAN_REQUIRES_SANDBOX_REVIEW');
});
test('Stage59 workflow preserves finite 20-window auto budget, encoded dispatch budget validation and real-only execution',async()=>{
 const yaml=await readFile(new URL('../.github/workflows/rhea-stage42-reconciled-continuation.yml',import.meta.url),'utf8');
 assert.match(yaml,/STAGE47_FOLLOWUPS_REMAINING:.*'20'/);
 assert.match(yaml,/1\[0-9\]\|2\[0-4\]/);
 assert.match(yaml,/\bmax-parallel: 2\b/);
 assert.match(yaml,/stage56-sandbox-attempt-cli.mjs/);
 assert.match(yaml,/EXECUTION_ENABLED=false NEAR_WORKSPACES_NETWORK=sandbox/);
 assert.doesNotMatch(yaml,/NEAR_PRIVATE_KEY:/);
});
