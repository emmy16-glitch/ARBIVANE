import type {Stage26Health,LiveHealthRow} from './current-borrower-health.ts';

/** Stage 27: deterministic gate BEFORE sandbox state import and before any replay.
 * Stage 26 uses archived-source E27 valuation. Do not assume this is current
 * executable USD denomination or tradable notional. No amount construction.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const INT=/^(0|[1-9][0-9]{0,119})$/;
const HEIGHT=/^[1-9][0-9]{0,15}$/;
const E27=10n**27n;
export interface Stage27GateSettings {
 latestFinalizedHeight:string;
 maxEvidenceBlockLag:number;
 /** Reject grossly implausible source valuation until decimals/execution parity is verified. */
 maxUnverifiedAdjustedPositionUsd:string;
}
export interface Stage27RowAudit {
 positionId:string;referenceHealthBps:string|null;
 adjustedCollateralE27:string|null;adjustedDebtE27:string|null;
 referenceCollateralAboveSanityCap:boolean|null;
 referenceDebtAboveSanityCap:boolean|null;
 referenceNumbersReconcile:boolean|null;
 paperAtRisk:boolean;estimatedRepayAmountAtomic:null;
 projectedCollateralAtomic:null;estimatedRealNetUsd:null;
}
export interface Stage27Gate {
 mode:'RHEA_STAGE27_REPLAY_ADMISSION_GATE';chain:'NEAR_MAINNET';
 status:'BLOCKED_VALUE_SANITY'|'BLOCKED_STALE_EVIDENCE'|'BLOCKED_INCOMPLETE_EVIDENCE'|'BLOCKED_PENDING_SANDBOX_REPLAY';
 borrowerAccountId:string;blockHeight:string;asOfFinalizedHeight:string;blockLag:number;
 lendingCodeHash:string;oracleCodeHash:string;configuredOracleCodeHash:string;
 referenceValuationScale:'E27_UNVERIFIED_EXECUTION_USD_EQUIVALENCE';
 referenceSanityCapUsd:string;
 paperAtRiskCount:number;implausiblyValuedPositions:number;
 positions:Stage27RowAudit[];
 mayAttemptStateImport:boolean;
 stateImportCompleted:false;stateStorageParityVerified:false;
 contractTransactionReplayed:false;transactionSucceeded:null;
 gasMeasured:null;realizedProfitUsd:null;
 configuredOracleExecutionParityVerified:false;
 walletFundingVerified:false;liveLiquidationEligible:false;
 executionEnabled:false;maySign:false;mayBroadcast:false;
 blockers:string[];
}
function parseUint(v:unknown,name:string):bigint {
 if(typeof v!=='string'||!INT.test(v))throw Error('INVALID_STAGE27_'+name);
 return BigInt(v);
}
function parseHeight(v:unknown,name:string):bigint{
 if(typeof v!=='string'||!HEIGHT.test(v)||BigInt(v)>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error('INVALID_STAGE27_'+name);
 return BigInt(v);
}
export function assessStage27ReplayAdmission(input:Stage26Health,o:Stage27GateSettings):Stage27Gate{
 if(!input||input.mode!=='RHEA_STAGE26_FRESH_SINGLE_BORROWER_HEALTH'||
  input.chain!=='NEAR_MAINNET'||input.executionEnabled!==false||
  input.maySign!==false||input.mayBroadcast!==false||
  input.deployedExecutionOraclePriceParityVerified!==false||
  input.deployedLiquidationRulesVerified!==false||
  input.transactionReplayVerified!==false||input.netProfitVerified!==false||
  input.sourceModel!=='ARCHIVED_BURROW_REFERENCE'||
  !ID.test(input.borrowerAccountId)||
  ![input.lendingCodeHash,input.oracleCodeHash,input.configuredOracleCodeHash].every(x=>HASH.test(x))||
  !Array.isArray(input.rows)||input.rows.length>64||
  !Number.isSafeInteger(input.positions)||input.positions!==input.rows.length||
  !Number.isSafeInteger(input.paperAtRisk)||!Number.isSafeInteger(input.paperHealthy)||
  !Number.isSafeInteger(input.blockedPositions)||input.positions!==input.paperAtRisk+input.paperHealthy+input.blockedPositions||
  !Number.isSafeInteger(o.maxEvidenceBlockLag)||o.maxEvidenceBlockLag<0||o.maxEvidenceBlockLag>30)
  throw Error('UNTRUSTED_STAGE26_REPLAY_EVIDENCE');
 const cap=parseUint(o.maxUnverifiedAdjustedPositionUsd,'SANITY_CAP_USD');
 if(cap<100n||cap>100_000_000n)throw Error('INVALID_STAGE27_SANITY_CAP_USD');
 const at=parseHeight(input.blockHeight,'EVIDENCE_HEIGHT');
 const current=parseHeight(o.latestFinalizedHeight,'LATEST_HEIGHT');
 if(current<at)throw Error('LATEST_HEIGHT_BEFORE_EVIDENCE');
 const lag=current-at;
 const stale=lag>BigInt(o.maxEvidenceBlockLag);
 const threshold=cap*E27;
 let anomalous=0;const ids=new Set<string>();
 const positions:Stage27RowAudit[]=input.rows.map((row:LiveHealthRow)=>{
  if(!row||typeof row.positionId!=='string'||!/^[A-Za-z0-9._:-]{1,100}$/.test(row.positionId)||
    ids.has(row.positionId)||row.executionEligible!==false||row.profitVerified!==false||
    !Array.isArray(row.debtAssetIds)||!Array.isArray(row.collateralAssetIds)||
    row.debtAssetIds.length>256||row.collateralAssetIds.length>256)
    throw Error('UNTRUSTED_STAGE26_POSITION_ROW');
  ids.add(row.positionId);
  const blocked=row.status==='BLOCKED';
  if(!blocked&&row.status!=='PAPER_AT_RISK_UNAPPROVED'&&row.status!=='PAPER_HEALTHY_UNAPPROVED')
   throw Error('UNTRUSTED_STAGE26_POSITION_STATUS');
  if(blocked){
   if(!row.reason||row.healthFactorBps!==null||row.adjustedDebtE27!==null||row.adjustedCollateralE27!==null)
    throw Error('CONTRADICTORY_BLOCKED_POSITION');
   return {positionId:row.positionId,referenceHealthBps:null,
    adjustedCollateralE27:null,adjustedDebtE27:null,referenceCollateralAboveSanityCap:null,
    referenceDebtAboveSanityCap:null,referenceNumbersReconcile:null,paperAtRisk:false,
    estimatedRepayAmountAtomic:null,projectedCollateralAtomic:null,estimatedRealNetUsd:null};
  }
  if(row.reason!==null||row.healthFactorBps===null||
   row.adjustedCollateralE27===null||row.adjustedDebtE27===null)
   throw Error('INCOMPLETE_UNBLOCKED_POSITION');
  const c=parseUint(row.adjustedCollateralE27,'COLLATERAL_E27');
  const d=parseUint(row.adjustedDebtE27,'DEBT_E27');
  const h=parseUint(row.healthFactorBps,'HEALTH_BPS');
  if(d===0n||h!==c*10000n/d||
   (row.status==='PAPER_AT_RISK_UNAPPROVED')!==(c<d))
   throw Error('CONTRADICTORY_REFERENCE_HEALTH');
  const cAnomaly=c>threshold,dAnomaly=d>threshold;
  if(cAnomaly||dAnomaly)anomalous++;
  return {positionId:row.positionId,referenceHealthBps:row.healthFactorBps,
   adjustedCollateralE27:row.adjustedCollateralE27,
   adjustedDebtE27:row.adjustedDebtE27,
   referenceCollateralAboveSanityCap:cAnomaly,
   referenceDebtAboveSanityCap:dAnomaly,referenceNumbersReconcile:true,
   paperAtRisk:c<d,estimatedRepayAmountAtomic:null,projectedCollateralAtomic:null,
   estimatedRealNetUsd:null};
 });
 if(positions.filter(x=>x.paperAtRisk).length!==input.paperAtRisk||
    positions.filter(x=>x.referenceNumbersReconcile===true&&!x.paperAtRisk).length!==input.paperHealthy)
  throw Error('CONTRADICTORY_STAGE26_COUNTS');
 const blockers=[
  ...(stale?['STALE_FINALIZED_BLOCK_EVIDENCE']:[]),
  ...(input.blockedPositions>0?['INCOMPLETE_POSITION_PRICE_EVIDENCE']:[]),
  ...(anomalous?['REFERENCE_POSITION_VALUATION_EXCEEDS_SANITY_CAP']:[]),
  ...(input.paperAtRisk===0?['NO_PAPER_AT_RISK_POSITION']:[]),
  'UNVERIFIED_REFERENCE_E27_UNIT_EQUIVALENCE_AND_TOKEN_DECIMALS',
  'FULL_MAINNET_CONTRACT_STORAGE_NOT_YET_IMPORTED_INTO_SANDBOX',
  'NO_IDENTICAL_STATE_ORACLE_ROUTE_TRANSACTION_REPLAY',
  'NO_VERIFIED_CAPITAL_SWAP_GAS_STORAGE_AND_NET_PROFIT',
  'NO_USER_APPROVED_SIGNER_MAX_LOSS_AND_RELEASE_POLICY',
 ];
 return {mode:'RHEA_STAGE27_REPLAY_ADMISSION_GATE',chain:'NEAR_MAINNET',
  status:stale?'BLOCKED_STALE_EVIDENCE':input.blockedPositions?'BLOCKED_INCOMPLETE_EVIDENCE':
   anomalous?'BLOCKED_VALUE_SANITY':'BLOCKED_PENDING_SANDBOX_REPLAY',
  borrowerAccountId:input.borrowerAccountId,blockHeight:input.blockHeight,
  asOfFinalizedHeight:o.latestFinalizedHeight,blockLag:Number(lag),
  lendingCodeHash:input.lendingCodeHash,oracleCodeHash:input.oracleCodeHash,
  configuredOracleCodeHash:input.configuredOracleCodeHash,
  referenceValuationScale:'E27_UNVERIFIED_EXECUTION_USD_EQUIVALENCE',
  referenceSanityCapUsd:o.maxUnverifiedAdjustedPositionUsd,
  paperAtRiskCount:input.paperAtRisk,implausiblyValuedPositions:anomalous,
  positions,mayAttemptStateImport:!stale,
  stateImportCompleted:false,stateStorageParityVerified:false,
  contractTransactionReplayed:false,transactionSucceeded:null,gasMeasured:null,
  realizedProfitUsd:null,configuredOracleExecutionParityVerified:false,
  walletFundingVerified:false,liveLiquidationEligible:false,
  executionEnabled:false,maySign:false,mayBroadcast:false,blockers};
}
