import type { HealthScreenReport, PaperHealthPosition } from './health-screen.ts';
import { SOURCE_SCALE, sourceCheckLiquidationRules, sourceDivRatio, sourceMulRatio } from './source-math.ts';

/**
 * Stage 16: OFFLINE, read-only, source-formula-based liquidation scenario and
 * conservative-cost scoring. This is NOT the deployed Rhea contract, a quote,
 * a competitor estimator, or an executable order. All legs are hypothetical USD
 * E27 amounts supplied by the analyst, not protocol token quantities.
 */
const BPS = 10_000n;
const MAX_MONEY = 10n ** 52n;
const UINT = /^(0|[1-9][0-9]{0,52})$/;
const ID = /^[a-z0-9._-]{2,64}$/;
const POSITION = /^[A-Za-z0-9._:-]{1,100}$/;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const SCENARIO = /^[A-Za-z0-9._:-]{1,80}$/;
const COST_NAMES = ['networkMaxE27','fundingMaxE27','slippageMaxE27','protocolMaxE27','competitionBufferMaxE27'] as const;
export type PaperBlocker =
  | 'STALE_OR_CROSS_BLOCK_EVIDENCE' | 'BORROWER_HEALTH_NOT_AT_RISK' | 'HEALTH_EVIDENCE_BLOCKED'
  | 'POSITION_NOT_FOUND' | 'MISSING_LIQUIDITY_EVIDENCE' | 'LIQUIDITY_BELOW_REPAYMENT'
  | 'COST_BOUNDS_UNAVAILABLE' | 'COMPETITION_UNOBSERVED' | 'PUBLIC_OBSERVATION_STALE'
  | 'POSITION_BALANCE_EXCEEDED' | 'SOURCE_FORMULA_REJECTION' | 'PAPER_MARGIN_NOT_POSITIVE';
