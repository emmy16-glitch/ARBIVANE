import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attestStage96LendingSourceViews} from '../scripts/stage96-lending-source-view-parity.mjs';
const accountId='9345b3ac35a96e9c9efc6effa5ed50e92ff59a5b31e7b4f2d6f19400c3232899';
const config={enable_pyth_oracle:true,enable_price_oracle:false};
const borrower={positions:[{positionId:'REGULAR',debt:'2'}]};
const assets=[['linear-protocol.near',{supplied:{balance:'100'},borrowed:{balance:'2'}}]];
function fixture(){
 const calls=[];
 return {calls,args:{borrowerAccountId:accountId,sourceConfig:config,
  sourceBorrower:borrower,sourceAssets:assets,lending:{
   accountId:'contract.main.burrow.near',
   view:async(method,args)=>{
    calls.push({method,args});
    return method==='get_config'?config:
     method==='get_account_all_positions'?borrower:
     method==='get_assets_paged'?assets:null;
   },
  },
 }};
}
test('Stage96 attests each deployed local Rhea view in strict order against pinned public source',async()=>{
 const x=fixture(),report=await attestStage96LendingSourceViews(x.args);
 assert.deepEqual(x.calls.map(x=>x.method),[
  'get_config','get_account_all_positions','get_assets_paged']);
 assert.equal(report.pinnedConfigMatches,true);
 assert.equal(report.pinnedBorrowerMatches,true);
 assert.equal(report.pinnedAssetsMatch,true);
 assert.equal(report.allRequiredViewsVerified,true);
 assert.equal(report.actualRheaSettlementVerified,false);
 assert.equal(report.completeTrieRootParityVerified,false);
 assert.equal(report.mainnetMutated,false);
});
test('Stage96 does not permit unsupported Sandbox views to be labelled as source parity',async()=>{
 for(const [method,label] of [
  ['get_config','CONFIG'],
  ['get_account_all_positions','BORROWER'],
  ['get_assets_paged','MARKET_ASSETS']]){
  const x=fixture(),source=x.args.lending.view;
  x.args.lending.view=async(m,args)=>{
   if(m===method)throw Error('untrusted network or state panic token=DO_NOT_LEAK');
   return source(m,args);
  };
  await assert.rejects(()=>attestStage96LendingSourceViews(x.args),
   new RegExp('STAGE96_SANDBOX_'+label+'_VIEW_FAILED'));
  assert.ok(!JSON.stringify(x.calls).includes('DO_NOT_LEAK'));
 }
});
test('Stage96 never accepts a valid-looking but different returned source view',async()=>{
 for(const [method,label] of [
  ['get_config','CONFIG'],
  ['get_account_all_positions','BORROWER'],
  ['get_assets_paged','MARKET_ASSETS']]){
  const x=fixture(),source=x.args.lending.view;
  x.args.lending.view=async(m,args)=>{
   if(m===method)return {forged:true};
   return source(m,args);
  };
  await assert.rejects(()=>attestStage96LendingSourceViews(x.args),
   new RegExp('STAGE96_SANDBOX_'+label+'_SOURCE_PARITY_MISMATCH'));
 }
});
test('Stage96 runs before live Sandbox actor funding, borrowing, or actual Rhea execution',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes('attestStage96LendingSourceViews({'));
 assert.ok(runner.indexOf('attestStage96LendingSourceViews({')<
  runner.indexOf('attestStage51PythParity({rpc,contracts'));
 assert.ok(runner.indexOf('attestStage51PythParity({rpc,contracts')<
  runner.indexOf('seedSandboxLiquidatorWithWrappedNear({'));
 assert.ok(runner.indexOf('seedSandboxLiquidatorWithWrappedNear({')<
  runner.indexOf('actor.callRaw(lending,plan.method'));
 assert.ok(runner.includes('stage96-lending-source-view-parity.json'));
 for(const name of [
  'rhea-stage93-borrower-settlement.yml','rhea-stage87-one-borrower-execution.yml',
  'rhea-stage69-fastlane.yml']){
  const workflow=await readFile(new URL('../.github/workflows/'+name,import.meta.url),'utf8');
  assert.ok(workflow.includes('stage96-lending-source-view-parity.json'));
  assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
 }
 assert.ok(!runner.includes('broadcast_tx'));
});
