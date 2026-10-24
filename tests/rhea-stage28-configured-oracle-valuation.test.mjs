import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectConfiguredOracleDenomination} from '../src/rhea/configured-oracle-valuation.ts';
const L='contract.main.burrow.near',O='priceoracle.near',B='alice.near';
const LH='2'.repeat(43),OH='3'.repeat(43),H='221455555',NOW=Date.now();
const UNIT=10n**27n, w=10n**24n,u=10n**18n;
const ASSETS=[
 ['usn',{supplied:{shares:(10n*u).toString(),balance:(10n*u).toString()},
  borrowed:{shares:(10n*u).toString(),balance:(10n*u).toString()},config:{extra_decimals:0,volatility_ratio:10000}}],
 ['wrap.near',{supplied:{shares:(10n*w).toString(),balance:(10n*w).toString()},
  borrowed:{shares:(10n*w).toString(),balance:(10n*w).toString()},config:{extra_decimals:0,volatility_ratio:10000}}],
];
const POSITION={positions:{REGULAR:{
 borrowed:[{token_id:'usn',shares:(4n*u).toString(),balance:(4n*u).toString()}],
 collateral:[{token_id:'wrap.near',shares:w.toString(),balance:w.toString()}]}}};
const OPT={lendingContract:L,configuredOracle:O,borrowerAccountId:B,
 expectedLendingCodeHash:LH,expectedConfiguredOracleCodeHash:OH,
 nowMs:NOW,maxQuoteAgeMs:120000,sanityMaxUsd:'10000000'};
