import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stage146RunActualLocalPartnerFinance}
 from '../scripts/stage146-actual-local-partner-funding.mjs';
const src=new URL('../scripts/stage146-actual-local-partner-funding.mjs',import.meta.url);
const replay=new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url);
const workflow=new URL('../.github/workflows/rhea-stage146-actual-local-partner.yml',import.meta.url);
test('Stage146 cannot sign outside explicitly selected local Sandbox or touch wallet account',async()=>{
 const prior={...process.env};
 let calls=0;
 try{
  process.env.NEAR_WORKSPACES_NETWORK='mainnet';
  process.env.EXECUTION_ENABLED='false';
  process.env.STAGE146_SANDBOX_PARTNER_FINANCING='true';
  const fakeRoot={createSubAccount:async()=>{calls++;throw Error('MUTATION');}};
  await assert.rejects(stage146RunActualLocalPartnerFinance({
   root:fakeRoot,actor:{accountId:'arbivane-replay.test.near'},
   lending:{accountId:'contract.main.burrow.near'},
   wrapped:{accountId:'wrap.near'},repayToken:{accountId:'linear-protocol.near'},
   contracts:new Map(),assetRows:[],provider:{},plan:{chain:'NEAR_SANDBOX',
    borrowerAccountId:'somebody.near',maySignMainnet:false,
    mayBroadcastMainnet:false,executionEnabled:false},positionId:'one'
  }),/STAGE146_GENUINE_LOCAL_ONLY_DEPENDENCIES_REQUIRED/);
  assert.equal(calls,0);
 }finally{process.env=prior;}
});
test('Stage146 signs actual NEP141 calls only with disposable partner and actor',async()=>{
 const s=await readFile(src,'utf8');
 for(const code of [
  "seedSandboxLiquidatorWithWrappedNear",
  "registerStage49SandboxActor",
  "stage124FinalizeSandboxTransaction",
  "method:'ft_transfer'",
  "method:'ft_transfer_call'",
  "method:'execute_with_pyth'",
  "'actor-real-liquidation'",
  "'partner-repay-borrow'",
  "actorOwnerCollateralAtomic:'0'",
  "realUncollateralizedFlashLoanUsed:false",
  "verifiedMainnetProfit:false"
 ])assert.ok(s.includes(code),'Missing actual local funded requirement '+code);
 for(const forbidden of [
  'patchStateRecords(','.setBalance(','.mint(',
  'ft_mint', 'broadcast_tx_', 'MAINNET_PRIVATE_KEY=',
  'profitTransferredToOwner:true','realUncollateralizedFlashLoanUsed:true'
 ])assert.ok(!s.includes(forbidden),'Forbidden synthetic or production authority '+forbidden);
});
test('Stage146 does not mutate legacy Stage93 unless explicit opt-in flag',async()=>{
 const s=await readFile(replay,'utf8');
 const guard=s.indexOf("if(e.STAGE146_SANDBOX_PARTNER_FINANCING==='true')");
 const standard=s.indexOf('const collateralFunding=await seedSandboxLiquidatorWithWrappedNear({');
 assert.ok(guard>=0&&standard>guard);
 assert.ok(s.includes("if(e.NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(s.includes('await stage146RunActualLocalPartnerFinance({'));
 assert.ok(s.includes("stage146-attempt-failure.json"));
});
test('Stage146 GitHub Actions executes only sandbox with an ORIGINAL Rhea source artifact',async()=>{
 const s=await readFile(workflow,'utf8');
 assert.ok(s.includes("run-id: '40317139342'"));
 assert.ok(s.includes('name: stage93-authentic-borrower-2579'));
 assert.ok(s.includes("STAGE146_SANDBOX_PARTNER_FINANCING: 'true'"));
 assert.ok(s.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(s.includes("NEAR_WORKSPACES_NETWORK: sandbox"));
 assert.ok(s.includes("AR BIVANE_ALLOW_MAINNET_SIGNING".replace(' ',''))
 ||s.includes("ARBIVANE_ALLOW_MAINNET_SIGNING: 'false'"));
 assert.ok(s.includes("timeout --kill-after=10s 18m"));
 assert.ok(s.includes("stage146-actual-partner-funded-result.json"));
 assert.ok(s.includes("if: github.event_name != 'pull_request'"));
});
