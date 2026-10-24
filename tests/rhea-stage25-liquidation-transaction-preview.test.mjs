import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStage25LiquidationRoute,prepareReferenceLiquidationPreview} from '../src/rhea/liquidation-transaction-preview.ts';

const L='contract.main.burrow.near',A='aggregate-oracle.near',O='priceoracle.near';
const H='221400100',C='2'.repeat(43),Q='3'.repeat(43),T='4'.repeat(43);
const witness=(accountId,hash,exportsList)=>({
 accountId,blockHeight:H,observedCodeHash:hash,computedCodeHash:hash,rpcReportedCodeHash:hash,
 byteLength:1048576,exportCount:exportsList.length,executeExportPresent:exportsList.includes('execute'),
 publicFunctionExports:exportsList,codeBytesHashMatched:true,sourceWasmReproduciblyMatched:false,
 liquidationRulesVerified:false,transactionDryRunPerformed:false,executionEnabled:false,mayBroadcast:false
});
const report=()=>({
 mode:'RHEA_STAGE24_DEPLOYED_WASM_WITNESS',chain:'NEAR_MAINNET',
 status:'DEPLOYED_CODE_BYTES_ATTESTED_SOURCE_UNVERIFIED',blockHeight:H,
 lending:witness(L,C,['execute','get_config']),oracle:witness(A,Q,['list_prices']),
 configuredOracle:witness(O,T,['oracle_call','get_price_data']),
 lendingConfigOracleAccountId:O,oracleAccountPointerStatus:'DISTINCT_CONFIGURED_ORACLE',
 pythOracleEnabled:true,liquidationMethodSurfaceObserved:true,
 sourceWasmReproduciblyMatched:false,deployedLiquidationRulesVerified:false,
 transactionDryRunPerformed:false,netProfitVerified:false,walletAuthorized:false,
 executionEnabled:false,mayBroadcast:false,blockers:['NO_SIGNER']
});
const leg=(tokenId,amount)=>({tokenId,amount});
const proposal=()=>({
 borrowerId:'debtor.near',liquidatorId:'study-liquidator.near',blockHeight:H,
 lendingCodeHash:C,configuredOracleCodeHash:T,
 repay:[leg('usdc.near','10000')],borrow:[leg('usdc.near','10001')],
 seize:[leg('wrap.near','500')],withdrawalCount:1
});
test('configured priceoracle path is distinguished from aggregate reader; no trade authorized',()=>{
 const v=inspectStage25LiquidationRoute(report());
 assert.equal(v.configuredOracleContract,O);
 assert.equal(v.aggregatePriceReader,A);
 assert.equal(v.oracleIsDistinctFromAggregate,true);
 assert.equal(v.configuredOracleCallExportObserved,true);
 assert.equal(v.deployedSourceParityVerified,false);
 assert.equal(v.executionEnabled,false);
 assert.equal(v.mayBroadcast,false);
});
test('canonical archived Borrow Liquidate Withdraw shape emitted only as unsigned preview',()=>{
 const v=prepareReferenceLiquidationPreview(report(),proposal(),'221400105');
 assert.equal(v.contractId,O);
 assert.equal(v.methodName,'oracle_call');
 assert.equal(v.args.receiver_id,L);
 const msg=JSON.parse(v.args.msg);
 assert.deepEqual(msg,{Execute:{actions:[
  {Borrow:{token_id:'usdc.near',amount:'10001'}},
  {Liquidate:{account_id:'debtor.near',
   in_assets:[{token_id:'usdc.near',amount:'10000'}],
   out_assets:[{token_id:'wrap.near',amount:'500'}]}},
  {Withdraw:{token_id:'wrap.near',max_amount:'500'}}
 ]}});
 assert.equal(v.transactionReplayed,false);
 assert.equal(v.liquidationEligible,false);
 assert.equal(v.netProfitVerified,false);
 assert.equal(v.executionEnabled,false);
 assert.equal(v.mayBroadcast,false);
 assert.equal(Object.hasOwn(v,'gas'),false);
 assert.equal(Object.hasOwn(v,'signer'),false);
});
test('invalid method identity, missing method export and wrong code flags reject',()=>{
 for(const broken of [
  (()=>{const r=report();r.configuredOracle.publicFunctionExports=['get_price_data'];return r;})(),
  (()=>{const r=report();r.configuredOracle.observedCodeHash=C;return r;})(),
  (()=>{const r=report();r.lending.publicFunctionExports=['get_config'];return r;})(),
  (()=>{const r=report();r.oracleAccountPointerStatus='EXPLICIT_MATCH';return r;})(),
  (()=>{const r=report();r.executionEnabled=true;return r;})(),
  (()=>{const r=report();r.configuredOracle.blockHeight='221400101';return r;})(),
 ]){
  assert.throws(()=>inspectStage25LiquidationRoute(broken));
 }
});
test('stale snapshots and changed code hashes fail closed',()=>{
 assert.throws(()=>prepareReferenceLiquidationPreview(report(),proposal(),'221400111'),/STALE/);
 assert.throws(()=>prepareReferenceLiquidationPreview(report(),proposal(),'221400099'),/STALE/);
 assert.throws(()=>prepareReferenceLiquidationPreview(report(),{...proposal(),configuredOracleCodeHash:C},H),/HASH_DRIFT/);
 assert.throws(()=>prepareReferenceLiquidationPreview(report(),{...proposal(),lendingCodeHash:Q},H),/HASH_DRIFT/);
});
test('duplicate tokens, zeros, u128 overflow, excessive amounts and unknown fields fail closed',()=>{
 for(const changes of [
  {borrow:[leg('usdc.near','10500')]},
  {borrow:[leg('usdc.near','9999')]},
  {borrow:[leg('usdc.near','0')]},
  {repay:[leg('usdc.near',String(2n**128n))]},
  {repay:[leg('usdc.near','10000'),leg('usdc.near','20000')]},
  {borrow:[leg('not priced','10000')]},
  {borrow:[{tokenId:'usdc.near',amount:'10000',method:'withdraw_all'}]},
  {withdrawalCount:5},
  {liquidatorId:'debtor.near'},
  {borrow:[leg('unrelated.near','10000')]}
 ]){
  assert.throws(()=>prepareReferenceLiquidationPreview(report(),{...proposal(),...changes},H));
 }
 assert.throws(()=>prepareReferenceLiquidationPreview(report(),{...proposal(),override:'execute'},H),/UNEXPECTED/);
});
test('no configured oracle identity means no route; direct oracle can still be inspected',()=>{
 const absent=report();absent.configuredOracle=null;absent.lendingConfigOracleAccountId=null;
 assert.throws(()=>inspectStage25LiquidationRoute(absent),/CONFIGURED_ORACLE_UNKNOWN/);
 const same=report();same.configuredOracle=null;same.oracle=witness(O,T,['oracle_call']);
 same.lendingConfigOracleAccountId=O;same.oracleAccountPointerStatus='EXPLICIT_MATCH';
 const v=inspectStage25LiquidationRoute(same);
 assert.equal(v.oracleIsDistinctFromAggregate,false);
 assert.equal(v.configuredOracleContract,O);
});
test('live workflow has no wallet, actions or execution enabled',async()=>{
 const {readFile}=await import('node:fs/promises');
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage25-liquidation-route.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(workflow.includes('.route.configuredOracleCallExportObserved == true'));
 assert.ok(workflow.includes('.proposedTransactions == 0'));
 assert.ok(!workflow.includes('broadcast_tx'));
 assert.ok(!workflow.includes('NEAR_PRIVATE_KEY'));
});
