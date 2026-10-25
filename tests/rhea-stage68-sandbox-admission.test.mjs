import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sizeStage35SourceLiquidation} from '../src/rhea/stage35-atomic-reference-sizing.ts';
import {buildStage37SandboxPlan} from '../src/rhea/stage37-sandbox-liquidation.ts';

const E27=10n**27n;
const mkLeg=(role,token,balance,ratio)=>{
 const value=BigInt(balance)*10n**21n;
 const adjusted=role==='borrowed'?value*10000n/BigInt(ratio):
  value*BigInt(ratio)/10000n;
 return {role,tokenId:token,shares:String(balance),
  balanceInternalAtomic:String(balance),priceMultiplier:'1',
  priceDecimals:6,extraDecimals:0,referenceUsdE27:String(value),
  referenceAdjustedUsdE27:String(adjusted)};
};
const evidence=()=>({
 mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
 status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',
 borrowerAccountId:'tiny-risk.near',blockHeight:'221444000',
 lendingCodeHash:'2'.repeat(43),pythOracleCodeHash:'3'.repeat(43),
 pythEnabled:true,legacyOracleEnabled:false,
 priceConstructionMatchesCurrentSdk:true,deployedMetadataAndConfigObserved:true,
 sourceWasmReproduciblyMatched:false,transactionReplayVerified:false,
 profitVerified:false,executionEnabled:false,maySign:false,mayBroadcast:false,
 candidatePositions:1,
 positions:[{
  positionId:'REGULAR',status:'PAPER_AT_RISK_UNAPPROVED',reason:null,
  adjustedCollateralE27:String(8n*E27/10n),
  adjustedDebtE27:String(9n*E27/10n),healthFactorBps:'8888',
  legs:[mkLeg('borrowed','debt.near',900000,10000),
   mkLeg('collateral','pledge.near',1000000,8000)],
 }],
});
const assets=()=>[
 ['debt.near',{config:{volatility_ratio:10000,can_borrow:true,can_withdraw:true},
  supplied:{balance:'3000000',shares:'3000000'},
  borrowed:{balance:'900000',shares:'900000'}}],
 ['pledge.near',{config:{volatility_ratio:8000,can_borrow:false,can_withdraw:true},
  supplied:{balance:'3000000',shares:'3000000'},
  borrowed:{balance:'0',shares:'0'}}],
];
const opts={borrowerAccountId:'tiny-risk.near',maxRepayBps:100};

test('Stage68 tests a legitimate sub-0.001 USD gross scenario only in isolated Sandbox',()=>{
 const old=sizeStage35SourceLiquidation(evidence(),assets(),{
  ...opts,minimumPaperGrossUsdE27:'1000000000000000000000000'});
 assert.equal(old.status,'NO_SAFE_SOURCE_SCENARIO');
 assert.ok(old.blockers.includes('SOURCE_VALID_SPREAD_BELOW_MINIMUM_PAPER_GROSS'));

 const candidate=sizeStage35SourceLiquidation(evidence(),assets(),{
  ...opts,minimumPaperGrossUsdE27:'1'});
 assert.equal(candidate.status,'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE');
 assert.equal(candidate.referenceRulesPass,true);
 assert.ok(BigInt(candidate.paperGrossUsdE27)>0n);
 assert.ok(BigInt(candidate.paperGrossUsdE27)<10n**24n);
 assert.ok(BigInt(candidate.referenceAfterHealthBps)>8888n);
 assert.ok(BigInt(candidate.referenceAfterHealthBps)<10000n);
 assert.equal(candidate.mainnetWalletApproved,false);
 assert.equal(candidate.gasAndSwapNetProfitVerified,false);
 assert.equal(candidate.mayBroadcast,false);
 const plan=buildStage37SandboxPlan(candidate);
 assert.equal(plan.chain,'NEAR_SANDBOX');
 assert.equal(plan.method,'execute_with_pyth');
 assert.equal(plan.maySignMainnet,false);
 assert.equal(plan.mayBroadcastMainnet,false);
 assert.equal(plan.executionEnabled,false);
});

test('Stage68 rejects tiny-spread proposals that do not satisfy real four-rule source math',()=>{
 const a=evidence();a.positions[0].legs[1]=mkLeg('collateral','pledge.near',899000,10000);
 a.positions[0].adjustedCollateralE27=String(899n*E27/1000n);
 a.positions[0].healthFactorBps=String(899n*10000n/900n);
 const pools=assets();pools[1][1].config.volatility_ratio=10000;
 const r=sizeStage35SourceLiquidation(a,pools,{...opts,minimumPaperGrossUsdE27:'1'});
 assert.equal(r.status,'NO_SAFE_SOURCE_SCENARIO');
 assert.equal(r.maySign,false);
 assert.equal(r.repay,null);
});

test('Stage68 is explicitly isolated; default threshold and independent settlement evidence remain',async()=>{
 const cli=await readFile(new URL('../src/rhea/stage38-live-candidate-cli.ts',import.meta.url),'utf8');
 const flow=await readFile(new URL('../.github/workflows/rhea-stage63-bounded-recovery.yml',import.meta.url),'utf8');
 assert.ok(cli.includes("e.NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(cli.includes('e.NEAR_PRIVATE_KEY'));
 assert.ok(cli.includes('e.MAINNET_PRIVATE_KEY'));
 assert.ok(cli.includes("sandboxGross??'1000000000000000000000000'"));
 assert.ok(flow.includes("RHEA_STAGE38_SANDBOX_MIN_PAPER_GROSS_USD_E27: '1'"));
 assert.ok(flow.includes('NEAR_WORKSPACES_NETWORK: sandbox'));
 assert.ok(flow.includes('positiveSourcePlans'));
 assert.ok(flow.includes('STAGE37_ALLOW_SANDBOX_MUTATION=true'));
 assert.ok(flow.includes('borrowerDebtDecreaseInternal'));
 assert.ok(flow.includes('actorSeizeFtIncreaseAtomic'));
 assert.ok(!flow.includes('broadcast_tx'));
});
