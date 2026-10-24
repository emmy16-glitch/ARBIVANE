import test from 'node:test';
import assert from 'node:assert/strict';
import {sizeStage35SourceLiquidation} from '../src/rhea/stage35-atomic-reference-sizing.ts';
const H='2'.repeat(43),P='3'.repeat(43),E27=10n**27n;
const source=(role,token,balance,vol)=>{
 const value=BigInt(balance)*10n**21n;
 const adjusted=role==='borrowed'?value*10000n/BigInt(vol):value*BigInt(vol)/10000n;
 return {role,tokenId:token,balanceInternalAtomic:String(balance),shares:String(balance),
  extraDecimals:0,priceSource:'PYTH',priceMultiplier:'1',priceDecimals:6,
  rawPythPrice:'1000000',pythExponent:-6,fractionDigits:6,tokenDecimals:6,ratioE24:null,
  referenceUsdE27:String(value),referenceAdjustedUsdE27:String(adjusted)};
};
const debt=()=>source('borrowed','usd-debt.near','900000000',10000);
const collateral=()=>source('collateral','collateral.near','1000000000',8000);
const assets=()=>[
 ['usd-debt.near',{config:{volatility_ratio:10000}}],
 ['collateral.near',{config:{volatility_ratio:8000}}],
];
const report=()=>{
 const legs=[debt(),collateral()];
 return {mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
  status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',borrowerAccountId:'godlike.near',
  blockHeight:'221444000',lendingCodeHash:H,pythOracleCodeHash:P,
  pythEnabled:true,legacyOracleEnabled:false,priceConstructionMatchesCurrentSdk:true,
  deployedMetadataAndConfigObserved:true,sourceWasmReproduciblyMatched:false,
  transactionReplayVerified:false,profitVerified:false,executionEnabled:false,
  maySign:false,mayBroadcast:false,candidatePositions:1,
  positions:[{positionId:'REGULAR',status:'PAPER_AT_RISK_UNAPPROVED',reason:null,
   adjustedCollateralE27:String(800n*E27),adjustedDebtE27:String(900n*E27),
   healthFactorBps:String(80000n/9n),legs}],
 };
};
const options={borrowerAccountId:'godlike.near',maxRepayBps:100,
 minimumPaperGrossUsdE27:'1000000000000000000000000'};
test('candidate sizing yields bounded positive gross and all four source rules without authority',()=>{
 const r=sizeStage35SourceLiquidation(report(),assets(),options);
 assert.equal(r.status,'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE');
 assert.equal(r.referenceRulesPass,true);
 assert.equal(r.repay.tokenId,'usd-debt.near');
 assert.equal(r.seize.tokenId,'collateral.near');
 assert.ok(BigInt(r.repay.amountLendingInternalAtomic)<=9_000_000n);
 assert.ok(BigInt(r.seize.amountLendingInternalAtomic)<=1_000_000_000n);
 assert.ok(BigInt(r.paperGrossUsdE27)>0n);
 assert.ok(BigInt(r.referenceAfterHealthBps)>BigInt(r.referenceInitialHealthBps));
 assert.ok(BigInt(r.referenceAfterHealthBps)<10000n);
 assert.equal(r.contractRouteParityVerified,false);
 assert.equal(r.rawTokenDenominationsVerified,false);
 assert.equal(r.sandboxStateReplaySucceeded,false);
 assert.equal(r.maySign,false);assert.equal(r.mayBroadcast,false);
});
test('healthy account cannot suggest a liquidation or nonzero amount',()=>{
 const x=report();
 x.positions[0].status='PAPER_HEALTHY_UNAPPROVED';
 x.positions[0].adjustedCollateralE27=String(1000n*E27);
 x.positions[0].healthFactorBps=String(100000n/9n);
 const r=sizeStage35SourceLiquidation(x,assets(),options);
 assert.equal(r.status,'NO_CURRENT_REFERENCE_RISK');
 assert.equal(r.repay,null);assert.equal(r.seize,null);
});
test('no paper spread above minimum is accepted as proof of profit',()=>{
 const r=sizeStage35SourceLiquidation(report(),assets(),{
  ...options,minimumPaperGrossUsdE27:String(300n*E27)});
 assert.equal(r.status,'NO_SAFE_SOURCE_SCENARIO');
 assert.equal(r.netProfitVerified,undefined);
 assert.equal(r.executionEnabled,false);
});
test('tampered live valuations, decimals, price or source hash cannot become sizing proposals',()=>{
 for(const mutation of [
  a=>{a.mayBroadcast=true;},a=>{a.positions[0].legs[0].referenceUsdE27='1';},
  a=>{a.positions[0].legs[0].referenceAdjustedUsdE27='1';},
  a=>{a.positions[0].healthFactorBps='9999';},
  a=>{a.positions[0].legs[1].priceDecimals=37;},
  a=>{a.positions[0].legs[1].priceMultiplier='0';},
  a=>{a.positions[0].adjustedDebtE27='5';},
  a=>{a.transactionReplayVerified=true;},
 ]){
  const a=report();mutation(a);
  assert.throws(()=>sizeStage35SourceLiquidation(a,assets(),options));
 }
});
test('bad volatility or unsafe repay budget is rejected',()=>{
 for(const n of [0,2000,10001]){
  const a=assets();a[1][1].config.volatility_ratio=n;
  assert.throws(()=>sizeStage35SourceLiquidation(report(),a,options));
 }
 for(const n of [0,3,201,1000])
  assert.throws(()=>sizeStage35SourceLiquidation(report(),assets(),{...options,maxRepayBps:n}));
});
test('Stage35 workflow never provides signing capability',async()=>{
 const {readFile}=await import('node:fs/promises');
 const w=await readFile(new URL('../.github/workflows/rhea-stage35-atomic-reference-sizing.yml',import.meta.url),'utf8');
 assert.ok(w.includes('godlike.near'));assert.ok(w.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(!w.includes('broadcast_tx'));assert.ok(!w.includes('NEAR_PRIVATE_KEY'));
});
