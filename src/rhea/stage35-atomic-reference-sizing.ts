import {sourceFromBalancePrice,sourceComputeDiscount,sourceMulRatio,sourceDivRatio,
 sourceCheckLiquidationRules,SOURCE_SCALE} from './source-math.ts';
import type {ExecutionPythValuationReport} from './execution-pyth-valuation.ts';

/** Stage35: produce bounded *reference internal-lending-unit* liquidation
 * scenarios from REAL active-Pyth borrower legs at one finalized block.
 *
 * This is not raw NEP-141 token units and must never become a transaction
 * instruction without independently verified current contract state replay.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const U128=(1n<<128n)-1n;
const MAX_BPS=10_000n;
const usd=(v:unknown,name:string,max=U128):bigint=>{
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>max)throw Error('INVALID_'+name);
 return BigInt(v);
};
function obj(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_ASSET_CONFIG');
 return v as Record<string,unknown>;
}
export interface ReferenceLeg {
 tokenId:string;amountLendingInternalAtomic:string;referenceUsdE27:string;
 shareToActualTokenAtomicConversionVerified:false;fundsAvailabilityVerified:false;
}
export interface SourceLiquidationSizing {
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING';
 chain:'NEAR_MAINNET';borrowerAccountId:string;blockHeight:string;
 status:'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'|'NO_SAFE_SOURCE_SCENARIO'|'NO_CURRENT_REFERENCE_RISK';
 lendingCodeHash:string;pythOracleCodeHash:string;
 positionId:string|null;referenceInitialHealthBps:string|null;
 referenceInitialDiscountE27:string|null;
 repay:ReferenceLeg|null;seize:ReferenceLeg|null;
 paperGrossUsdE27:string|null;referenceRulesPass:boolean;
 referenceAfterHealthBps:string|null;consideredPairs:number;
 contractRouteParityVerified:false;rawTokenDenominationsVerified:false;
 sandboxStateReplaySucceeded:false;gasAndSwapNetProfitVerified:false;
 walletCapitalVerified:false;mainnetWalletApproved:false;
 executionEnabled:false;maySign:false;mayBroadcast:false;
 blockers:string[];
}
interface Leg {
 token:string;amount:bigint;mult:bigint;decimals:number;extra:number;
 priceUsd:bigint;adjusted:bigint;vol:bigint;role:'borrowed'|'collateral';
}
interface ActionablePool {
 volatility:bigint;canBorrow:boolean;canWithdraw:boolean;borrowCapacityInternal:bigint;
}
/** Same pinned asset rows used in Stage49/50: never propose a route the
 * deployed lender itself marks Borrow/Withdraw disabled. The pool headroom
 * is only an accounting ceiling; the actual FT vault is checked separately.
 */