export interface ScenarioLeg {
  tokenId: string;
  /** Hypothetical 27-decimal USD value (not token quantity). */
  grossUsdE27: string;
  volatilityBps: number;
}
export interface ScenarioCosts {
  networkMaxE27: string;
  fundingMaxE27: string;
  slippageMaxE27: string;
  protocolMaxE27: string;
  competitionBufferMaxE27: string;
}
export interface PaperScenario {
  scenarioId: string;
  accountId: string;
  positionId: string;
  blockHeight: string;
  lendingCodeHash: string;
  oracleCodeHash: string;
  asOfFinalizedHeight: string;
  repay: ScenarioLeg[];
  seize: ScenarioLeg[];
  /** An operator-supplied hypothetical financing cap, never an on-chain solvency attestation. */
  fundingCapacityUsdE27: string | null;
  costs: ScenarioCosts | null;
  competition: {kind:'UNKNOWN'} | {kind:'PUBLIC_ACTIVITY_SAMPLE';blockHeight:string;sampledTransactions:number;exhaustive:false};
}
export interface PaperOpportunity {
  scenarioId: string;
  accountId: string;
  positionId: string;
  mode: 'HYPOTHETICAL_SOURCE_MATH_ONLY';
  classification: 'PAPER_POSITIVE_UNAPPROVED' | 'PAPER_NONPOSITIVE' | 'BLOCKED';
  blockers: PaperBlocker[];
  sourceFormulaReasons: string[];
  /** Null means that the entire cost model was not supplied and checked. */
  hypotheticalGrossUsdE27: string | null;
  hypotheticalNetAfterMaximumCostsUsdE27: string | null;
  hypotheticalRoiBps: string | null;
  paperRank: number | null;
  executionEnabled: false;
  liquidationEligible: false;
  profitabilityVerified: false;
  deployedContractParityVerified: false;
  competitionCountVerified: false;
  warnings: string[];
}
export interface PaperOpportunityReport {
  mode: 'NEAR_RHEA_OFFLINE_PAPER_OPPORTUNITY_SCORING';
  chain: 'NEAR_MAINNET';
  blockHeight: string;
  scenarioCount: number;
  paperPositive: number;
  paperNonpositive: number;
  blocked: number;
  records: PaperOpportunity[];
  executionEnabled: false;
  liquidationParityVerified: false;
  profitabilityVerified: false;
  warnings: string[];
}
function money(value:unknown,label:string):bigint {
  if(typeof value!=='string'||!UINT.test(value))throw Error(`invalid ${label} E27 money string`);
  const x=BigInt(value);if(x>MAX_MONEY)throw Error(`invalid ${label} money bound`);
  return x;
}
function height(value:unknown,label:string):bigint {
  if(typeof value!=='string'||!/^[1-9][0-9]{0,15}$/.test(value))throw Error(`invalid ${label}`);
  const n=BigInt(value);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error(`unsafe ${label}`);
  return n;
}
function nonempty(v:unknown,label:string,max:number):asserts v is ScenarioLeg[] {
  if(!Array.isArray(v)||v.length<1||v.length>max)throw Error(`invalid ${label} list`);
}
function parseLegs(v:ScenarioLeg[],role:'repay'|'seize'):{gross:bigint;adjusted:bigint} {
  nonempty(v,role,16);
  const seen=new Set<string>();let gross=0n,adjusted=0n;
  for(const leg of v){
    if(leg===null||typeof leg!=='object'||typeof leg.tokenId!=='string'||!ID.test(leg.tokenId)||seen.has(leg.tokenId))
      throw Error(`invalid or duplicate ${role} token`);
    seen.add(leg.tokenId);
    if(!Number.isSafeInteger(leg.volatilityBps)||leg.volatilityBps<1||leg.volatilityBps>10000)
      throw Error(`invalid ${role} volatility`);
    const usd=money(leg.grossUsdE27,`${role} gross`);if(usd===0n)throw Error(`${role} must be positive`);
    gross+=usd;
    adjusted+=role==='repay'?sourceDivRatio(usd,BigInt(leg.volatilityBps)):sourceMulRatio(usd,BigInt(leg.volatilityBps));
  }
  if(gross>MAX_MONEY||adjusted>MAX_MONEY)throw Error('scenario sum money bound');
  return {gross,adjusted};
}
function addUnique<T>(arr:T[],value:T):void {if(!arr.includes(value))arr.push(value);}
const ALWAYS = ['NOT_DEPLOYED_RHEA_LIQUIDATION_PARITY',
  'USD_LEGS_ARE_OPERATOR_HYPOTHESES_NOT_TOKEN_AMOUNT_SIMULATION',
  'GAS_LIQUIDITY_COMPETITION_ARE_NOT_VERIFIED_LIVE',
  'PAPER_RANK_IS_NOT_AN_EXECUTION_INSTRUCTION'];
function blocked(s:PaperScenario,reason:PaperBlocker[]=[]):PaperOpportunity {
  return {scenarioId:s.scenarioId,accountId:s.accountId,positionId:s.positionId,
    mode:'HYPOTHETICAL_SOURCE_MATH_ONLY',classification:'BLOCKED',blockers:reason,
    sourceFormulaReasons:[],hypotheticalGrossUsdE27:null,hypotheticalNetAfterMaximumCostsUsdE27:null,
    hypotheticalRoiBps:null,paperRank:null,executionEnabled:false,liquidationEligible:false,
    profitabilityVerified:false,deployedContractParityVerified:false,competitionCountVerified:false,
    warnings:[...ALWAYS]};
}
function validateScenario(s:PaperScenario):void {
  if(!s||typeof s!=='object'||typeof s.scenarioId!=='string'||!SCENARIO.test(s.scenarioId)||
    typeof s.accountId!=='string'||!ID.test(s.accountId)||
    typeof s.positionId!=='string'||!POSITION.test(s.positionId)||
    typeof s.lendingCodeHash!=='string'||!HASH.test(s.lendingCodeHash)||
    typeof s.oracleCodeHash!=='string'||!HASH.test(s.oracleCodeHash))throw Error('invalid scenario identity');
  height(s.blockHeight,'scenario block');height(s.asOfFinalizedHeight,'observation block');
  parseLegs(s.repay,'repay');parseLegs(s.seize,'seize');
  if(s.fundingCapacityUsdE27!==null)money(s.fundingCapacityUsdE27,'funding capacity');
  if(s.costs!==null){if(!s.costs||typeof s.costs!=='object')throw Error('invalid cost bounds');
    for(const key of COST_NAMES)money(s.costs[key],key);}
  if(!s.competition||typeof s.competition!=='object'||!['UNKNOWN','PUBLIC_ACTIVITY_SAMPLE'].includes(s.competition.kind))throw Error('invalid competition evidence');
  if(s.competition.kind==='PUBLIC_ACTIVITY_SAMPLE'){
    height(s.competition.blockHeight,'competition observation block');
    if(!Number.isSafeInteger(s.competition.sampledTransactions)||s.competition.sampledTransactions<0||
      s.competition.sampledTransactions>1_000_000||s.competition.exhaustive!==false)
      throw Error('invalid sampled competition evidence');
  }
}
function healthRecord(report:HealthScreenReport,s:PaperScenario):PaperHealthPosition|undefined {
  return report.records.find(x=>x.accountId===s.accountId&&x.positionId===s.positionId);
}
/** Sources: Stage 15 paper health and historical Burrow 27-decimal formulas.
 * Never constructs token instructions or marks any scenario trade-ready.
 */
