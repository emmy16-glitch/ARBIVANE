import type {NearReadOnlyRpc} from './rpc.ts';
import {isTransientNearRpcError} from './resilient-readonly-rpc.ts';
import {inspectActivePythValuation,type ExecutionPythValuationReport} from './execution-pyth-valuation.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';

/** Stage 31 — bounded post-index refresh with the ACTIVE on-chain Pyth price route.
 * We never turn a research health factor into a liquidation-eligible action.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const UINT=/^[1-9][0-9]{0,15}$/;
const unique=(v:string[])=>new Set(v).size===v.length;
export interface RepriceQueueOptions {
 fromFinding:number;maxFindings:number;concurrency:number;
 lendingContract:string;pythOracle:string;
 expectedLendingCodeHash:string;expectedPythOracleCodeHash:string;
 maxConfidenceBps:number;sanityMaxUsd:string;
 /** One fresh finalized block shared across the entire repricing batch. */
 pinnedBlockHeight?:number;
}
export type RepriceDisposition='PAPER_AT_RISK_UNAPPROVED'|'PAPER_HEALTHY_UNAPPROVED'|
 'NO_DEBT_NOW'|'BLOCKED_INCOMPLETE_QUOTES'|'BLOCKED_SOURCE_POSITION_CHANGED'|'BLOCKED_RPC';