function actionablePools(assets:unknown):Map<string,ActionablePool>{
 if(!Array.isArray(assets)||assets.length===0||assets.length>256)
  throw Error('INVALID_PINNED_ASSETS');
 const m=new Map<string,ActionablePool>();
 for(const row of assets){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||
   !ID.test(row[0])||m.has(row[0]))throw Error('INVALID_ASSET_ROW');
  const raw=obj(row[1]),cfg=obj(raw.config);
  const v=cfg.volatility_ratio;
  if((typeof v!=='string'&&typeof v!=='number')||!/^[1-9][0-9]{0,4}$/.test(String(v)))
   throw Error('INVALID_ASSET_VOLATILITY');
  const volatility=BigInt(v);
  if(volatility>MAX_BPS)throw Error('INVALID_ASSET_VOLATILITY');
  for(const k of ['can_borrow','can_withdraw'] as const)
   if(cfg[k]!==undefined&&typeof cfg[k]!=='boolean')
    throw Error('INVALID_ASSET_PERMISSION');
  const supplied=usd(obj(raw.supplied).balance,'SUPPLIED_POOL_BALANCE');
  const borrowed=usd(obj(raw.borrowed).balance,'BORROWED_POOL_BALANCE');
  // Source-pinned headroom is deliberately only indicative; Stage50 requires
  // independently observed on-chain NEP-141 lending-vault inventory.
  m.set(row[0],{volatility,
   canBorrow:cfg.can_borrow===true,canWithdraw:cfg.can_withdraw===true,
   borrowCapacityInternal:supplied>borrowed?supplied-borrowed:0n});
 }
 return m;
}
function boundedNumber(x:unknown,name:string,max=36):number{
 if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0||x>max)
  throw Error('INVALID_'+name);
 return x;
}
function positionLegs(p:ExecutionPythValuationReport['positions'][number],vol:Map<string,ActionablePool>):Leg[]{
 const seen=new Set<string>();
 return p.legs.map(x=>{
  if(!ID.test(x.tokenId)||!['borrowed','collateral'].includes(x.role)||seen.has(x.role+':'+x.tokenId))
   throw Error('INVALID_LENDING_ASSET_LEG');
  seen.add(x.role+':'+x.tokenId);
  const ratio=vol.get(x.tokenId)?.volatility;
  if(ratio===undefined)throw Error('MISSING_LENDING_VOLATILITY');
  const amount=usd(x.balanceInternalAtomic,'INTERNAL_BALANCE');
  const shares=usd(x.shares,'SHARES');
  if(shares===0n||amount===0n)throw Error('EMPTY_ASSET_SHARES');
  const mult=usd(x.priceMultiplier,'PYTH_MULTIPLIER'),decimals=boundedNumber(x.priceDecimals,'PRICE_DECIMALS'),
   extra=boundedNumber(x.extraDecimals,'EXTRA_DECIMALS');
  const derived=sourceFromBalancePrice(amount,mult,decimals,extra);
  const observed=usd(x.referenceUsdE27,'REFERENCE_USD'),adjusted=usd(x.referenceAdjustedUsdE27,'ADJUSTED_USD');
  if(derived!==observed||(x.role==='borrowed'?sourceDivRatio(derived,ratio):sourceMulRatio(derived,ratio))!==adjusted)
   throw Error('UNRECONCILED_REFERENCE_LEG_UNITS');
  return {token:x.tokenId,amount,mult,decimals,extra,priceUsd:observed,
   adjusted,vol:ratio,role:x.role as 'borrowed'|'collateral'};
 });
}
function asValue(units:bigint,leg:Leg):bigint{
 return sourceFromBalancePrice(units,leg.mult,leg.decimals,leg.extra);
}
/** Largest lending-internal balance whose *reference* USD value <= target.
 * Binary search never assumes token decimals or float prices.
 */
