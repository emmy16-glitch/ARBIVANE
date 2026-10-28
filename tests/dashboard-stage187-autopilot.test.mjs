import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {validateAutopilotEnvironment,admitAutopilotProposal,nextScanCursor}
 from '../scripts/stage187-sandbox-autopilot-policy.mjs';
import {readFile} from 'node:fs/promises';
const env={
 ARBIVANE_SANDBOX_AUTOPILOT_ENABLED:'true',EXECUTION_ENABLED:'false',NEAR_NETWORK:'mainnet',
 NEAR_WORKSPACES_NETWORK:'sandbox',NEAR_RPC_URL:'https://rpc.mainnet.near.org',
 RHEA_EXPECTED_LENDING_CODE_HASH:'6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa',
 RHEA_EXPECTED_ORACLE_CODE_HASH:'9vafnXzrPYQ4ErDqt2triRkQJHdxtG7tfkyb24t5Ttrg',
 ARBIVANE_MAX_FINANCING_USD:'1000.00',ARBIVANE_MINIMUM_NET_PROFIT_USD:'0.00'
};
test('Stage187 can never accept mainnet execution, private keys, or arbitrary lending contract',()=>{
 assert.equal(validateAutopilotEnvironment(env),true);
 for(const unsafe of [{EXECUTION_ENABLED:'true'},{NEAR_WORKSPACES_NETWORK:'mainnet'},
  {NEAR_PRIVATE_KEY:'secret'},{NEAR_ACCOUNT_ID:'user.near'},
  {MAINNET_PRIVATE_KEY:'secret'},{NEAR_RPC_URL:'http://evil.invalid'},
  {RHEA_LENDING_CONTRACT:'custom.near'},{ARBIVANE_SANDBOX_AUTOPILOT_ENABLED:'false'}]){
  assert.throws(()=>validateAutopilotEnvironment({...env,...unsafe}),
   /STAGE187_KEYLESS_SANDBOX_PREREQUISITES_REQUIRED/);
 }
});
test('Stage187 rejects unsupported routes before calling planner or budget gate',()=>{
 let called=0; const bad={mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',referenceRulesPass:true,executionEnabled:false,maySign:false,
 mayBroadcast:false,repay:{tokenId:'wrap.near'},seize:{tokenId:'wrap.near'}};
 const r=admitAutopilotProposal(bad,{},{
 buildPlan:()=>{called++},verifyBudget:()=>{called++}});
 assert.equal(r.admitted,false);assert.equal(called,0);
});
test('Stage187 budget gate is enforced before actual Sandbox runner admission',()=>{
 const good={mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',referenceRulesPass:true,executionEnabled:false,maySign:false,
 mayBroadcast:false,repay:{tokenId:'linear-protocol.near'},
 seize:{tokenId:'linear-protocol.near'}};
 let hit=[];
 const admission=admitAutopilotProposal(good,{},{
 buildPlan:()=>hit.push('plan'),verifyBudget:()=>hit.push('budget')});
 assert.equal(admission.admitted,true);assert.deepEqual(hit,['plan','budget']);
 const blocked=admitAutopilotProposal(good,{},{
 buildPlan:()=>{},verifyBudget:()=>{throw Error('STAGE171_SOURCE_REPAY_EXCEEDS_FINANCING_CAP')}});
 assert.equal(blocked.admitted,false);
 assert.equal(blocked.reason,'STAGE171_SOURCE_REPAY_EXCEEDS_FINANCING_CAP');
});
test('Stage187 advances persistent account cursor without endless last-page cycling',()=>{
 assert.equal(nextScanCursor(0,50,100),50);
 assert.equal(nextScanCursor(50,100,100),0);
 assert.throws(()=>nextScanCursor(50,51,50));
 assert.throws(()=>nextScanCursor(5,5,99));
});
test('Stage187 worker fails closed without configuration, never emits invented settlement',()=>{
 const run=spawnSync(process.execPath,['--experimental-strip-types','scripts/stage187-sandbox-autopilot.mjs'],
  {cwd:new URL('..',import.meta.url),env:{...process.env,EXECUTION_ENABLED:'false',
   ARBIVANE_SANDBOX_AUTOPILOT_ENABLED:'false'},encoding:'utf8',timeout:15000});
 assert.equal(run.status,2);
 assert.match(run.stdout,/STAGE187_KEYLESS_SANDBOX_PREREQUISITES_REQUIRED/);
 assert.doesNotMatch(run.stdout,/Original Sandbox FINAL receipts and inventory independently reconciled/);
});
test('Stage187 server uses real source pipeline and isolates each attempt',async()=>{
 const server=await readFile(new URL('../dashboard/server/automation.mjs',import.meta.url),'utf8');
 const runner=await readFile(new URL('../scripts/stage187-sandbox-autopilot.mjs',import.meta.url),'utf8');
 assert.match(server,/stage187-sandbox-autopilot.mjs/);
 assert.match(server,/#control\(session,patch\)/);
 assert.match(runner,/indexPagedPositions\(rpc/);
 assert.match(runner,/evaluateActualCandidate\(rpc/);
 assert.match(runner,/stage171VerifyDashboardSourceBudget/);
 assert.match(runner,/stage37-workspaces-sandbox-replay.mjs/);
 assert.match(runner,/NEAR_PRIVATE_KEY:''/);
});