function fixture({detail=POSITION,asset=ASSETS,stale=false,unavailable=false,missingPrice=false,
  wrongBlock=false,priceDecimalsWrong=false,configDrift=false}={}){
 const calls=[];
 const rpc={
  async viewAccount(id,h){calls.push(['account',id,h]);return {blockHeight:H,codeHash:id===L?LH:OH}},
  async view(id,method,args={},h){
   calls.push(['view',id,method,args,h]);
   if(method==='get_price_data'&&unavailable)throw Error('price data unavailable');
   const values={
    get_config:{oracle_account_id:configDrift?'random.near':O},
    get_assets_paged:asset,
    get_account_all_positions:detail,
    get_price_data:{recency_duration_sec:90,timestamp:String(BigInt(stale?NOW-180000:NOW-8000)*1000000n),
     prices:[
      {asset_id:'usn',price:missingPrice?null:{multiplier:'100000000',decimals:priceDecimalsWrong?8:26}},
      {asset_id:'wrap.near',price:{multiplier:'20000',decimals:28}}
     ]}
   };
   return {blockHeight:wrongBlock&&method==='get_price_data'?'221455556':H,value:values[method]};
  },
 };return {rpc,calls};
}
test('configured oracle corrected token decimals produce reasonable exact E27 USD',async()=>{
 const {rpc,calls}=fixture();
 const x=await inspectConfiguredOracleDenomination(rpc,OPT);
 assert.equal(x.status,'REFERENCE_VALUE_RECONCILED_UNAPPROVED');
 assert.equal(x.configuredOraclePriceViewReturned,true);
 assert.equal(x.quotedTokens,2);
 assert.deepEqual(x.missingQuotedTokenIds,[]);
 assert.equal(x.positions[0].healthFactorBps,'5000');
 assert.equal(x.positions[0].adjustedCollateralE27,(2n*UNIT).toString());
 assert.equal(x.positions[0].adjustedDebtE27,(4n*UNIT).toString());
 assert.equal(x.positions[0].legs.find(v=>v.tokenId==='wrap.near').oracleDecimals,28);
 assert.equal(x.valueUnitsReconciledToLegacyPriceShape,true);
 assert.equal(x.currentExecutionOracleBranchAttested,false);
 assert.equal(x.fullStateReplayPerformed,false);
 assert.equal(x.mayBroadcast,false);
 assert.deepEqual(calls.filter(c=>c[0]==='view').map(c=>c[4]),new Array(4).fill(Number(H)));
});
test('Pyth raw exponent passed as lending Price.decimals is blocked as abnormal',async()=>{
 const x=await inspectConfiguredOracleDenomination(fixture({priceDecimalsWrong:true}).rpc,OPT);
 assert.equal(x.status,'INCOMPLETE_REFERENCE_VALUATION');
 assert.equal(x.positions[0].status,'BLOCKED');
 assert.match(x.positions[0].reason,/SANITY_CAP/);
 assert.equal(x.valueUnitsReconciledToLegacyPriceShape,false);
});
test('stale and unavailable configured legacy oracle never silently fallback',async()=>{
 for(const change of [{stale:true},{unavailable:true}]){
  const x=await inspectConfiguredOracleDenomination(fixture(change).rpc,OPT);
  assert.equal(x.status,'CONFIGURED_ORACLE_QUOTES_UNAVAILABLE');
  assert.equal(x.quotedTokens,0);
  assert.deepEqual(x.missingQuotedTokenIds,['usn','wrap.near']);
  assert.equal(x.positions[0].healthFactorBps,null);
  assert.equal(x.mayBroadcast,false);
 }
});
test('oracle null quote blocks full position rather than pricing only known token',async()=>{
 const x=await inspectConfiguredOracleDenomination(fixture({missingPrice:true}).rpc,OPT);
 assert.equal(x.status,'INCOMPLETE_REFERENCE_VALUATION');
 assert.equal(x.positions[0].reason,'MISSING_CONFIGURED_ORACLE_TOKEN_QUOTE');
 assert.deepEqual(x.missingQuotedTokenIds,['usn']);
});
test('deployed contract config drift and cross-block reads fail hard',async()=>{
 await assert.rejects(inspectConfiguredOracleDenomination(fixture({configDrift:true}).rpc,OPT),/CODE_OR_ORACLE_POINTER_DRIFT/);
 await assert.rejects(inspectConfiguredOracleDenomination(fixture({wrongBlock:true}).rpc,OPT),/STAGE28_CROSS_BLOCK/);
});
test('balance/share mismatch never yields actual executable price',async()=>{
 const wrong={positions:{REGULAR:{...POSITION.positions.REGULAR,
 borrowed:[{...POSITION.positions.REGULAR.borrowed[0],balance:(5n*u).toString()}]}}};
 const x=await inspectConfiguredOracleDenomination(fixture({detail:wrong}).rpc,OPT);
 assert.equal(x.status,'INCOMPLETE_REFERENCE_VALUATION');
 assert.match(x.positions[0].reason,/SOURCE_SHARE_BALANCE_DRIFT/);
 assert.equal(x.profitVerified,false);
});
test('no borrower debt avoids oracle price RPC',async()=>{
 const {rpc,calls}=fixture({detail:{positions:{}}});
 const x=await inspectConfiguredOracleDenomination(rpc,OPT);
 assert.equal(x.status,'NO_DEBT');
 assert.equal(calls.filter(c=>c[2]==='get_price_data').length,0);
});
test('bad options fail before RPC; no signer and no broadcast',async()=>{
 for(const changed of [{nowMs:NOW-120000},{sanityMaxUsd:'0'},
  {maxQuoteAgeMs:200000},{expectedConfiguredOracleCodeHash:'wrong'}]){
  const {rpc,calls}=fixture();
  await assert.rejects(inspectConfiguredOracleDenomination(rpc,{...OPT,...changed}),/INVALID/);
  assert.equal(calls.length,0);
 }
});
test('CI remains read only and never asserts the configured oracle view is the execution path',async()=>{
 const {readFile}=await import('node:fs/promises');
 const w=await readFile(new URL('../.github/workflows/rhea-stage28-configured-oracle-valuation.yml',import.meta.url),'utf8');
 assert.ok(w.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(w.includes('.currentExecutionOracleBranchAttested == false'));
 assert.ok(w.includes('.mayBroadcast == false'));
 assert.ok(!w.includes('broadcast_tx'));
});