export function scoreRheaPaperOpportunities(report:HealthScreenReport,scenarios:PaperScenario[],maxBlockLag=120):PaperOpportunityReport {
  if(!report||report.mode!=='READ_ONLY_RHEA_PAPER_HEALTH'||report.executionEnabled!==false||
    report.liquidationParityVerified!==false||report.priceParityVerified!==false||
    !HASH.test(report.lendingCodeHash)||!HASH.test(report.oracleCodeHash))throw Error('invalid unapproved health evidence report');
  height(report.blockHeight,'health report block');
  if(!Number.isSafeInteger(maxBlockLag)||maxBlockLag<0||maxBlockLag>1000)throw Error('invalid maxBlockLag');
  if(!Array.isArray(scenarios)||scenarios.length>100)throw Error('invalid scenario count');
  if(!Array.isArray(report.records)||report.records.length>10000)throw Error('invalid health records');
  const seen=new Set<string>(),uniquePositions=new Set<string>();
  for(const rec of report.records){
    if(!rec||typeof rec.accountId!=='string'||(rec.positionId!==null&&typeof rec.positionId!=='string')||
      !ID.test(rec.accountId)||(rec.positionId!==null&&!POSITION.test(rec.positionId)))throw Error('invalid health record identity');
    const key=`${rec.accountId}\u0000${rec.positionId}`;
    if(uniquePositions.has(key))throw Error('duplicate health position identity');
    uniquePositions.add(key);
  }
  const records:PaperOpportunity[]=[];
  for(const s of scenarios){
    validateScenario(s);
    if(seen.has(s.scenarioId))throw Error('duplicate scenario ID');seen.add(s.scenarioId);
    const blockers:PaperBlocker[]=[];
    const rec=healthRecord(report,s);
    const asOf=height(s.asOfFinalizedHeight,'as-of height'),at=height(s.blockHeight,'scenario height');
    if(at!==height(report.blockHeight,'report height')||s.lendingCodeHash!==report.lendingCodeHash||
      s.oracleCodeHash!==report.oracleCodeHash||asOf<at||asOf-at>BigInt(maxBlockLag))addUnique(blockers,'STALE_OR_CROSS_BLOCK_EVIDENCE');
    if(!rec){records.push(blocked(s,['POSITION_NOT_FOUND',...blockers]));continue;}
    if(rec.executionEnabled!==false||rec.liquidationEligible!==false||rec.liquidationParityVerified!==false||
      rec.estimatedProfit!==null||!Array.isArray(rec.blockers))throw Error('untrusted health record claims execution authority');
    if(rec.classification==='BLOCKED'||rec.blockers.length||rec.adjustedCollateralE27===null||rec.adjustedDebtE27===null)
      addUnique(blockers,'HEALTH_EVIDENCE_BLOCKED');
    else if(rec.classification!=='PAPER_AT_RISK_UNAPPROVED')addUnique(blockers,'BORROWER_HEALTH_NOT_AT_RISK');
    const repay=parseLegs(s.repay,'repay'),seize=parseLegs(s.seize,'seize');
    const beforeCollateral=rec.adjustedCollateralE27===null?null:money(rec.adjustedCollateralE27,'adjusted collateral');
    const beforeDebt=rec.adjustedDebtE27===null?null:money(rec.adjustedDebtE27,'adjusted debt');
    let rules:string[]=[];
    if(beforeCollateral!==null&&beforeDebt!==null){
      if(repay.adjusted>beforeDebt||seize.adjusted>beforeCollateral)addUnique(blockers,'POSITION_BALANCE_EXCEEDED');
      else{
        const src=sourceCheckLiquidationRules({beforeCollateralE27:beforeCollateral,beforeDebtE27:beforeDebt,
          afterCollateralE27:beforeCollateral-seize.adjusted,afterDebtE27:beforeDebt-repay.adjusted,
          repaidE27:repay.gross,seizedE27:seize.gross});
        rules=src.reasons;
        if(!src.validBySourceRules)addUnique(blockers,'SOURCE_FORMULA_REJECTION');
      }
    }
    if(s.fundingCapacityUsdE27===null)addUnique(blockers,'MISSING_LIQUIDITY_EVIDENCE');
    else if(money(s.fundingCapacityUsdE27,'funding')<repay.gross)addUnique(blockers,'LIQUIDITY_BELOW_REPAYMENT');
    if(s.costs===null)addUnique(blockers,'COST_BOUNDS_UNAVAILABLE');
    if(s.competition.kind==='UNKNOWN')addUnique(blockers,'COMPETITION_UNOBSERVED');
    else if(s.competition.blockHeight!==s.blockHeight)addUnique(blockers,'PUBLIC_OBSERVATION_STALE');
    // No value output if any required proof/budget is absent. Partial data must
    // never be transformed into a financially attractive-looking score.
    if(blockers.length){const row=blocked(s,blockers);row.sourceFormulaReasons=rules;records.push(row);continue;}
    let maximumCosts=0n;
    for(const key of COST_NAMES) maximumCosts+=money(s.costs![key],key);
    const gross=seize.gross-repay.gross;
    const net=gross-maximumCosts;
    const positive=net>0n;
    const roi=repay.gross===0n?null:net*BPS/repay.gross;
    records.push({scenarioId:s.scenarioId,accountId:s.accountId,positionId:s.positionId,
      mode:'HYPOTHETICAL_SOURCE_MATH_ONLY',
      classification:positive?'PAPER_POSITIVE_UNAPPROVED':'PAPER_NONPOSITIVE',
      blockers:positive?[]:['PAPER_MARGIN_NOT_POSITIVE'],sourceFormulaReasons:rules,
      hypotheticalGrossUsdE27:gross.toString(),hypotheticalNetAfterMaximumCostsUsdE27:net.toString(),
      hypotheticalRoiBps:roi?.toString()??null,paperRank:null,
      executionEnabled:false,liquidationEligible:false,profitabilityVerified:false,
      deployedContractParityVerified:false,competitionCountVerified:false,
      warnings:[...ALWAYS,'PUBLIC_COMPETITION_SAMPLE_IS_NONEXHAUSTIVE']});
  }
  const winners=records.filter(x=>x.classification==='PAPER_POSITIVE_UNAPPROVED').sort((a,b)=>{
    const aNet=BigInt(a.hypotheticalNetAfterMaximumCostsUsdE27!),bNet=BigInt(b.hypotheticalNetAfterMaximumCostsUsdE27!);
    return aNet===bNet?a.scenarioId.localeCompare(b.scenarioId):aNet>bNet?-1:1;
  });
  winners.forEach((x,i)=>{x.paperRank=i+1;});
  return {mode:'NEAR_RHEA_OFFLINE_PAPER_OPPORTUNITY_SCORING',chain:'NEAR_MAINNET',blockHeight:report.blockHeight,
    scenarioCount:records.length,paperPositive:winners.length,
    paperNonpositive:records.filter(x=>x.classification==='PAPER_NONPOSITIVE').length,
    blocked:records.filter(x=>x.classification==='BLOCKED').length,records,
    executionEnabled:false,liquidationParityVerified:false,profitabilityVerified:false,
    warnings:[...ALWAYS,'NO_ONCHAIN_EXECUTION_OR_PROFITABILITY_ATTESTATION']};
}
