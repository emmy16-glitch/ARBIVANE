import type {NearReadOnlyRpc} from './rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import {inspectActivePythValuation,type ExecutionPythValuationReport} from './execution-pyth-valuation.ts';
import {inspectLiveLiquidationEntry,type LiquidationEntryEvidence} from './liquidation-entry-evidence.ts';

/** Stage34: one pinned finalized NEAR block for candidate's actual active Pyth
 * valuation AND deployed contract position/entry witness.
 *
 * This establishes a fresh REFERENCE health observation. It cannot verify
 * deployed Liquidate rules, repay sizing, execution, financing or any profit.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export interface Stage34Settings {
 lendingContract:string;configuredOracle:string;pythOracle:string;borrowerAccountId:string;
 expectedLendingCodeHash:string;expectedConfiguredOracleCodeHash:string;expectedPythCodeHash:string;
}
export interface Stage34CandidatePreflight {
 mode:'RHEA_STAGE34_ONE_BLOCK_CANDIDATE_PREFLIGHT';chain:'NEAR_MAINNET';
 status:'PAPER_AT_RISK_UNAPPROVED'|'PAPER_HEALTHY_UNAPPROVED'|'NO_CURRENT_DEBT'|
  'BLOCKED_INCOMPLETE_PRICE_EVIDENCE'|'BLOCKED_CONTRADICTORY_POSITION';
 blockHeight:string;borrowerAccountId:string;positionCount:number;
 positionHealthBps:Array<{positionId:string;referenceHealthBps:string}>;
 configuredOracleCodeHash:string;pythOracleCodeHash:string;lendingCodeHash:string;
 activePythEnabled:boolean;sourceValueSanityObserved:boolean;
 borrowerDebtAssets:string[];rpcStatistics:ReturnType<ResilientNearReadOnlyRpc['getStats']>;
 mayInferReferenceLiquidatable:boolean;
 reasonCodes:string[];
 liquidationContractLogicVerified:false;liquidationRepaymentAtomicVerified:false;
 statefulTransactionReplayVerified:false;netProfitVerified:false;
 executionEnabled:false;maySign:false;mayBroadcast:false;
}
export async function inspectStage34Candidate(
 baseRpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,o:Stage34Settings,
 evaluate?:(
  rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,block:number,
 )=>Promise<[ExecutionPythValuationReport,LiquidationEntryEvidence]>,
):Promise<Stage34CandidatePreflight>{
 if(!o||![o.lendingContract,o.configuredOracle,o.pythOracle,o.borrowerAccountId].every(x=>typeof x==='string'&&ID.test(x))||
  o.lendingContract!=='contract.main.burrow.near'||
  new Set([o.lendingContract,o.configuredOracle,o.pythOracle]).size!==3||
  ![o.expectedLendingCodeHash,o.expectedConfiguredOracleCodeHash,o.expectedPythCodeHash]
   .every(x=>typeof x==='string'&&HASH.test(x)))
  throw Error('INVALID_STAGE34_CANDIDATE_SETTINGS');
 const rpc=new ResilientNearReadOnlyRpc(baseRpc);
 const latest=await rpc.viewAccount(o.lendingContract);
 if(!/^[1-9][0-9]{0,15}$/.test(latest.blockHeight)||
  !Number.isSafeInteger(Number(latest.blockHeight))||
  latest.codeHash!==o.expectedLendingCodeHash)
  throw Error('INVALID_STAGE34_LENDING_FINALIZED_BLOCK_OR_CODE');
 const block=Number(latest.blockHeight);
 const [health,entry]=evaluate?await evaluate(rpc,block):await Promise.all([
  inspectActivePythValuation(rpc,{
   lendingContract:o.lendingContract,pythOracle:o.pythOracle,
   borrowerAccountId:o.borrowerAccountId,expectedLendingCodeHash:o.expectedLendingCodeHash,
   expectedPythOracleCodeHash:o.expectedPythCodeHash,
   pinnedBlockHeight:block,nowMs:Date.now(),maxConfidenceBps:150,
   sanityMaxUsd:'10000000',maxConcurrency:3,
  }),
  inspectLiveLiquidationEntry(rpc,{
   lendingContract:o.lendingContract,configuredOracle:o.configuredOracle,
   aggregatePriceReader:o.pythOracle,borrowerAccountId:o.borrowerAccountId,
   expectedLendingCodeHash:o.expectedLendingCodeHash,
   expectedConfiguredOracleCodeHash:o.expectedConfiguredOracleCodeHash,
   expectedAggregatePriceReaderCodeHash:o.expectedPythCodeHash,pinnedBlockHeight:block,
  }),
 ]);
 if(!health||!entry||health.mode!=='RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION'||
  entry.mode!=='RHEA_STAGE25_MAINNET_LIQUIDATION_ENTRY_READ_ONLY'||
  health.blockHeight!==latest.blockHeight||entry.blockHeight!==latest.blockHeight||
  health.borrowerAccountId!==o.borrowerAccountId||entry.borrowerAccountId!==o.borrowerAccountId||
  health.lendingCodeHash!==o.expectedLendingCodeHash||
  entry.lendingCodeHash!==o.expectedLendingCodeHash||
  health.pythOracleCodeHash!==o.expectedPythCodeHash||
  entry.aggregatePriceReaderCodeHash!==o.expectedPythCodeHash||
  entry.configuredOracleCodeHash!==o.expectedConfiguredOracleCodeHash||
  health.executionEnabled!==false||health.mayBroadcast!==false||health.maySign!==false||
  health.profitVerified!==false||health.transactionReplayVerified!==false||
  entry.executionEnabled!==false||entry.mayBroadcast!==false||
  entry.transactionReplayVerified!==false||entry.realNetProfitVerified!==false||
  health.priceConstructionMatchesCurrentSdk!==true||health.deployedMetadataAndConfigObserved!==true||
  health.sourceWasmReproduciblyMatched!==false||
  health.legacyOracleEnabled!==false||health.pythEnabled!==true||entry.pythOracleEnabled!==true||
  !entry.oracleConfigMatches||!Array.isArray(health.positions)||
  !Array.isArray(entry.borrowerDebtAssets)||
  !Array.isArray(entry.blockers)||health.positions.length!==entry.borrowerPositionCount)
  throw Error('STAGE34_CROSS_PROBE_PINNED_STATE_CONTRADICTION');
 const relevant=health.positions.filter(p=>p.status==='PAPER_AT_RISK_UNAPPROVED'||p.status==='PAPER_HEALTHY_UNAPPROVED');
 const missing=health.status==='INCOMPLETE_ACTIVE_PYTH_VALUATION'||
  health.positions.some(p=>p.status==='BLOCKED');
 const hasDebt=entry.borrowerStillHasDebt;
 const sourceDebts=[...new Set(health.positions.flatMap(p=>p.legs.filter(x=>x.role==='borrowed').map(x=>x.tokenId)))].sort();
 const assetMismatch=hasDebt&&(!missing&&(sourceDebts.join('|')!==[...entry.borrowerDebtAssets].sort().join('|')));
 const inconsistent=assetMismatch||
  (health.status==='NO_DEBT')!==!hasDebt||
  (!missing&&hasDebt&&relevant.length!==health.positions.length)||
  relevant.some(p=>p.healthFactorBps===null||!/^(0|[1-9][0-9]*)$/.test(p.healthFactorBps));
 const status:Stage34CandidatePreflight['status']=inconsistent?'BLOCKED_CONTRADICTORY_POSITION':
  !hasDebt?'NO_CURRENT_DEBT':missing?'BLOCKED_INCOMPLETE_PRICE_EVIDENCE':
  relevant.some(p=>p.status==='PAPER_AT_RISK_UNAPPROVED')?'PAPER_AT_RISK_UNAPPROVED':
  'PAPER_HEALTHY_UNAPPROVED';
 return {mode:'RHEA_STAGE34_ONE_BLOCK_CANDIDATE_PREFLIGHT',chain:'NEAR_MAINNET',
  status,blockHeight:latest.blockHeight,borrowerAccountId:o.borrowerAccountId,
  positionCount:entry.borrowerPositionCount,
  positionHealthBps:inconsistent||missing?[]:relevant.map(p=>({
   positionId:p.positionId,referenceHealthBps:p.healthFactorBps!,
  })),
  configuredOracleCodeHash:entry.configuredOracleCodeHash,
  pythOracleCodeHash:health.pythOracleCodeHash,lendingCodeHash:health.lendingCodeHash,
  activePythEnabled:true,sourceValueSanityObserved:!missing&&!inconsistent,
  borrowerDebtAssets:[...entry.borrowerDebtAssets].sort(),
  rpcStatistics:rpc.getStats(),
  mayInferReferenceLiquidatable:status==='PAPER_AT_RISK_UNAPPROVED',
  reasonCodes:[...(missing?['PRICE_OR_SHARE_REFERENCE_INCOMPLETE']:[]),
   ...(inconsistent?['CROSS_PROBE_ASSET_POSITION_OR_HEALTH_DRIFT']:[]),
   'DEPLOYED_LIQUIDATE_RULES_AND_ATOMIC_REPAY_LIMITS_UNVERIFIED',
   'NO_STATEFUL_LIQUIDATION_REPLAY_OR_REAL_NET_PROFIT',
   'NO_LIQUIDATOR_CAPITAL_OR_EXPLICIT_SIGNER_APPROVAL'],
  liquidationContractLogicVerified:false,liquidationRepaymentAtomicVerified:false,
  statefulTransactionReplayVerified:false,netProfitVerified:false,
  executionEnabled:false,maySign:false,mayBroadcast:false};
}
