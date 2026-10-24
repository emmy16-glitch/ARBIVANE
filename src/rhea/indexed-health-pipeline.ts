import type { NearReadOnlyRpc } from './rpc.ts';
import type { DebtBackfillCheckpoint } from './market-debt-index.ts';
import { parseParityPools } from './deployed-share-parity.ts';
import { discoverDebtInAccount } from './debt-discovery.ts';
import { parseDetailedDebtScopes, type DetailedDebtPosition } from './candidate-triage.ts';
import { compareIsolatedPositions, parseIsolatedDetailed } from './isolated-parity.ts';
import { parseDetailedBorrower } from './detailed-debt-index.ts';
import { sourceSharesToAmount } from './source-math.ts';
import { parseRheaPythMetadata, parseLendingPriceConfig } from './market-metadata.ts';
import { parseAggregateOraclePrices, type AggregateOracleOptions } from './aggregate-oracle.ts';
import { calculatePaperPositionHealth, type HealthScreenReport, type PaperHealthPosition } from './health-screen.ts';
import type { PositionQuoteEvidence, ObservedPriceQuote } from './price-evidence.ts';
import { scoreRheaPaperOpportunities, type PaperScenario, type PaperOpportunityReport } from './opportunity-simulation.ts';

/** Stage 17: strict bridge from an actual Stage 14 checkpoint to Stage 15 health.
 * No index rescan, speculative trades, signing, token amount construction or wallet.
 * All lending/price views use one source checkpoint's historic NEAR block.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const POS=/^[A-Za-z0-9._:-]{1,100}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const safe=(x:unknown,min:number,max:number)=>Number.isSafeInteger(x)&&typeof x==='number'&&x>=min&&x<=max;
export type IndexedBlocker='LEGACY_SCOPE_UNSUPPORTED'|'INDEX_RECORD_CHANGED'|'DETAIL_VIEW_UNAVAILABLE'|
 'POSITION_SCOPE_MISMATCH'|'DETAILED_SHARE_PARITY_FAILED'|'PRICE_CONFIG_UNVERIFIED'|
 'PRICE_FEED_UNMAPPED'|'PRICE_QUERY_BUDGET_EXHAUSTED'|'PRICE_READ_UNAVAILABLE'|
 'PRICE_STALE_OR_UNCERTAIN'|'HEALTH_SOURCE_MODEL_REJECTED'|'NO_COLLATERAL';
export interface IndexedFinding {
  accountId:string;positionId:string|null;debtAssetIds:string[];
  classification:'PAPER_AT_RISK_UNAPPROVED'|'PAPER_HEALTHY_UNAPPROVED'|'BLOCKED';
  blockers:IndexedBlocker[];
  /** Health never becomes liquidation eligibility. */
  healthFactorBps:string|null;
  adjustedCollateralE27:string|null;
  adjustedDebtE27:string|null;
  liquidationEligible:false;profitabilityVerified:false;executionEnabled:false;
}
export interface IndexedHealthOptions {
  lendingContract:string;oracleContract:string;fromFinding:number;maxFoundAccounts:number;
  maxPriceQueries:number;nowMs:number;maxAgeMs:number;maxFutureSkewMs:number;maxConfidenceBps:number;
  expectedLendingCodeHash?:string;expectedOracleCodeHash?:string;
}
export interface IndexedHealthOutput {
  mode:'NEAR_RHEA_INDEXED_HEALTH_BRIDGE';
  chain:'NEAR_MAINNET';status:'NO_FINDINGS'|'PAPER_HEALTH_OBSERVED_UNAPPROVED'|'INCOMPLETE_EVIDENCE';
  sourceSnapshotComplete:boolean;sourceSnapshotHasSchemaErrors:boolean;
 sourceRegistry:'PAGED_LEGACY_UNVERIFIED'|'DETAILED_POSITION_SHARDS';
  blockHeight:string;lendingCodeHash:string;oracleCodeHash:string;
  marketAccounts:number;sourceScannedAccounts:number;sourceDebtAccounts:number;
  fromFinding:number;nextFinding:number;totalFindings:number;
  examinedAccounts:number;positionCount:number;paperAtRisk:number;paperHealthy:number;blockedPositions:number;
  queriedFeeds:number;records:IndexedFinding[];healthReport:HealthScreenReport;
  executionEnabled:false;liquidationParityVerified:false;profitabilityVerified:false;
  warnings:string[];
}
function same(a:string[],b:string[]):boolean {
 return a.length===b.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i]);
}
/** An untrusted JSON checkpoint is never allowed to manufacture full-index completion. */
export function validateIndexedCheckpoint(input:unknown):asserts input is DebtBackfillCheckpoint {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_CHECKPOINT');
 const c=input as Record<string,unknown>;
 if(c.version!==1||c.mode!=='NEAR_RHEA_SAME_BLOCK_BACKFILL'||c.chain!=='NEAR_MAINNET'||
    c.executionEnabled!==false||c.liquidationParityVerified!==false||!ID.test(String(c.lendingContract))||
    typeof c.blockHeight!=='string'||!/^[1-9][0-9]{0,15}$/.test(c.blockHeight)||!safe(Number(c.blockHeight),1,Number.MAX_SAFE_INTEGER)||
    typeof c.lendingCodeHash!=='string'||!HASH.test(c.lendingCodeHash)||
    !safe(c.totalAccounts,0,20_000_000)||typeof c.codeHashPinProvided!=='boolean'||!safe(c.startIndex,0,c.totalAccounts as number)||
    !safe(c.targetEndIndex,c.startIndex as number,Math.min(c.totalAccounts as number,(c.startIndex as number)+250_000))||
    !safe(c.nextIndex,c.startIndex as number,c.targetEndIndex as number)||
    !safe(c.scannedAccounts,0,250_000)||c.scannedAccounts!==(c.nextIndex as number)-(c.startIndex as number)||
    !safe(c.invalidAccounts,0,c.scannedAccounts as number)||
    !Array.isArray(c.seenAccountIds)||c.seenAccountIds.length!==c.scannedAccounts||
    !Array.isArray(c.findings)||c.findings.length>c.scannedAccounts||
    c.completeSnapshot!==(c.startIndex===0&&c.nextIndex===c.totalAccounts&&c.invalidAccounts===0)||
    typeof c.schemaReasons!=='object'||c.schemaReasons===null||Array.isArray(c.schemaReasons)||
    (c.sourceView!==undefined&&c.sourceView!=='get_account_all_positions')||
    (c.sourceView==='get_account_all_positions'&&(c.codeHashPinProvided!==true||c.invalidAccounts!==0||
      c.borrowedPoolBalancePositive!==true&&c.borrowedPoolBalancePositive!==false)))throw Error('INVALID_CHECKPOINT');
 const ids=new Set<string>();
 for(const accountId of c.seenAccountIds){if(typeof accountId!=='string'||!ID.test(accountId)||ids.has(accountId))throw Error('INVALID_CHECKPOINT_ACCOUNT');ids.add(accountId);}
 const foundIds=new Set<string>();
 for(const x of c.findings){
  if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_CHECKPOINT_FINDING');
  const f=x as Record<string,unknown>;
  if(typeof f.accountId!=='string'||!ids.has(f.accountId)||foundIds.has(f.accountId)||f.classification!=='DEBT_SHARES_DISCOVERED_UNVALUED'||
    !Array.isArray(f.positions)||f.positions.length<1||f.positions.length>64)throw Error('INVALID_CHECKPOINT_FINDING');
  foundIds.add(f.accountId);
  const pids=new Set<string>();
  for(const v of f.positions){
   if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_CHECKPOINT_POSITION');
   const p=v as Record<string,unknown>;
   if((p.positionId!==null&&(typeof p.positionId!=='string'||!POS.test(p.positionId)))||
      pids.has(String(p.positionId))||!Array.isArray(p.debtAssetIds)||p.debtAssetIds.length<1||p.debtAssetIds.length>256||
      !p.debtAssetIds.every(a=>typeof a==='string'&&ID.test(a))||
      new Set(p.debtAssetIds).size!==p.debtAssetIds.length||typeof p.collateralRecorded!=='boolean')throw Error('INVALID_CHECKPOINT_POSITION');
   if(c.sourceView==='get_account_all_positions'&&p.positionId===null)throw Error('INVALID_CHECKPOINT_DETAILED_POSITION');
   pids.add(String(p.positionId));
  }
 }
 for(const n of Object.values(c.schemaReasons as Record<string,unknown>))if(!safe(n,0,250_000))throw Error('INVALID_CHECKPOINT_SCHEMA_COUNTS');
 if(Object.values(c.schemaReasons as Record<string,number>).reduce((a,b)=>a+b,0)!==c.invalidAccounts)throw Error('INVALID_CHECKPOINT_SCHEMA_COUNTS');
}
function validateOptions(o:IndexedHealthOptions,c:DebtBackfillCheckpoint):void {
 if(!ID.test(o.lendingContract)||!ID.test(o.oracleContract)||o.lendingContract===o.oracleContract||o.lendingContract!==c.lendingContract)
   throw Error('INVALID_CONTRACT_SCOPE');
 if(!safe(o.fromFinding,0,c.findings.length)||!safe(o.maxFoundAccounts,1,20)||!safe(o.maxPriceQueries,1,32))throw Error('INVALID_BUDGET');
 if(!safe(o.nowMs,1_500_000_000_000,Number.MAX_SAFE_INTEGER)||!safe(o.maxAgeMs,1,600_000)||
   !safe(o.maxFutureSkewMs,0,60_000)||!safe(o.maxConfidenceBps,1,10_000))throw Error('INVALID_PRICE_POLICY');
 for(const h of [o.expectedLendingCodeHash,o.expectedOracleCodeHash])if(h!==undefined&&!HASH.test(h))throw Error('INVALID_CODE_HASH_PIN');
 if(o.expectedLendingCodeHash&&o.expectedLendingCodeHash!==c.lendingCodeHash)throw Error('CHECKPOINT_HASH_PIN_MISMATCH');
}
function blocked(accountId:string,positionId:string|null,debtAssetIds:string[],reason:IndexedBlocker):IndexedFinding {
 return {accountId,positionId,debtAssetIds,classification:'BLOCKED',blockers:[reason],
  healthFactorBps:null,adjustedCollateralE27:null,adjustedDebtE27:null,liquidationEligible:false,
  profitabilityVerified:false,executionEnabled:false};
}
function mapHealth(h:PaperHealthPosition,debtAssetIds:string[]):IndexedFinding {
 return {accountId:h.accountId,positionId:h.positionId,debtAssetIds,
  classification:h.classification,blockers:[],healthFactorBps:h.healthFactorBps,
  adjustedCollateralE27:h.adjustedCollateralE27,adjustedDebtE27:h.adjustedDebtE27,
  liquidationEligible:false,profitabilityVerified:false,executionEnabled:false};
}
const isBlockMismatch=(e:unknown):boolean=>e instanceof Error&&/CROSS_BLOCK|inconsistent snapshot block|unmatched pinned block/i.test(e.message);
/** Investigates only source-index findings. Unlike Stage 15, never defaults to first-N borrower indices. */
export async function inspectIndexedRheaHealth(
 rpc:NearReadOnlyRpc,rawCheckpoint:unknown,opts:IndexedHealthOptions,
):Promise<IndexedHealthOutput>{
 validateIndexedCheckpoint(rawCheckpoint);
 const checkpoint=rawCheckpoint;
 const detailedSource=(checkpoint as DebtBackfillCheckpoint & {sourceView?:string}).sourceView==='get_account_all_positions';
 validateOptions(opts,checkpoint);
 const height=Number(checkpoint.blockHeight);
 const [lending,oracle]=await Promise.all([
  rpc.viewAccount(opts.lendingContract,height),rpc.viewAccount(opts.oracleContract,height),
 ]);
 if(lending.blockHeight!==checkpoint.blockHeight||lending.codeHash!==checkpoint.lendingCodeHash||
    oracle.blockHeight!==checkpoint.blockHeight||
    (opts.expectedOracleCodeHash&&opts.expectedOracleCodeHash!==oracle.codeHash))throw Error('CROSS_BLOCK_OR_CODE_HASH_DRIFT');
 const [assets,metadata,config,countView]=await Promise.all([
  rpc.view<unknown>(opts.lendingContract,'get_assets_paged',{},height),
  rpc.view<unknown>(opts.lendingContract,'get_all_token_pyth_infos',{},height),
  rpc.view<unknown>(opts.lendingContract,'get_config',{},height),
  rpc.view<unknown>(opts.lendingContract,'get_num_accounts',{},height),
 ]);
 if([assets,metadata,config,countView].some(x=>x.blockHeight!==checkpoint.blockHeight))throw Error('CROSS_BLOCK_METADATA');
 if((typeof countView.value!=='number'&&typeof countView.value!=='string')||
    !/^(0|[1-9][0-9]*)$/.test(String(countView.value))||Number(countView.value)!==checkpoint.totalAccounts)
   throw Error('CHECKPOINT_ONCHAIN_ACCOUNT_COUNT_MISMATCH');
 const pools=parseParityPools(assets.value);
 const info=parseRheaPythMetadata(metadata.value,[...pools.keys()]);
 const pythOn=parseLendingPriceConfig(config.value)===true;
 const feeds=new Map(info.assets.map(x=>[x.assetId,x]));
 const accountIndices=new Map(checkpoint.seenAccountIds.map((id,i)=>[id,checkpoint.startIndex+i]));
 const candidates=checkpoint.findings.slice(opts.fromFinding,opts.fromFinding+opts.maxFoundAccounts);
 const prices=new Map<string,{value:unknown}|{reason:IndexedBlocker}>();let queried=0;
 const results:IndexedFinding[]=[];const health:PaperHealthPosition[]=[];
 const fail=(account:string,pos:string|null,debts:string[],reason:IndexedBlocker)=>{
   results.push(blocked(account,pos,debts,reason));
   health.push({accountId:account,positionId:pos,mode:'PAPER_RHEA_HEALTH_ONLY',classification:'BLOCKED',blockers:['UPSTREAM_PRICE_OR_POSITION_GAP'],
     adjustedCollateralE27:null,adjustedDebtE27:null,healthFactorBps:null,discountE27:null,
     executionEnabled:false,liquidationEligible:false,liquidationParityVerified:false,estimatedProfit:null});
 };
 for(const found of candidates){
  const originalIndex=accountIndices.get(found.accountId);
  if(originalIndex===undefined)throw Error('FINDING_NOT_IN_CHECKPOINT');
  let paged:unknown,detail:unknown;
  try {
   const [a,b]=await Promise.all([
     rpc.view<unknown>(opts.lendingContract,'get_accounts_paged',{from_index:originalIndex,limit:1},height),
     rpc.view<unknown>(opts.lendingContract,'get_account_all_positions',{account_id:found.accountId},height),
   ]);
   if(a.blockHeight!==checkpoint.blockHeight||b.blockHeight!==checkpoint.blockHeight)throw Error('CROSS_BLOCK_DETAIL');
   if(!Array.isArray(a.value)||a.value.length!==1)throw Error('INDEX_CHANGED');
   paged=a.value[0];detail=b.value;
  }catch(err){if(isBlockMismatch(err))throw err;
   for(const pos of found.positions)fail(found.accountId,pos.positionId,pos.debtAssetIds,'DETAIL_VIEW_UNAVAILABLE');continue;
  }
  let parsed:DetailedDebtPosition[];
  try {
   // Paged registry records on deployed Rhea do NOT expose all isolated debt.
   // Use them only to prove the account still occupies the checkpointed index.
   const row=paged as Record<string,unknown>;
   if(!row||typeof row!=='object'||Array.isArray(row)||row.account_id!==found.accountId)throw Error('INDEX_ID_CHANGED');
   const reobserved=detailedSource?
     parseDetailedBorrower(detail,found.accountId,pools):discoverDebtInAccount(paged,pools);
   if(!reobserved||reobserved.accountId!==found.accountId||reobserved.positions.length!==found.positions.length||
      found.positions.some(pos=>!reobserved.positions.some(p=>p.positionId===pos.positionId&&
         same(p.debtAssetIds,pos.debtAssetIds)&&p.collateralRecorded===pos.collateralRecorded)))throw Error('INDEX_CHANGED');
  }catch{
   for(const pos of found.positions)fail(found.accountId,pos.positionId,pos.debtAssetIds,'INDEX_RECORD_CHANGED');continue;
  }
  if(found.positions.some(p=>p.positionId===null)){
   for(const pos of found.positions)fail(found.accountId,pos.positionId,pos.debtAssetIds,'LEGACY_SCOPE_UNSUPPORTED');continue;
  }
  try {
   parsed=parseDetailedDebtScopes(detail,new Set(pools.keys()));
   if(parsed.length!==found.positions.length||found.positions.some(p=>{
     const d=parsed.find(v=>v.positionId===p.positionId);
     return !d||!same(d.debtAssetIds,p.debtAssetIds)||p.collateralRecorded!==(d.collateralAssetIds.length>0);
   }))throw Error('POSITION_SCOPE_MISMATCH');
  }catch{
   for(const pos of found.positions)fail(found.accountId,pos.positionId,pos.debtAssetIds,'POSITION_SCOPE_MISMATCH');continue;
  }
  // For detailed-source indexes, we cannot cross-compare nonexistent paged debt.
  // Independently rederive each detailed leg balance from historical pool shares.
  // This is historical SOURCE maths, NOT verified deployed liquidation parity.
  try {
   if(detailedSource){
    const positions=parseIsolatedDetailed(detail,pools);
    let compared=0;
    for(const position of positions.values()){
     for(const role of ['borrowed','collateral'] as const){
      for(const [asset,leg] of position[role]){
       const pool=pools.get(asset)![role==='borrowed'?'borrowed':'supplied'];
       if(sourceSharesToAmount(leg.shares,pool,role==='borrowed')!==leg.balance)throw Error('POOL_BALANCE_MISMATCH');
       compared++;
      }
     }
    }
    if(compared===0)throw Error('ZERO_COMPARABLE_LEGS');
   }else{
    const difference=compareIsolatedPositions(paged,detail,pools);
    if(difference.status!=='MATCH'||difference.comparedLegs===0)throw Error('DIFFERENTIAL_MISMATCH');
   }
  }catch{
   for(const pos of found.positions)fail(found.accountId,pos.positionId,pos.debtAssetIds,'DETAILED_SHARE_PARITY_FAILED');continue;
  }
  for(const pos of found.positions){
   const p=parsed.find(x=>x.positionId===pos.positionId)!;
   if(!p.collateralAssetIds.length){fail(found.accountId,pos.positionId,pos.debtAssetIds,'NO_COLLATERAL');continue;}
   if(!pythOn){fail(found.accountId,pos.positionId,pos.debtAssetIds,'PRICE_CONFIG_UNVERIFIED');continue;}
   const tokens=[...new Set([...p.debtAssetIds,...p.collateralAssetIds])].sort();
   const links=tokens.map(assetId=>({assetId,feed:feeds.get(assetId)}));
   if(links.some(x=>x.feed?.source!=='DIRECT_PYTH'||!x.feed.priceIdentifier)){
     fail(found.accountId,pos.positionId,pos.debtAssetIds,'PRICE_FEED_UNMAPPED');continue;
   }
   const quotes:ObservedPriceQuote[]=[];let error:IndexedBlocker|null=null;
   for(const {assetId,feed} of links){
    const fid=feed!.priceIdentifier!;
    if(!prices.has(fid)){
     if(queried>=opts.maxPriceQueries){error='PRICE_QUERY_BUDGET_EXHAUSTED';break;}
     queried++;
     try {
      const q=await rpc.view<unknown>(opts.oracleContract,'get_price_no_older_than',{
       price_id:fid,age:Math.ceil(opts.maxAgeMs/1000)},height);
      if(q.blockHeight!==checkpoint.blockHeight)throw Error('CROSS_BLOCK_PRICE');
      prices.set(fid,{value:q.value});
     }catch(e){if(isBlockMismatch(e))throw e;prices.set(fid,{reason:'PRICE_READ_UNAVAILABLE'});}
    }
    const cached=prices.get(fid)!;
    if('reason'in cached){error=cached.reason;break;}
    try {
     const parsedPrice=parseAggregateOraclePrices({[fid]:cached.value},[{assetId,priceId:fid}],{
       nowMs:opts.nowMs,maxAgeMs:opts.maxAgeMs,maxFutureSkewMs:opts.maxFutureSkewMs,maxConfidenceBps:opts.maxConfidenceBps,
     } as AggregateOracleOptions).prices.get(assetId)!;
     quotes.push({assetId,feedId:fid,priceMultiplier:parsedPrice.price.multiplier.toString(),
       priceDecimals:parsedPrice.price.decimals,publishTimeMs:parsedPrice.publishTimeMs,
       ageMs:parsedPrice.ageMs,confidenceBps:parsedPrice.confidenceBps.toString()});
    }catch{error='PRICE_STALE_OR_UNCERTAIN';break;}
   }
   if(error){fail(found.accountId,pos.positionId,pos.debtAssetIds,error);continue;}
   const quoteEvidence:PositionQuoteEvidence={accountId:found.accountId,positionId:pos.positionId,
     debtAssetIds:p.debtAssetIds,collateralAssetIds:p.collateralAssetIds,status:'QUOTED_UNAPPROVED',blockers:[],quotes,
     executable:false,liquidationEligible:false,indicativeHealthFactor:null,estimatedProfit:null};
   try {
    const healthRow=calculatePaperPositionHealth(quoteEvidence,detail,assets.value);
    if(healthRow.classification==='BLOCKED')throw Error('HEALTH_BLOCKED');
    health.push(healthRow);results.push(mapHealth(healthRow,pos.debtAssetIds));
   }catch{fail(found.accountId,pos.positionId,pos.debtAssetIds,'HEALTH_SOURCE_MODEL_REJECTED');}
  }
 }
 const risk=results.filter(x=>x.classification==='PAPER_AT_RISK_UNAPPROVED').length;
 const healthy=results.filter(x=>x.classification==='PAPER_HEALTHY_UNAPPROVED').length;
 const blockedN=results.filter(x=>x.classification==='BLOCKED').length;
 const hr:HealthScreenReport={mode:'READ_ONLY_RHEA_PAPER_HEALTH',
  status:blockedN?'INCOMPLETE_HEALTH_EVIDENCE':results.length?'PAPER_HEALTH_EVIDENCE_UNAPPROVED':'NO_DEBT_FOUND',
  blockHeight:checkpoint.blockHeight,lendingCodeHash:lending.codeHash,oracleCodeHash:oracle.codeHash,
  positionsSeen:health.length,paperAtRisk:risk,paperHealthy:healthy,blockedPositions:blockedN,records:health,
  executionEnabled:false,liquidationParityVerified:false,priceParityVerified:false,
  warnings:['INDEXED_HEALTH_FROM_HISTORICAL_BURROW_SOURCE_ONLY','NO_EXECUTABLE_LIQUIDATION_PROOF']};
 const next=opts.fromFinding+candidates.length;
 return {mode:'NEAR_RHEA_INDEXED_HEALTH_BRIDGE',chain:'NEAR_MAINNET',
  status:blockedN||checkpoint.invalidAccounts>0||!checkpoint.completeSnapshot?'INCOMPLETE_EVIDENCE':results.length?'PAPER_HEALTH_OBSERVED_UNAPPROVED':'NO_FINDINGS',
  sourceSnapshotComplete:checkpoint.completeSnapshot,sourceSnapshotHasSchemaErrors:checkpoint.invalidAccounts>0,
  sourceRegistry:detailedSource?'DETAILED_POSITION_SHARDS':'PAGED_LEGACY_UNVERIFIED',
  blockHeight:checkpoint.blockHeight,lendingCodeHash:lending.codeHash,oracleCodeHash:oracle.codeHash,
  marketAccounts:checkpoint.totalAccounts,sourceScannedAccounts:checkpoint.scannedAccounts,
  sourceDebtAccounts:checkpoint.findings.length,fromFinding:opts.fromFinding,nextFinding:next,
  totalFindings:checkpoint.findings.length,examinedAccounts:candidates.length,positionCount:results.length,
  paperAtRisk:risk,paperHealthy:healthy,blockedPositions:blockedN,queriedFeeds:queried,records:results,healthReport:hr,
  executionEnabled:false,liquidationParityVerified:false,profitabilityVerified:false,
  warnings:['ONLY_REAL_CHECKPOINT_FINDINGS_WERE_QUERIED','SINGLE_HISTORICAL_FINALIZED_NEAR_BLOCK',
   'LIVE_RHEA_LIQUIDATION_PARITY_NOT_ESTABLISHED','NO_AUTO_GENERATED_REPAYMENT_OR_PROFIT_SCENARIOS',
   'INDEX_CHECKPOINT_IS_NOT_CRYPTOGRAPHIC_ATTESTATION',
   ...(detailedSource?['PAGED_REGISTRY_HAS_NO_AUTHORITATIVE_DEBT_SHARES','DETAILED_SHARE_MATH_IS_HISTORICAL_SOURCE_NOT_DEPLOYED_ATTESTATION']:[]),
   ...(!checkpoint.completeSnapshot?['INCOMPLETE_MARKET_BACKFILL']:[]),
   ...(checkpoint.invalidAccounts>0?['SOURCE_INDEX_HAS_SCHEMA_ERRORS']:[]),
   ...(!opts.expectedLendingCodeHash||!opts.expectedOracleCodeHash?['CONTRACT_CODE_HASH_PINS_NOT_INDEPENDENTLY_APPROVED']:[])],
 };
}
/** Operator may supply separate hypothetical Stage 16 scenarios. Never synthesize one from paper health. */
export function scoreIndexedPaperScenarios(output:IndexedHealthOutput,scenarios:PaperScenario[]):PaperOpportunityReport {
 if(!output||output.mode!=='NEAR_RHEA_INDEXED_HEALTH_BRIDGE'||output.executionEnabled!==false||
   output.liquidationParityVerified!==false||output.profitabilityVerified!==false||
   output.blockHeight!==output.healthReport.blockHeight)throw Error('UNTRUSTED_INDEXED_HEALTH_OUTPUT');
 return scoreRheaPaperOpportunities(output.healthReport,scenarios);
}