export interface RepriceQueueItem {
 borrowerAccountId:string;sourcePositionIds:string[];
 classification:RepriceDisposition;freshBlockHeight:string|null;
 freshHealthBps:string|null;paperAtRiskPositions:number;paperHealthyPositions:number;
 reason:string|null;executionEligible:false;tradeProfitVerified:false;
}
export interface RepriceQueueReport {
 mode:'RHEA_STAGE31_ACTIVE_PYTH_DEBT_QUEUE';chain:'NEAR_MAINNET';
 status:'REPRICE_BATCH_COMPLETED_RESEARCH_ONLY'|'REPRICE_BATCH_INCOMPLETE'|'NO_MORE_FINDINGS';
 sourceBlockHeight:string;sourceCodeHash:string;sourceTotalAccounts:number;
 sourceDebtAccounts:number;fromFinding:number;nextFinding:number;remainingFindings:number;
 /** Null is legacy per-borrower sampling; stage 32 workflow requires a shared pin. */
 pricingBlockHeight:string|null;
 processed:number;paperAtRisk:number;paperHealthy:number;noDebtNow:number;blocked:number;
 items:RepriceQueueItem[];
 walletAuthorized:false;currentLiquidationEligibilityProven:false;
 transactionReplayPerformed:false;profitVerified:false;executionEnabled:false;maySign:false;mayBroadcast:false;
 warnings:string[];
}
function validateSource(source:CompletePagedIndex):void {
 if(!source||source.mode!=='RHEA_COMPLETE_PAGED_INDEX_ATTESTATION'||
 source.status!=='COMPLETE_DEBT_INDEX_READ_ONLY'||source.chain!=='NEAR_MAINNET'||
 source.executionEnabled!==false||source.liquidationEligible!==false||
 source.profitabilityVerified!==false||source.completeSnapshot!==true||source.zeroSchemaErrors!==true||
 !UINT.test(source.blockHeight)||!HASH.test(source.lendingCodeHash)||
 !Number.isSafeInteger(source.totalAccounts)||source.totalAccounts<1||
 !Number.isSafeInteger(source.scannedAccounts)||source.scannedAccounts!==source.totalAccounts||
 !Number.isSafeInteger(source.debtAccounts)||!Array.isArray(source.findings)||
 source.debtAccounts!==source.findings.length||
 !Number.isSafeInteger(source.debtPositions)||source.debtPositions!==source.findings.reduce((n,f)=>n+(f?.positions?.length??0),0)||
 source.findings.length>source.totalAccounts)
 throw Error('STAGE31_REQUIRES_COMPLETE_VERIFIED_DEBT_INDEX');
 const seen=new Set<string>();
 for(const f of source.findings){
  if(!f||typeof f.accountId!=='string'||!ID.test(f.accountId)||seen.has(f.accountId)||
   f.classification!=='DEBT_SHARES_DISCOVERED_UNVALUED'||
   !Array.isArray(f.positions)||f.positions.length===0||f.positions.length>64)
    throw Error('INVALID_STAGE31_SOURCE_FINDINGS');
  seen.add(f.accountId);
  const pids=new Set<string>();
  for(const p of f.positions){
   if(typeof p?.positionId!=='string'||!/^[A-Za-z0-9._:-]{1,100}$/.test(p.positionId)||
    pids.has(p.positionId)||!Array.isArray(p.debtAssetIds)||
    p.debtAssetIds.length<1||p.debtAssetIds.length>256||
    !p.debtAssetIds.every(x=>typeof x==='string'&&ID.test(x))||
    !unique(p.debtAssetIds)||typeof p.collateralRecorded!=='boolean')
    throw Error('INVALID_STAGE31_SOURCE_POSITION');
   pids.add(p.positionId);
  }
 }
}
function validateOptions(source:CompletePagedIndex,o:RepriceQueueOptions){
 if(!Number.isSafeInteger(o.fromFinding)||o.fromFinding<0||o.fromFinding>source.debtAccounts||
 !Number.isSafeInteger(o.maxFindings)||o.maxFindings<1||o.maxFindings>20||
 !Number.isSafeInteger(o.concurrency)||o.concurrency<1||o.concurrency>3||
 !ID.test(o.lendingContract)||!ID.test(o.pythOracle)||
 o.lendingContract!=='contract.main.burrow.near'||o.lendingContract===o.pythOracle||
 !HASH.test(o.expectedLendingCodeHash)||!HASH.test(o.expectedPythOracleCodeHash)||
 source.lendingCodeHash!==o.expectedLendingCodeHash||
 (o.pinnedBlockHeight!==undefined&&(!Number.isSafeInteger(o.pinnedBlockHeight)||o.pinnedBlockHeight<1))||
 !Number.isSafeInteger(o.maxConfidenceBps)||o.maxConfidenceBps<1||o.maxConfidenceBps>300||
 !/^[1-9][0-9]{0,7}$/.test(o.sanityMaxUsd)||
 Number(o.sanityMaxUsd)>100000000)
 throw Error('INVALID_STAGE31_REPRICE_QUEUE_OPTIONS');
}
function checkObservation(raw:ExecutionPythValuationReport,account:string):RepriceDisposition{
 if(!raw||raw.mode!=='RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION'||raw.chain!=='NEAR_MAINNET'||
 raw.borrowerAccountId!==account||raw.executionEnabled!==false||raw.maySign!==false||
 raw.mayBroadcast!==false||raw.transactionReplayVerified!==false||
 raw.profitVerified!==false||raw.sourceWasmReproduciblyMatched!==false||
 raw.priceConstructionMatchesCurrentSdk!==true||raw.deployedMetadataAndConfigObserved!==true||
 !UINT.test(raw.blockHeight)||!Array.isArray(raw.positions)||
 raw.positions.length!==raw.candidatePositions)
 throw Error('UNTRUSTED_STAGE29_REPRICE_RESULT');
 if(raw.status==='NO_DEBT'&&raw.positions.length===0)return 'NO_DEBT_NOW';
 if(raw.status==='INCOMPLETE_ACTIVE_PYTH_VALUATION')return 'BLOCKED_INCOMPLETE_QUOTES';
 if(raw.status!=='ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED')throw Error('UNTRUSTED_STAGE29_STATUS');
 if(raw.positions.some(p=>p.status==='BLOCKED'))return 'BLOCKED_INCOMPLETE_QUOTES';
 return raw.positions.some(p=>p.status==='PAPER_AT_RISK_UNAPPROVED')?
 'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED';
}
/** Allow injection of the read-only price evaluator for deterministic tests. */
export async function refreshIndexedBorrowerCandidates(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,
 source:CompletePagedIndex,o:RepriceQueueOptions,
 evaluator:(id:string)=>Promise<ExecutionPythValuationReport>=(borrowerAccountId)=>
 inspectActivePythValuation(rpc,{lendingContract:o.lendingContract,
  pythOracle:o.pythOracle,borrowerAccountId,expectedLendingCodeHash:o.expectedLendingCodeHash,
  expectedPythOracleCodeHash:o.expectedPythOracleCodeHash,nowMs:Date.now(),
  maxConfidenceBps:o.maxConfidenceBps,sanityMaxUsd:o.sanityMaxUsd,
  maxConcurrency:2,pinnedBlockHeight:o.pinnedBlockHeight}),
):Promise<RepriceQueueReport>{
 validateSource(source);validateOptions(source,o);
 const candidates=source.findings.slice(o.fromFinding,o.fromFinding+o.maxFindings);
 const items:Array<RepriceQueueItem>=new Array(candidates.length);
 let index=0;
 await Promise.all(Array.from({length:Math.min(o.concurrency,candidates.length)},async()=>{
  for(;;){
   const i=index++;if(i>=candidates.length)return;
   const sourceAccount=candidates[i]!,ids=sourceAccount.positions.map(p=>p.positionId!);
   let item:RepriceQueueItem={borrowerAccountId:sourceAccount.accountId,
    sourcePositionIds:ids,classification:'BLOCKED_RPC',freshBlockHeight:null,
    freshHealthBps:null,paperAtRiskPositions:0,paperHealthyPositions:0,reason:'RPC_OR_ORACLE_READ_FAILED',
    executionEligible:false,tradeProfitVerified:false};
   try{
    const value=await evaluator(sourceAccount.accountId);
    if(o.pinnedBlockHeight!==undefined&&value.blockHeight!==String(o.pinnedBlockHeight))
      throw Error('CROSS_BLOCK_REPRICE');
    let status=checkObservation(value,sourceAccount.accountId);
    const sourceByPosition=new Map(sourceAccount.positions.map(p=>[p.positionId,p.debtAssetIds]));
    if(status!=='NO_DEBT_NOW'&&status!=='BLOCKED_INCOMPLETE_QUOTES'){
     if(value.positions.length!==sourceAccount.positions.length||
       value.positions.some(p=>{
        const originally=sourceByPosition.get(p.positionId);
        const fresh=p.legs.filter(x=>x.role==='borrowed').map(x=>x.tokenId);
        return !originally||fresh.length!==originally.length||
           !fresh.every(x=>originally.includes(x));
       }))status='BLOCKED_SOURCE_POSITION_CHANGED';
    }
    const risks=status==='PAPER_AT_RISK_UNAPPROVED'?
     value.positions.filter(p=>p.status==='PAPER_AT_RISK_UNAPPROVED').length:0;
    const healthy=status==='PAPER_HEALTHY_UNAPPROVED'||status==='PAPER_AT_RISK_UNAPPROVED'?
     value.positions.filter(p=>p.status==='PAPER_HEALTHY_UNAPPROVED').length:0;
    item={...item,classification:status,freshBlockHeight:value.blockHeight,
     freshHealthBps:status==='PAPER_AT_RISK_UNAPPROVED'||status==='PAPER_HEALTHY_UNAPPROVED'?
     value.positions.filter(p=>p.status!=='BLOCKED').map(p=>p.healthFactorBps).sort((a,b)=>
       BigInt(a!)<BigInt(b!)?-1:1)[0]??null:null,
     paperAtRiskPositions:risks,paperHealthyPositions:healthy,
     reason:status.startsWith('BLOCKED')?status:null};
   }catch(e){
    // Explicitly distinguish a cross-block or untrusted response from an RPC failure.
    const msg=e instanceof Error?e.message:'';
    // Distinguish retryable provider/network failures from permanent
    // schema, source, oracle and integrity failures. No raw error messages
    // (which could contain secrets) are persisted in borrower artifacts.
    item.reason=msg==='CROSS_BLOCK_REPRICE'?'CROSS_BLOCK_REPRICE':
      msg.startsWith('UNTRUSTED_STAGE29')?'UNTRUSTED_REPRICE_RESULT':
      isTransientNearRpcError(e)?'RPC_TRANSIENT_RATE_LIMIT_OR_TIMEOUT':
      'RPC_OR_ORACLE_READ_FAILED';
   }
   items[i]=item;
  }
 }));
 const next=o.fromFinding+candidates.length;
 const blocked=items.filter(x=>x.classification.startsWith('BLOCKED')).length;
 const paperAtRisk=items.filter(x=>x.classification==='PAPER_AT_RISK_UNAPPROVED').length;
 const paperHealthy=items.filter(x=>x.classification==='PAPER_HEALTHY_UNAPPROVED').length;
 const noDebtNow=items.filter(x=>x.classification==='NO_DEBT_NOW').length;
 return {mode:'RHEA_STAGE31_ACTIVE_PYTH_DEBT_QUEUE',chain:'NEAR_MAINNET',
  status:candidates.length===0?'NO_MORE_FINDINGS':blocked?'REPRICE_BATCH_INCOMPLETE':
   'REPRICE_BATCH_COMPLETED_RESEARCH_ONLY',
  sourceBlockHeight:source.blockHeight,sourceCodeHash:source.lendingCodeHash,
  sourceTotalAccounts:source.totalAccounts,sourceDebtAccounts:source.debtAccounts,
  fromFinding:o.fromFinding,nextFinding:next,remainingFindings:source.debtAccounts-next,
  pricingBlockHeight:o.pinnedBlockHeight===undefined?null:String(o.pinnedBlockHeight),
  processed:items.length,paperAtRisk,paperHealthy,noDebtNow,blocked,items,
  walletAuthorized:false,currentLiquidationEligibilityProven:false,
  transactionReplayPerformed:false,profitVerified:false,
  executionEnabled:false,maySign:false,mayBroadcast:false,
  warnings:[o.pinnedBlockHeight===undefined?'REPRICED_POSITIONS_USE_INDEPENDENT_RECENT_FINALIZED_BLOCKS':
   'REPRICED_POSITIONS_USE_ONE_SHARED_FINALIZED_BLOCK',
   'SOURCE_DEBT_POSITION_CHANGES_REQUIRE_REINDEXING',
   'CORRECT_PYTH_PAPER_HEALTH_IS_NOT_LIQUIDATION_EXECUTION_PARITY',
   'NO_MAINNET_SIGNER_SANDBOX_REPLAY_OR_VERIFIED_PROFIT']};
}
