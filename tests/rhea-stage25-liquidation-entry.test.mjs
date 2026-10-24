import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLiveLiquidationEntry} from '../src/rhea/liquidation-entry-evidence.ts';
import {buildResearchLiquidationAction} from '../src/rhea/liquidation-research-action.ts';
const L='contract.main.burrow.near',O='priceoracle.near',A='aggregate-oracle.near';
const B='tmp-owner.main.burrow.near',LI='test-liquidator.near',H='221400111';
const LH='2'.repeat(43),OH='3'.repeat(43),AH='4'.repeat(43);
const opts={lendingContract:L,configuredOracle:O,aggregatePriceReader:A,
 borrowerAccountId:B,expectedLendingCodeHash:LH,
 expectedConfiguredOracleCodeHash:OH,expectedAggregatePriceReaderCodeHash:AH};
function mocks({hashDrift=false,blockDrift=false,oracleDrift=false,hasDebt=true,liquidator=true,unavailableWhitelist=false}={}){
 const calls=[];
 const rpc={
  async viewAccount(id,at){
   calls.push(['viewAccount',id,at]);
   return {blockHeight:H,codeHash:id===L?(hashDrift?AH:LH):id===O?OH:AH};
  },
  async view(id,method,args,at){
   calls.push(['view',method,at]);
   let value;
   if(method==='get_config')value={oracle_account_id:oracleDrift?'fake.near':O,enable_pyth_oracle:true};
   if(method==='get_assets_paged')value=[['wrap.near',{supplied:{shares:'12',balance:'12'},borrowed:{shares:'6',balance:'6'}}]];
   if(method==='get_account_all_positions')value={positions:{REGULAR:{
    borrowed:hasDebt?[{token_id:'wrap.near',shares:'2',balance:'2'}]:[],
    collateral:[{token_id:'wrap.near',shares:'2',balance:'2'}],
   }}};
   if(method==='get_account')value={supplied:liquidator?[{token_id:'wrap.near',balance:'10'}]:[]};
   if(method==='get_reliable_liquidator_whitelist'){
    if(unavailableWhitelist)throw Error('rpc unavailable');
    value=['other.near'];
   }
   return {blockHeight:blockDrift&&method==='get_config'?'221400112':H,value};
  }
 };
 return {rpc,calls};
}
test('new finalized block checks real borrower debt and two distinct oracle hashes',async()=>{
 const f=mocks();
 const v=await inspectLiveLiquidationEntry(f.rpc,opts);
 assert.equal(v.blockHeight,H);assert.equal(v.borrowerStillHasDebt,true);
 assert.equal(v.borrowerPositionCount,1);
 assert.deepEqual(v.borrowerDebtAssets,['wrap.near']);
 assert.equal(v.oracleConfigMatches,true);
 assert.equal(v.pythOracleEnabled,true);
 assert.equal(v.whitelistQueryAvailable,true);
 assert.equal(v.publicLiquidationPermissionVerified,false);
 assert.ok(v.blockers.includes('LIQUIDATOR_WALLET_NOT_CONFIGURED'));
 assert.equal(v.mayBroadcast,false);
 assert.ok(f.calls.filter(x=>x[0]==='view').every(x=>x[2]===Number(H)));
});
test('missing borrower debt never becomes liquidation permission',async()=>{
 const v=await inspectLiveLiquidationEntry(mocks({hasDebt:false}).rpc,opts);
 assert.equal(v.borrowerStillHasDebt,false);
 assert.ok(v.blockers.includes('BORROWER_NO_LONGER_HAS_DEBT'));
 assert.equal(v.executionEnabled,false);
});
test('optional supplied balance is not certified executable funding',async()=>{
 const a=await inspectLiveLiquidationEntry(mocks().rpc,{...opts,liquidatorAccountId:LI});
 assert.equal(a.liquidatorRegistered,true);
 assert.deepEqual(a.liquidatorSuppliedTokenIds,['wrap.near']);
 assert.equal(a.liquidatorFundsVerified,false);
 assert.equal(a.whitelistContainsLiquidator,false);
 const b=await inspectLiveLiquidationEntry(mocks({liquidator:false}).rpc,{...opts,liquidatorAccountId:LI});
 assert.ok(b.blockers.includes('LIQUIDATOR_HAS_NO_OBSERVED_SUPPLIED_BALANCE'));
});
test('oracle/code/block drift fail closed, unknown whitelist is never treated as authorized',async()=>{
 for(const [change,error] of [
  [{hashDrift:true},/CODE_CHANGED/],
  [{blockDrift:true},/CROSS_BLOCK/],
  [{oracleDrift:true},/CONFIGURED_ORACLE_DRIFT/],
 ]){
  await assert.rejects(inspectLiveLiquidationEntry(mocks(change).rpc,opts),error);
 }
 const v=await inspectLiveLiquidationEntry(mocks({unavailableWhitelist:true}).rpc,opts);
 assert.equal(v.whitelistQueryAvailable,false);
 assert.equal(v.whitelistContainsLiquidator,null);
 assert.equal(v.publicLiquidationPermissionVerified,false);
});
const E=10n**27n;
const scenario={beforeCollateralE27:(3500n*E).toString(),beforeDebtE27:(4000n*E).toString(),
 afterCollateralE27:(2968n*E).toString(),afterDebtE27:(3000n*E).toString(),
 repaidE27:(1000n*E).toString(),seizedE27:(1064n*E).toString()};
