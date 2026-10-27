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
 ['usd-debt.near',{config:{volatility_ratio:10000,can_borrow:true,can_withdraw:true},
  supplied:{balance:'2000000000',shares:'2000000000'},
  borrowed:{balance:'900000000',shares:'900000000'}}],
 ['collateral.near',{config:{volatility_ratio:8000,can_borrow:false,can_withdraw:true},
  supplied:{balance:'2000000000',shares:'2000000000'},
  borrowed:{balance:'0',shares:'0'}}],
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
 for(const n of [0,3,1001,10000])
  assert.throws(()=>sizeStage35SourceLiquidation(report(),assets(),{...options,maxRepayBps:n}));
});
test('Stage35 workflow never provides signing capability',async()=>{
 const {readFile}=await import('node:fs/promises');
 const w=await readFile(new URL('../.github/workflows/rhea-stage35-atomic-reference-sizing.yml',import.meta.url),'utf8');
 assert.ok(w.includes('godlike.near'));assert.ok(w.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(!w.includes('broadcast_tx'));assert.ok(!w.includes('NEAR_PRIVATE_KEY'));
});

test('Stage57 refuses disabled Rhea Borrow and disabled seized-asset Withdraw without attempting a transaction',()=>{
 const noBorrow=assets();
 noBorrow[0][1].config.can_borrow=false;
 const a=sizeStage35SourceLiquidation(report(),noBorrow,options);
 assert.equal(a.status,'NO_SAFE_SOURCE_SCENARIO');
 assert.equal(a.repay,null);
 assert.equal(a.mayBroadcast,false);
 const noWithdraw=assets();
 noWithdraw[1][1].config.can_withdraw=false;
 const b=sizeStage35SourceLiquidation(report(),noWithdraw,options);
 assert.equal(b.status,'NO_SAFE_SOURCE_SCENARIO');
 assert.equal(b.seize,null);
 const unknown=assets();
 delete unknown[1][1].config.can_withdraw;
 assert.equal(sizeStage35SourceLiquidation(report(),unknown,options).status,
  'NO_SAFE_SOURCE_SCENARIO');
});
test('Stage57 bounds proposed Rhea borrow by actual pinned pool supply-minus-debt headroom',()=>{
 const limited=assets();
 limited[0][1].supplied.balance='904000000';
 const out=sizeStage35SourceLiquidation(report(),limited,options);
 assert.equal(out.status,'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE');
 assert.equal(out.repay.amountLendingInternalAtomic,'4000000');
 assert.equal(out.rawTokenDenominationsVerified,false);
 assert.equal(out.gasAndSwapNetProfitVerified,false);
 const depleted=assets();
 depleted[0][1].supplied.balance='900000000';
 const blocked=sizeStage35SourceLiquidation(report(),depleted,options);
 assert.equal(blocked.status,'NO_SAFE_SOURCE_SCENARIO');
});
test('Stage57 fails closed on malformed market pool balances and false permissions',()=>{
 for(const bad of [
  a=>a[0][1].supplied.balance='-1',
  a=>a[0][1].borrowed.balance='not_an_amount',
  a=>a[1][1].config.can_withdraw='true',
  a=>a[0][1].config.can_borrow=null
 ]){
  const rows=assets();bad(rows);
  assert.throws(()=>sizeStage35SourceLiquidation(report(),rows,options));
 }
});

test('Stage57 preserves valid alternative collateral when higher-priority source asset cannot withdraw',()=>{
 const r=report();
 const halfBad=source('collateral','collateral.near','500000000',8000);
 const halfGood=source('collateral','goodcollateral.near','500000000',8000);
 r.positions[0].legs=[debt(),halfBad,halfGood];
 const pairs=assets();
 pairs[1][1].config.can_withdraw=false;
 pairs.push(['goodcollateral.near',{
  config:{volatility_ratio:8000,can_borrow:false,can_withdraw:true},
  supplied:{balance:'1000000000',shares:'1000000000'},
  borrowed:{balance:'0',shares:'0'}
 }]);
 const out=sizeStage35SourceLiquidation(r,pairs,options);
 assert.equal(out.status,'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE');
 assert.equal(out.repay.tokenId,'usd-debt.near');
 assert.equal(out.seize.tokenId,'goodcollateral.near');
 assert.equal(out.consideredPairs,2);
 assert.equal(out.maySign,false);
});

test('Stage64 preserves tiny legitimate near-threshold liquidation discounts instead of erasing their gross spread',()=>{
 const candidate=report();
 // Source collateral adjusted $897.48 against $900 debt: 99.72% health
 // and only 14 bps of the theoretical liquidation discount.
 candidate.positions[0].legs=[debt(),source('collateral','collateral.near','1121850000',8000)];
 candidate.positions[0].adjustedCollateralE27=String(89748n*E27/100n);
 candidate.positions[0].healthFactorBps='9972';
 const result=sizeStage35SourceLiquidation(candidate,assets(),options);
 assert.equal(result.status,'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE');
 assert.equal(result.referenceRulesPass,true);
 assert.ok(BigInt(result.referenceInitialDiscountE27)*10000n/E27<75n);
 assert.ok(BigInt(result.seize.referenceUsdE27)>BigInt(result.repay.referenceUsdE27));
 assert.ok(BigInt(result.paperGrossUsdE27)>=BigInt(options.minimumPaperGrossUsdE27));
 assert.ok(BigInt(result.referenceAfterHealthBps)>9972n);
 assert.ok(BigInt(result.referenceAfterHealthBps)<10000n);
 assert.equal(result.contractRouteParityVerified,false);
 assert.equal(result.mainnetWalletApproved,false);
 assert.equal(result.mayBroadcast,false);
});

test('Stage64 cannot manufacture a profitable source-valid scenario where liquidation worsens health',()=>{
 const candidate=report();
 candidate.positions[0].legs=[debt(),source('collateral','collateral.near','899000000',10000)];
 candidate.positions[0].adjustedCollateralE27=String(899n*E27);
 candidate.positions[0].healthFactorBps=String(899n*10000n/900n);
 const pools=assets();
 pools[1][1].config.volatility_ratio=10000;
 const result=sizeStage35SourceLiquidation(candidate,pools,options);
 assert.equal(result.status,'NO_SAFE_SOURCE_SCENARIO');
 assert.equal(result.referenceRulesPass,false);
 assert.equal(result.repay,null);
 assert.equal(result.seize,null);
 assert.equal(result.maySign,false);
});

test('Stage65 rescues a source-valid small repayment when max repayment would cure borrower health',()=>{
 const candidate=report();
 candidate.positions[0].legs=[
  source('borrowed','usd-debt.near','10000000000',10000),
  source('collateral','collateral.near','12487500000',8000),
 ];
 candidate.positions[0].adjustedCollateralE27=String(9990n*E27);
 candidate.positions[0].adjustedDebtE27=String(10000n*E27);
 candidate.positions[0].healthFactorBps='9990';
 const pools=assets();
 pools[0][1].supplied.balance='20000000000';
 pools[0][1].borrowed.balance='10000000000';
 pools[1][1].supplied.balance='20000000000';
 const result=sizeStage35SourceLiquidation(candidate,pools,options);
 assert.equal(result.status,'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE');
 assert.equal(result.referenceRulesPass,true);
 assert.ok(BigInt(result.repay.referenceUsdE27)<100n*E27,
  'max capped repayment heals borrower; only a smaller valid repayment qualifies');
 assert.ok(BigInt(result.paperGrossUsdE27)>=BigInt(options.minimumPaperGrossUsdE27));
 assert.ok(BigInt(result.referenceAfterHealthBps)>=9990n);
 assert.ok(BigInt(result.referenceAfterHealthBps)<10000n);
 assert.equal(result.maySign,false);
 assert.equal(result.mayBroadcast,false);
 assert.equal(result.sandboxStateReplaySucceeded,false);
});
test('Stage65 returns concrete denial reason without fabricating a liquidation',()=>{
 const stopped=assets();
 stopped[0][1].config.can_borrow=false;
 const blocked=sizeStage35SourceLiquidation(report(),stopped,options);
 assert.equal(blocked.status,'NO_SAFE_SOURCE_SCENARIO');
 assert.ok(blocked.blockers.includes('NO_BORROW_WITHDRAW_PERMITTED_ASSET_PAIR'));
 assert.equal(blocked.repay,null);
 const empty=assets();
 empty[0][1].supplied.balance=empty[0][1].borrowed.balance;
 const noReserve=sizeStage35SourceLiquidation(report(),empty,options);
 assert.ok(noReserve.blockers.includes('NO_SOURCE_POOL_BORROW_HEADROOM'));
 assert.equal(noReserve.executionEnabled,false);
 assert.equal(noReserve.mayBroadcast,false);
});

test('Stage162 only sizes executable LiNEAR/LiNEAR pairs when required by the caller',()=>{
 const unrestricted=sizeStage35SourceLiquidation(report(),assets(),options);
 assert.equal(unrestricted.status,'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE');
 const filtered=sizeStage35SourceLiquidation(report(),assets(),{
  ...options,requiredSameTokenId:'linear-protocol.near'});
 assert.equal(filtered.status,'NO_SAFE_SOURCE_SCENARIO');
 assert.ok(filtered.blockers.includes('NO_MATCHING_SUPPORTED_SAME_TOKEN_ROUTE'));
 assert.equal(filtered.repay,null);
 assert.equal(filtered.consideredPairs,1);
 assert.throws(()=>sizeStage35SourceLiquidation(report(),assets(),{
  ...options,requiredSameTokenId:'wrap.near'}),/UNTRUSTED_STAGE35_LIVE_SOURCE_EVIDENCE/);
});
test('Stage162 can still size an authentic LiNEAR same-token source pair without changing source rules',()=>{
 const p=report();
 p.positions[0].legs=[
  source('borrowed','linear-protocol.near','900000000',9000),
  source('collateral','linear-protocol.near','1000000000',9000),
 ];
 p.positions[0].adjustedCollateralE27=(900n*E27).toString();
 p.positions[0].adjustedDebtE27=(1000n*E27).toString();
 p.positions[0].healthFactorBps='9000';
 const a=[['linear-protocol.near',{
  config:{volatility_ratio:9000,can_borrow:true,can_withdraw:true},
  supplied:{balance:'3000000000',shares:'3000000000'},
  borrowed:{balance:'900000000',shares:'900000000'}
 }]];
 const result=sizeStage35SourceLiquidation(p,a,{
  ...options,requiredSameTokenId:'linear-protocol.near',
  minimumPaperGrossUsdE27:'1'});
 assert.equal(result.status,'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE');
 assert.equal(result.repay.tokenId,'linear-protocol.near');
 assert.equal(result.seize.tokenId,'linear-protocol.near');
 assert.equal(result.referenceRulesPass,true);
 assert.equal(result.executionEnabled,false);
 assert.equal(result.mayBroadcast,false);
});
