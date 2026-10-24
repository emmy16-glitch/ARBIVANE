import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectActivePythValuation,reconstructExecutionPythPrice} from '../src/rhea/execution-pyth-valuation.ts';
import {sourceDivRatio,sourceFromBalancePrice,sourceMulRatio} from '../src/rhea/source-math.ts';
import {readFile} from 'node:fs/promises';

const L='contract.main.burrow.near',O='aggregate-oracle.near',B='alice.near';
const LH='2'.repeat(43),OH='3'.repeat(43),H='221455999',NOW=Date.now(),E27=10n**27n;
const USDC='a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near';
const ST='meta-pool.near',USDC_FEED='a'.repeat(64),NEAR_FEED='b'.repeat(64);
const INTERNAL=10n**18n, NEAR_ATOMIC=10n**24n;
const ASSETS=[
 [USDC,{supplied:{shares:String(100n*INTERNAL),balance:String(100n*INTERNAL)},borrowed:{shares:String(100n*INTERNAL),balance:String(100n*INTERNAL)},config:{extra_decimals:12,volatility_ratio:9500}}],
 [ST,{supplied:{shares:String(100n*NEAR_ATOMIC),balance:String(100n*NEAR_ATOMIC)},borrowed:{shares:String(100n*NEAR_ATOMIC),balance:String(100n*NEAR_ATOMIC)},config:{extra_decimals:0,volatility_ratio:7000}}],
];
const DETAIL={positions:{REGULAR:{borrowed:[{token_id:USDC,shares:String(4n*INTERNAL),balance:String(4n*INTERNAL)}],collateral:[{token_id:ST,shares:NEAR_ATOMIC.toString(),balance:NEAR_ATOMIC.toString()}]}}};
const META={
 [USDC]:{decimals:6,fraction_digits:4,price_identifier:USDC_FEED,extra_call:null,default_price:null},
 [ST]:{decimals:24,fraction_digits:4,price_identifier:NEAR_FEED,extra_call:'get_st_near_price',default_price:null},
};
const OPT={lendingContract:L,pythOracle:O,borrowerAccountId:B,expectedLendingCodeHash:LH,
 expectedPythOracleCodeHash:OH,nowMs:NOW,maxConfidenceBps:150,sanityMaxUsd:'10000000',maxConcurrency:2};

function fixture({ratio='1250000000000000000000000',wrongBlock=false,pythEnabled=true,legacy=false,shareDrift=false}={}){
 const calls=[];
 const detail=structuredClone(DETAIL);
 if(shareDrift)detail.positions.REGULAR.borrowed[0].balance=String(5n*INTERNAL);
 const rpc={
  async viewAccount(id,h){calls.push(['account',id,h]);return {blockHeight:H,codeHash:id===L?LH:OH};},
  async view(id,method,args={},h){calls.push(['view',id,method,args,h]);
   let value;
   if(method==='get_config')value={enable_pyth_oracle:pythEnabled,enable_price_oracle:legacy,
    pyth_oracle_account_id:O,pyth_price_valid_duration_sec:60};
   else if(method==='get_assets_paged')value=ASSETS;
   else if(method==='get_all_token_pyth_infos')value=META;
   else if(method==='get_account_all_positions')value=detail;
   else if(method==='get_st_near_price')value=ratio;
   else if(method==='get_price_no_older_than')value=args.price_id===USDC_FEED?
    {price:'100012345',conf:'1000',expo:-8,publish_time:Math.floor((NOW-2000)/1000)}:
    {price:'500123456',conf:'10000',expo:-8,publish_time:Math.floor((NOW-2000)/1000)};
   return {blockHeight:wrongBlock&&method==='get_price_no_older_than'?'221456000':H,value};
  },
 };return {rpc,calls};
}