const input={borrowerAccountId:B,liquidatorAccountId:LI,
 inAssets:[{tokenId:'wrap.near',amountAtomic:'1000'}],
 outAssets:[{tokenId:'usdc.near',amountAtomic:'1064'}],
 archivedSourceScenario:scenario,
 budgets:{repaidUsdE27:scenario.repaidE27,seizedUsdE27:scenario.seizedE27,
 maximumGasUsdE27:(1n*E).toString(),maximumSwapSlippageUsdE27:(10n*E).toString(),
 maximumFinancingUsdE27:(1n*E).toString(),maximumCompetitionUsdE27:(1n*E).toString(),
 minimumNetProfitUsdE27:(5n*E).toString(),maximumRepayUsdE27:(1200n*E).toString()}};
test('archived only action enforces positive paper net without creating transaction',()=>{
 const r=buildResearchLiquidationAction(input);
 assert.equal(r.historicalOnly.Execute.actions[0].Liquidate.account_id,B);
 assert.equal(r.estimatedPaperWorstCaseNetUsdE27,(51n*E).toString());
 assert.equal(r.paperRulesPass,true);assert.equal(r.positiveWorstCaseMargin,true);
 assert.equal(r.transactionPrepared,false);assert.equal(r.maySign,false);assert.equal(r.mayBroadcast,false);
});
test('malformed amounts, shared borrower identity, exceeded budget, absent gas buffer fail closed',()=>{
 for(const x of [
  {...input,liquidatorAccountId:B},
  {...input,inAssets:[{tokenId:'wrap.near',amountAtomic:'0'}]},
  {...input,inAssets:[...input.inAssets,...input.inAssets]},
  {...input,budgets:{...input.budgets,maximumRepayUsdE27:(10n*E).toString()}},
  {...input,budgets:{...input.budgets,maximumGasUsdE27:'0'}},
  {...input,budgets:{...input.budgets,seizedUsdE27:(1065n*E).toString()}},
 ])assert.throws(()=>buildResearchLiquidationAction(x));
});
test('unprofitable hypothetical margin remains blocked',()=>{
 const v=buildResearchLiquidationAction({...input,budgets:{
  ...input.budgets,maximumSwapSlippageUsdE27:(90n*E).toString()
 }});
 assert.equal(v.positiveWorstCaseMargin,false);
 assert.ok(v.blockers.includes('PAPER_NET_BELOW_CONFIGURED_MINIMUM'));
 assert.equal(v.mayBroadcast,false);
});
test('mainnet CI cannot sign or present old health as current',async()=>{
 const {readFile}=await import('node:fs/promises');
 const yml=await readFile(new URL('../.github/workflows/rhea-stage25-liquidation-entry.yml',import.meta.url),'utf8');
 assert.ok(yml.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(yml.includes('RHEA_BORROWER_ACCOUNT_ID: tmp-owner.main.burrow.near'));
 assert.ok(yml.includes('.latestHealthVerified == false'));
 assert.ok(yml.includes('.mayBroadcast == false'));
 assert.ok(!yml.includes('broadcast_tx'));
});
