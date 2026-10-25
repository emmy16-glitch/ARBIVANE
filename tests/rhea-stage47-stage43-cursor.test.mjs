import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveStage43WindowCursor} from '../scripts/stage47-stage43-cursor.mjs';

function report(overrides={}){
 return {
  mode:'RHEA_STAGE42_VERIFIED_BORROWER_WINDOW',chain:'NEAR_MAINNET',
  status:'WINDOW_RECONCILED_WITH_BLOCKED_READS',
  everyHistoricalFindingVisited:true,allCurrentHealthVerified:false,
  liquidationEligibilityVerified:false,positiveNetProfitVerified:false,
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  shardsReconciled:4,accountsVisited:320,
  baseCursor:1292,endCursor:1612,historicalSourceDebtAccounts:7801,
  paperAtRisk:4,paperHealthy:303,noDebtNow:5,blockedInitialReads:8,
  failedRiskRefreshes:2,sourceReferencePlansForSandboxOnly:0,
  blockers:['BLOCKED_ORACLE_OR_RPC_READS_REMAIN_UNRESOLVED'],...overrides
 };
}

test('Stage43 derives the real Stage47 borrower range, not historical hardcoded cursor 972',()=>{
 assert.equal(resolveStage43WindowCursor(report()),1292);
 assert.equal(resolveStage43WindowCursor(report(),'1292'),1292);
 assert.equal(resolveStage43WindowCursor(report({baseCursor:1612,endCursor:1932})),1612);
});

test('Stage43 fails closed on wrong manual cursor or forged Stage42 aggregate',()=>{
 for(const cursor of ['972','1293','001292','-1','1e3','']) {
  assert.throws(()=>resolveStage43WindowCursor(report(),cursor));
 }
 for(const patch of [
  {endCursor:1600},{accountsVisited:319},{paperHealthy:302},
  {shardsReconciled:3},{executionEnabled:true},
  {liquidationEligibilityVerified:true},{positiveNetProfitVerified:true},
  {status:'BAD_STATUS'}, {baseCursor:0,endCursor:320},
  {baseCursor:7600,endCursor:7920}
 ]) assert.throws(()=>resolveStage43WindowCursor(report(patch)));
});

test('Stage43 workflow derives cursor from verified artifact, guards main branch, and continues bounded retries',async()=>{
 const flow=await readFile(new URL('../.github/workflows/rhea-stage43-blocked-retry.yml',import.meta.url),'utf8');
 assert.match(flow,/stage47-stage43-cursor-cli\.mjs aggregate\/stage42-reconciled-window\.json/);
 assert.match(flow,/RHEA_STAGE43_BASE_CURSOR=\$base/);
 assert.doesNotMatch(flow,/RHEA_STAGE43_BASE_CURSOR: \$\{\{/);
 assert.match(flow,/github\.event\.workflow_run\.head_branch == 'main'/);
 assert.match(flow,/\.remainingTargets > 0/);
 assert.match(flow,/gh api --method POST/);
 assert.match(flow,/actions: write/);
 assert.match(flow,/stage42_run_id/);
 assert.match(flow,/inputs\[from_target\]/);
 assert.match(flow,/RHEA_STAGE43_MAX_TARGETS: '12'/);
 assert.match(flow,/EXECUTION_ENABLED: 'false'/);
 assert.doesNotMatch(flow,/MAINNET_PRIVATE_KEY:/);
});