function maxInternalAmount(leg:Leg,target:bigint):bigint{
 let low=0n,high=leg.amount;
 while(low<high){
  const mid=(low+high+1n)/2n;
  if(asValue(mid,leg)<=target)low=mid;else high=mid-1n;
 }
 return low;
}
const failure=(r:ExecutionPythValuationReport,pid:string|null,pairs:number,blockers:string[]):SourceLiquidationSizing=>({
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',chain:'NEAR_MAINNET',
 borrowerAccountId:r.borrowerAccountId,blockHeight:r.blockHeight,
 lendingCodeHash:r.lendingCodeHash,pythOracleCodeHash:r.pythOracleCodeHash,
 status:r.positions.every(x=>x.status!=='PAPER_AT_RISK_UNAPPROVED')?'NO_CURRENT_REFERENCE_RISK':'NO_SAFE_SOURCE_SCENARIO',
 positionId:pid,referenceInitialHealthBps:null,referenceInitialDiscountE27:null,
 repay:null,seize:null,paperGrossUsdE27:null,referenceAfterHealthBps:null,
 consideredPairs:pairs,referenceRulesPass:false,
 contractRouteParityVerified:false,rawTokenDenominationsVerified:false,
 sandboxStateReplaySucceeded:false,gasAndSwapNetProfitVerified:false,
 walletCapitalVerified:false,mainnetWalletApproved:false,
 executionEnabled:false,maySign:false,mayBroadcast:false,blockers
});
export function sizeStage35SourceLiquidation(
 evidence:ExecutionPythValuationReport,assets:unknown,
 options:{borrowerAccountId:string;maxRepayBps:number;minimumPaperGrossUsdE27:string},
):SourceLiquidationSizing{
 if(!evidence||evidence.mode!=='RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION'||
 evidence.chain!=='NEAR_MAINNET'||evidence.borrowerAccountId!==options.borrowerAccountId||
 !ID.test(options.borrowerAccountId)||!UINT.test(evidence.blockHeight)||
 evidence.status!=='ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED'||
 evidence.pythEnabled!==true||evidence.legacyOracleEnabled!==false||
 evidence.priceConstructionMatchesCurrentSdk!==true||evidence.deployedMetadataAndConfigObserved!==true||
 evidence.sourceWasmReproduciblyMatched!==false||evidence.transactionReplayVerified!==false||
 evidence.profitVerified!==false||evidence.executionEnabled!==false||
 evidence.maySign!==false||evidence.mayBroadcast!==false||
 !Array.isArray(evidence.positions)||evidence.positions.length===0||
 evidence.positions.length!==evidence.candidatePositions||
 !Number.isSafeInteger(options.maxRepayBps)||options.maxRepayBps<5||options.maxRepayBps>200)
  throw Error('UNTRUSTED_STAGE35_LIVE_SOURCE_EVIDENCE');
 const minGross=usd(options.minimumPaperGrossUsdE27,'MINIMUM_PAPER_GROSS');
 const vol=actionablePools(assets);
 let best:{p:typeof evidence.positions[number];repay:Leg;seize:Leg;
  qtyIn:bigint;qtyOut:bigint;repaidUsd:bigint;seizedUsd:bigint;
  newC:bigint;newD:bigint;discount:bigint;gross:bigint}|null=null;
 let considered=0;
 let permittedPairs=0,liquidPairs=0,ruleValidPairs=0,positiveGrossPairs=0;
 for(const p of evidence.positions){
  if(p.status!=='PAPER_AT_RISK_UNAPPROVED')continue;
  if(!/^[A-Za-z0-9._:-]{1,100}$/.test(p.positionId)||p.reason!==null||
   p.healthFactorBps===null||!UINT.test(p.healthFactorBps))
   throw Error('INCONSISTENT_RISK_POSITION');
  const c=usd(p.adjustedCollateralE27,'COLLATERAL_E27'),d=usd(p.adjustedDebtE27,'DEBT_E27');
  if(d<=c||d===0n||BigInt(p.healthFactorBps)!==c*10000n/d)
   throw Error('FALSE_PAPER_RISK_HEALTH');
  const legs=positionLegs(p,vol);
  const sumC=legs.filter(x=>x.role==='collateral').reduce((s,x)=>s+x.adjusted,0n);
  const sumD=legs.filter(x=>x.role==='borrowed').reduce((s,x)=>s+x.adjusted,0n);
  if(sumC!==c||sumD!==d)throw Error('REFERENCE_POSITION_SUM_DRIFT');
  const discount=sourceComputeDiscount(c,d);
  if(discount===0n)throw Error('ZERO_LIQUIDATION_DISCOUNT');
  for(const debt of legs.filter(x=>x.role==='borrowed')){
   for(const collateral of legs.filter(x=>x.role==='collateral')){
    considered++;
    if(considered>256)throw Error('EXCESSIVE_LIQUIDATION_PAIRS');
    // A high paper spread is worthless if Rhea has disabled Borrow or
    // Withdraw for either asset. Do not discard other valid pairs because
    // the highest reference-profit pair would fail the deployed preflight.
    const debtPool=vol.get(debt.token),collateralPool=vol.get(collateral.token);
    if(!debtPool?.canBorrow||!collateralPool?.canWithdraw)continue;
    const budget=debt.amount*BigInt(options.maxRepayBps)/MAX_BPS;
    // Bound the proposed repayment by actual pinned supply minus outstanding
    // borrow pool balances; actual transferable FT reserve remains unverified.
    permittedPairs++;
    const maxAmount=budget<debtPool.borrowCapacityInternal?
     budget:debtPool.borrowCapacityInternal;
    if(maxAmount===0n)continue;
    liquidPairs++;
    // Stage64: a single fixed 99.25%-of-maximum seize forfeits every
    // small but positive spread below 0.75%, even when the source's four
    // rules permit a valid liquidation. Probe near the *conservative* cap
    // and progressively smaller sizes; never raise the source cap.
    // Fractional repay sizes also protect against share rounding, liquidity
    // headroom and post-liquidation health changing nonlinearly.
    let pairRules=false,pairGross=false;
    for(const repayBps of [10000n,7500n,5000n,2500n,1000n,250n]){
     const amount=maxAmount*repayBps/MAX_BPS;
     if(amount===0n)continue;
     const repaidUsd=asValue(amount,debt);
     if(repaidUsd===0n)continue;
     for(const seizeBps of [9999n,9995n,9990n,9975n,9950n,9925n,9900n,9800n]){
      const target=(repaidUsd*SOURCE_SCALE/(SOURCE_SCALE-discount))*seizeBps/MAX_BPS;
      let seizedQty=maxInternalAmount(collateral,target);
      if(seizedQty===0n)continue;
      for(let attempt=0;attempt<14&&seizedQty>0n;attempt++){
       const seizedUsd=asValue(seizedQty,collateral);
       const repayAdjusted=sourceDivRatio(repaidUsd,debt.vol);
       const seizeAdjusted=sourceMulRatio(seizedUsd,collateral.vol);
       if(repayAdjusted>=d||seizeAdjusted>=c){seizedQty/=2n;continue;}
       const newC=c-seizeAdjusted,newD=d-repayAdjusted;
       const source=sourceCheckLiquidationRules({
        beforeCollateralE27:c,beforeDebtE27:d,afterCollateralE27:newC,afterDebtE27:newD,
        repaidE27:repaidUsd,seizedE27:seizedUsd});
       const gross=seizedUsd-repaidUsd;
       if(source.validBySourceRules){
        pairRules=true;
        if(gross>0n)pairGross=true;
        if(gross>=minGross&&gross>0n&&(!best||gross>best.gross))
         best={p,repay:debt,seize:collateral,qtyIn:amount,qtyOut:seizedQty,
          repaidUsd,seizedUsd,newC,newD,discount,gross};
        // Less collateral seizure cannot improve gross once rules pass.
        break;
       }
       // Fail closed on each invalid post-state, never loosen the four rules.
       seizedQty/=2n;
      }
     }
    }
    if(pairRules)ruleValidPairs++;
    if(pairGross)positiveGrossPairs++;
   }
  }
 }
 if(!best)return failure(evidence,null,considered,[
  permittedPairs===0?'NO_BORROW_WITHDRAW_PERMITTED_ASSET_PAIR':
  liquidPairs===0?'NO_SOURCE_POOL_BORROW_HEADROOM':
  ruleValidPairs===0?'FOUR_RULES_REJECTED_ALL_SIZED_PAIRS':
  positiveGrossPairs===0?'FOUR_RULES_PASS_BUT_NO_POSITIVE_GROSS':
  'POSITIVE_GROSS_BELOW_CONFIGURED_MINIMUM',
  'NO_UNVERIFIED_4_RULE_SCENARIO_WITH_POSITIVE_PAPER_SPREAD',
  'DEPLOYED_RULES_SOURCE_WASM_REPLAY_FINANCING_AND_CAPITAL_UNVERIFIED']);
 return {mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',chain:'NEAR_MAINNET',
 status:'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE',
 borrowerAccountId:evidence.borrowerAccountId,blockHeight:evidence.blockHeight,
 lendingCodeHash:evidence.lendingCodeHash,pythOracleCodeHash:evidence.pythOracleCodeHash,
 positionId:best.p.positionId,referenceInitialHealthBps:best.p.healthFactorBps,
 referenceInitialDiscountE27:best.discount.toString(),
 repay:{tokenId:best.repay.token,amountLendingInternalAtomic:best.qtyIn.toString(),
  referenceUsdE27:best.repaidUsd.toString(),shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false},
 seize:{tokenId:best.seize.token,amountLendingInternalAtomic:best.qtyOut.toString(),
  referenceUsdE27:best.seizedUsd.toString(),shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false},
 paperGrossUsdE27:best.gross.toString(),referenceRulesPass:true,
 referenceAfterHealthBps:(best.newC*MAX_BPS/best.newD).toString(),consideredPairs:considered,
 contractRouteParityVerified:false,rawTokenDenominationsVerified:false,
 sandboxStateReplaySucceeded:false,gasAndSwapNetProfitVerified:false,
 walletCapitalVerified:false,mainnetWalletApproved:false,
 executionEnabled:false,maySign:false,mayBroadcast:false,
 blockers:['PREVIEW_LENDING_INTERNAL_UNITS_NOT_WALLET_NE_P141_ATOMIC_AMOUNTS',
  'DEPLOYED_EXECUTE_WITH_PYTH_LIQUIDATE_RULES_AND_LOAN_FUNDING_NOT_ATTESTED',
  'PINNED_BORROW_WITHDRAW_PERMISSIONS_AND_POOL_HEADROOM_SCREENED_NOT_FT_RESERVE_PROOF',
  'REQUIRES_IDENTICAL_STATE_SANDBOX_LIQUIDATION_AND_BALANCE_REPLAY',
  'NO_EXECUTABLE_SWAP_QUOTES_NETWORK_GAS_OR_REALIZED_NET_PROFIT',
  'MAINNET_SIGNER_OWNER_APPROVAL_AND_EXPOSURE_LIMITS_NOT_PROVIDED']};
}