test('Pyth exponent becomes token decimals plus configured fraction digits, without floats',()=>{
 const p=reconstructExecutionPythPrice({rawPrice:'100012345',exponent:-8,tokenDecimals:6,fractionDigits:4});
 assert.equal(p.multiplier,10001n); // trunc(1.00012345 * 1e4)
 assert.equal(p.decimals,10);
 const d=reconstructExecutionPythPrice({rawPrice:'500123456',exponent:-8,tokenDecimals:24,fractionDigits:4,ratioE24:'1250000000000000000000000'});
 assert.equal(d.multiplier,62515n); // trunc(5.00123456 * 1.25 * 1e4)
 assert.equal(d.decimals,28);
});

test('active execute_with_pyth metadata yields plausible E27 position values',async()=>{
 const {rpc,calls}=fixture();
 const report=await inspectActivePythValuation(rpc,OPT);
 assert.equal(report.status,'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED');
 assert.equal(report.legacyOracleEnabled,false);assert.equal(report.pythEnabled,true);
 assert.equal(report.uniqueFeeds,2);assert.equal(report.extraCalls,1);
 const debtUsd=sourceFromBalancePrice(4n*INTERNAL,10001n,10,12);
 assert.equal(report.positions[0].adjustedDebtE27,sourceDivRatio(debtUsd,9500n).toString());
 // 1 stNEAR at derived $6.2515, adjusted by 70%.
 const collateralUsd=sourceFromBalancePrice(NEAR_ATOMIC,62515n,28,0);
 assert.equal(report.positions[0].adjustedCollateralE27,sourceMulRatio(collateralUsd,7000n).toString());
 const st=report.positions[0].legs.find(x=>x.tokenId===ST);
 assert.equal(st.priceSource,'PYTH_DERIVED');assert.equal(st.priceDecimals,28);
 assert.equal(st.ratioE24,'1250000000000000000000000');
 assert.equal(report.transactionReplayVerified,false);assert.equal(report.mayBroadcast,false);
 assert.equal(calls.filter(x=>x[2]==='get_price_no_older_than').length,2);
 assert.ok(calls.filter(x=>x[0]==='view').every(x=>x[4]===Number(H)));
});

test('share drift blocks valuation while cross-block and inactive Pyth fail hard',async()=>{
 const drift=await inspectActivePythValuation(fixture({shareDrift:true}).rpc,OPT);
 assert.equal(drift.status,'INCOMPLETE_ACTIVE_PYTH_VALUATION');
 assert.equal(drift.positions[0].reason,'SOURCE_SHARE_BALANCE_DRIFT');
 await assert.rejects(()=>inspectActivePythValuation(fixture({wrongBlock:true}).rpc,OPT),/CROSS_BLOCK/);
 await assert.rejects(()=>inspectActivePythValuation(fixture({pythEnabled:false,legacy:true}).rpc,OPT),/CONFIG_NOT_EXCLUSIVE/);
});

test('invalid price reconstruction never rounds a tiny quote up or accepts unsafe ratios',()=>{
 assert.throws(()=>reconstructExecutionPythPrice({rawPrice:'1',exponent:-20,tokenDecimals:6,fractionDigits:4}),/RECONSTRUCTED/);
 assert.throws(()=>reconstructExecutionPythPrice({rawPrice:'1',exponent:0,tokenDecimals:6,fractionDigits:4,ratioE24:'0'}),/ZERO_EXTRA/);
 assert.throws(()=>reconstructExecutionPythPrice({rawPrice:'1e8',exponent:-8,tokenDecimals:6,fractionDigits:4}),/INVALID_PYTH_PRICE/);
});

test('live evidence workflow is query-only and cannot authorize mainnet execution',async()=>{
 const yaml=await readFile(new URL('../.github/workflows/rhea-stage29-active-pyth-valuation.yml',import.meta.url),'utf8');
 assert.match(yaml,/EXECUTION_ENABLED: 'false'/);assert.match(yaml,/permissions:\n  contents: read/);
 assert.match(yaml,/mayBroadcast == false/);assert.match(yaml,/transactionReplayVerified == false/);
 assert.doesNotMatch(yaml,/private[_ -]?key|near transaction sign|send_tx|broadcast_tx/i);
});
