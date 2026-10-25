import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const runner=new URL('../scripts/stage90-wnear-source-canary.mjs',import.meta.url);
const workflow=new URL('../.github/workflows/rhea-stage90-wnear-canary.yml',import.meta.url);

test('Stage90 authentic isolated canary uses prior completed pinned borrower source and a fresh independent execution queue',async()=>{
 const s=await readFile(runner,'utf8'),w=await readFile(workflow,'utf8');
 assert.ok(w.includes('name: Rhea Stage90 historical wNEAR isolated Sandbox canary'));
 assert.ok(w.includes('group: arbivane-stage90-wnear-canary'));
 assert.ok(w.includes('cancel-in-progress: false'));
 assert.ok(w.includes("run-id: '40199603942'"));
 assert.ok(w.includes('name: stage87-authentic-borrower-2579'));
 assert.ok(w.includes('source/stage38-positive-stage35-evidence.json'));
 assert.ok(w.includes('timeout-minutes: 30'));
 assert.ok(w.includes('actions/download-artifact@v4'));
 assert.ok(w.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(w.includes('NEAR_WORKSPACES_NETWORK: sandbox'));
 assert.ok(w.includes('STAGE90_ALLOW_LOCAL_STATE_PATCH'));
 assert.ok(s.includes("proposal.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'"));
 assert.ok(s.includes('proposal.referenceRulesPass!==true'));
 assert.ok(s.includes('deployed.codeHash!==proposal.lendingCodeHash'));
 assert.ok(s.includes('cloneStage89WrappedNear({'));
 assert.ok(s.includes('root:worker.rootAccount'));
});

test('Stage90 never makes a liquidation claim based on wNEAR state parity or missing callbacks',async()=>{
 const s=await readFile(runner,'utf8'),w=await readFile(workflow,'utf8');
 assert.ok(s.includes("status:'BLOCKED_NO_VERIFIED_WNEAR_PARITY'"));
 assert.ok(s.includes("status='PINNED_WNEAR_STATE_AND_SOURCE_VIEWS_MATCH_NOT_LIQUIDATION'"));
 assert.ok(s.includes('actualRheaLiquidationAttempted:false'));
 assert.ok(s.includes('actualRheaSettlementVerified:false'));
 assert.ok(s.includes('positiveNetProfitVerified:false'));
 assert.ok(s.includes('maySignMainnet:false,mayBroadcastMainnet:false'));
 assert.ok(s.includes('actual.originalDeployedWasmVerified!==true'));
 assert.ok(s.includes('actual.relevantAccountViewParityVerified!==true'));
 assert.ok(w.includes('.actualRheaLiquidationAttempted == false'));
 assert.ok(w.includes('.wnearImportEvidence.recordsRead == .wnearImportEvidence.recordsPatched'));
 assert.ok(w.includes('if: always()'));
 assert.ok(!s.includes('broadcast_tx'));
 assert.ok(!s.includes('callRaw('));
});

test('Stage90 wNEAR canary is isolated from the running Stage87 liquidation and reports sanitized RPC failures',async()=>{
 const s=await readFile(runner,'utf8'),w=await readFile(workflow,'utf8');
 const stage87=await readFile(new URL('../.github/workflows/rhea-stage87-one-borrower-execution.yml',import.meta.url),'utf8');
 assert.ok(s.includes("'STAGE90_UNCLASSIFIED_SANDBOX_WNEAR_CANARY_FAILURE'"));
 assert.ok(s.includes('if(worker)await worker.tearDown()'));
 assert.ok(s.includes("stage90-wnear-canary-evidence.json"));
 assert.ok(w.includes('rhea-stage90-authentic-wnear-parity'));
 assert.ok(stage87.includes('group: arbivane-stage87-single-borrower'));
 assert.ok(!w.includes('group: arbivane-stage87-single-borrower'));
 assert.ok(!w.includes('NEAR_PRIVATE_KEY:'));
 assert.ok(!w.includes('MAINNET_PRIVATE_KEY:'));
});
