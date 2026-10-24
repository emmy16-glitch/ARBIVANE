import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDeployedLiquidationIdentity} from '../src/rhea/liquidation-contract-preflight.ts';
import {simulateArchivedLiquidationRules,USDE27} from '../src/rhea/liquidation-reference-simulation.ts';
const H='2'.repeat(43),O='3'.repeat(43),L='contract.main.burrow.near',OR='aggregate-oracle.near';
function rpc(over={}){
 const calls=[];
 return {calls,
 async viewAccount(id,h){calls.push(['viewAccount',id,h]);return {blockHeight:String(over.blockHeight??221400000),codeHash:id===L?over.lendingHash??H:over.oracleHash??O};},
 async view(id,m,args,h){
  calls.push(['view',m,h]);const value=m==='get_assets_paged'?[
   ['usn',{supplied:{shares:'12',balance:'12'},borrowed:{shares:'4',balance:'4'}}]
  ]:m==='get_num_accounts'?42:m==='get_config'?{oracle_account_id:OR}:undefined;
  return {blockHeight:String(over.assetsBlock??221400000),value};
 }};
}
const input={beforeCollateralE27:(3500n*USDE27).toString(),
 beforeDebtE27:(4000n*USDE27).toString(),afterCollateralE27:(2968n*USDE27).toString(),
 afterDebtE27:(3000n*USDE27).toString(),repaidE27:(1000n*USDE27).toString(),
 seizedE27:(1064n*USDE27).toString()};
test('fresh deployed hash and three exact-block views are observed but never authorization',async()=>{
 const r=rpc();const a=await inspectDeployedLiquidationIdentity(r,{lendingContract:L,oracleContract:OR});
 assert.equal(a.registryAccounts,42);assert.equal(a.assetPools,1);
 assert.equal(a.borrowedPoolBalancePositive,true);assert.equal(a.mayBroadcast,false);
 assert.equal(a.sourceWasmReproduciblyMatched,false);
 assert.equal(a.referenceSourceLiquidationChecks,4);assert.equal(a.publicGuideDescribedChecks,3);
 assert.ok(r.calls.every(([kind,id,block])=>kind!=='view'||block===221400000));
});
test('pinned hash, wrong finalized block and missing on-chain views are blocked',async()=>{
 await assert.rejects(inspectDeployedLiquidationIdentity(rpc(),{lendingContract:L,oracleContract:OR,
  expectedLendingCodeHash:'4'.repeat(43)}),/CODE_HASH_CHANGED/);
 await assert.rejects(inspectDeployedLiquidationIdentity(rpc({assetsBlock:221400001}),{lendingContract:L,oracleContract:OR}),/INCONSISTENT/);
 await assert.rejects(inspectDeployedLiquidationIdentity(rpc(),{lendingContract:L,oracleContract:L}),/INVALID_LENDING/);
});
test('four archived source rules accept documented arithmetic but never confirm profitability',()=>{
 const v=simulateArchivedLiquidationRules(input);
 assert.equal(v.referenceRulesPass,true);assert.equal(v.transactionSimulated,false);
 assert.equal(v.netProfitVerified,false);assert.equal(v.executionEnabled,false);
 assert.equal(v.grossPaperSpreadE27,(64n*USDE27).toString());
});
test('unhealthy debt with nonimproving final health rejects reference liquidation',()=>{
 const bad=simulateArchivedLiquidationRules({...input,afterCollateralE27:(2600n*USDE27).toString()});
 assert.equal(bad.referenceRulesPass,false);
 assert.ok(bad.reasons.includes('BORROWER_HEALTH_NOT_IMPROVED'));
});
test('wrong amount types, negative values, extra fields or overflow fail closed',()=>{
 for(const v of [{...input,repaidE27:1000},{...input,repaidE27:'-2'},
   {...input,repaidE27:'0'},{...input,extra:1},{...input,repaidE27:'9'.repeat(55)}]){
  assert.throws(()=>simulateArchivedLiquidationRules(v));
 }
});
test('static workflow retains research-only, source-vs-Wasm warning and no signing',async()=>{
 const {readFile}=await import('node:fs/promises');
 const yaml=await readFile(new URL('../.github/workflows/rhea-stage23-liquidation-preflight.yml',import.meta.url),'utf8');
 assert.ok(yaml.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(yaml.includes('probe:rhea:liquidation-preflight'));
 assert.ok(!yaml.includes('near transaction sign'));
 assert.ok(!yaml.includes('broadcast_tx'));
});
