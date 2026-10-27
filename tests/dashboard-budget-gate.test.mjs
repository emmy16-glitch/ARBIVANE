import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stage171UsdE27,stage171VerifyDashboardSourceBudget}
 from '../scripts/stage171-dashboard-source-budget.mjs';
const E=10n**27n;
const proposal=()=>({
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',referenceRulesPass:true,executionEnabled:false,mayBroadcast:false,
 repay:{referenceUsdE27:(378105424460410732931648642n).toString()},
 paperGrossUsdE27:(7550927865296268892306603n).toString(),
});
test('Stage171 prices arbitrary entered dollars correctly and rejects malformed limits',()=>{
 assert.equal(stage171UsdE27('10000.00','AMOUNT'),(10000n*E).toString()&&10000n*E);
 assert.equal(stage171UsdE27('0.01','AMOUNT',{allowZero:true}),E/100n);
 for(const bad of ['-1','0','1e5','Infinity','1.001',' 5','001','1000000000']){
  assert.throws(()=>stage171UsdE27(bad,'AMOUNT'),/STAGE171_INVALID_AMOUNT/);
 }
});
test('Stage171 accurately prevents larger source repayment than configured amount',()=>{
 const q=proposal();
 assert.throws(()=>stage171VerifyDashboardSourceBudget(q,{maxFinancingUsd:'0.37',minimumNetProfitUsd:'0'}),
  /STAGE171_SOURCE_REPAY_EXCEEDS_FINANCING_CAP/);
 const r=stage171VerifyDashboardSourceBudget(q,{maxFinancingUsd:'0.38',minimumNetProfitUsd:'0'});
 assert.equal(r.status,'SOURCE_BUDGET_CAP_PASS_NOT_ECONOMIC_PROOF');
 assert.equal(r.realizedNetProfitVerified,false);
 assert.equal(r.flashFinancingVerified,false);
 assert.equal(r.executionEnabled,false);
 assert.equal(r.mayBroadcastMainnet,false);
});
test('Stage171 source paper gross is only a necessary net threshold, not verified net PNL',()=>{
 const q=proposal();
 assert.throws(()=>stage171VerifyDashboardSourceBudget(q,{maxFinancingUsd:'10000',minimumNetProfitUsd:'0.01'}),
  /STAGE171_SOURCE_GROSS_BELOW_MINIMUM_NET_TARGET/);
 const r=stage171VerifyDashboardSourceBudget(q,{maxFinancingUsd:'10000',minimumNetProfitUsd:'0'});
 assert.equal(r.sourcePaperGrossUsdE27,q.paperGrossUsdE27);
 assert.equal(r.realizedNetProfitVerified,false);
 for(const tampered of [
  {...q,executionEnabled:true},
  {...q,repay:{referenceUsdE27:'invalid'}},
  {...q,paperGrossUsdE27:'0.1'},
 ]){
  assert.throws(()=>stage171VerifyDashboardSourceBudget(tampered,{maxFinancingUsd:'5',minimumNetProfitUsd:'0'}),/STAGE171_/);
 }
});
test('Stage171 runner gate occurs before source RPC and before any Workspaces collateral mutation',async()=>{
 const s=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const gate=s.indexOf('stage171VerifyDashboardSourceBudget(proposal,');
 const rpc=s.indexOf('const rpc=new ResilientNearReadOnlyRpc(');
 const deposit=s.indexOf('seedSandboxLiquidatorWithWrappedNear({');
 assert.ok(gate>0&&rpc>gate&&deposit>rpc);
 assert.ok(s.includes('ARBIVANE_MINIMUM_NET_PROFIT_USD'));
 assert.ok(s.includes("NEAR_WORKSPACES_NETWORK!=='sandbox'"));
});
