import type {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools} from './deployed-share-parity.ts';
import {parseDetailedDebtScopes} from './candidate-triage.ts';
import {parseRheaPythMetadata,parseLendingPriceConfig} from './market-metadata.ts';
import {parseAggregateOraclePrices} from './aggregate-oracle.ts';
import {calculatePaperPositionHealth} from './health-screen.ts';
import type {ObservedPriceQuote,PositionQuoteEvidence} from './price-evidence.ts';

/** Stage 26: candidate-specific, ONE finalized-block paper health evaluation.
 * This is NOT a deployed execution/oracle-branch attestation, transaction simulation or signer.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const mismatch=(e:unknown)=>e instanceof Error&&/CROSS_BLOCK|inconsistent snapshot block/i.test(e.message);
export type LiveHealthReason='NO_COLLATERAL'|'PYTH_DISABLED_OR_UNKNOWN'|
 'NON_DIRECT_OR_UNMAPPED_PRICE'|'FEED_QUERY_BUDGET_EXCEEDED'|'PRICE_QUERY_FAILED'|
 'PRICE_STALE_OR_UNCERTAIN'|'SOURCE_HEALTH_PARITY_FAILED';
export interface Stage26Settings {
 lendingContract:string;oracleContract:string;configuredOracleContract:string;borrowerAccountId:string;
 expectedLendingCodeHash:string;expectedOracleCodeHash:string;expectedConfiguredOracleCodeHash:string;
 nowMs:number;maxPriceAgeMs:number;maxFutureSkewMs:number;maxConfidenceBps:number;maxPriceQueries:number;
}
export interface LiveHealthRow {
 positionId:string;debtAssetIds:string[];collateralAssetIds:string[];
 status:'PAPER_AT_RISK_UNAPPROVED'|'PAPER_HEALTHY_UNAPPROVED'|'BLOCKED';
 reason:LiveHealthReason|null;healthFactorBps:string|null;
 adjustedCollateralE27:string|null;adjustedDebtE27:string|null;
 quotes:number;executionEligible:false;profitVerified:false;
}
export interface Stage26Health {
 mode:'RHEA_STAGE26_FRESH_SINGLE_BORROWER_HEALTH';chain:'NEAR_MAINNET';
 status:'NO_DEBT'|'PAPER_HEALTH_UNAPPROVED'|'INCOMPLETE_PRICE_EVIDENCE';
 blockHeight:string;borrowerAccountId:string;lendingCodeHash:string;
 oracleCodeHash:string;configuredOracleCodeHash:string;
 pythEnabled:boolean|null;positions:number;paperAtRisk:number;paperHealthy:number;
 blockedPositions:number;queriedFeeds:number;rows:LiveHealthRow[];
 sourcePriceMethod:'get_price_no_older_than';sourceModel:'ARCHIVED_BURROW_REFERENCE';
 deployedExecutionOraclePriceParityVerified:false;deployedLiquidationRulesVerified:false;
 transactionReplayVerified:false;netProfitVerified:false;
 executionEnabled:false;maySign:false;mayBroadcast:false;
 warnings:string[];
}
function valid(o:Stage26Settings):void {
 if(![o.lendingContract,o.oracleContract,o.configuredOracleContract,o.borrowerAccountId].every(x=>typeof x==='string'&&ID.test(x))||
 new Set([o.lendingContract,o.oracleContract,o.configuredOracleContract]).size!==3||
 ![o.expectedLendingCodeHash,o.expectedOracleCodeHash,o.expectedConfiguredOracleCodeHash].every(x=>typeof x==='string'&&HASH.test(x))||
 !Number.isSafeInteger(o.nowMs)||Math.abs(Date.now()-o.nowMs)>30000||
 !Number.isSafeInteger(o.maxPriceAgeMs)||o.maxPriceAgeMs<1000||o.maxPriceAgeMs>120000||
 !Number.isSafeInteger(o.maxFutureSkewMs)||o.maxFutureSkewMs<0||o.maxFutureSkewMs>10000||
 !Number.isSafeInteger(o.maxConfidenceBps)||o.maxConfidenceBps<1||o.maxConfidenceBps>300||
 !Number.isSafeInteger(o.maxPriceQueries)||o.maxPriceQueries<1||o.maxPriceQueries>32)
 throw Error('INVALID_STAGE26_SETTINGS');
}
export async function inspectCurrentBorrowerHealth(
 rpc:Pick<NearReadOnlyRpc,'viewAccount'|'view'>,o:Stage26Settings,
):Promise<Stage26Health>{
 valid(o);
 const latest=await rpc.viewAccount(o.lendingContract);
 if(!/^[1-9][0-9]{0,15}$/.test(latest.blockHeight)||
 !Number.isSafeInteger(Number(latest.blockHeight))||latest.codeHash!==o.expectedLendingCodeHash)
 throw Error('LENDING_CODE_CHANGED_OR_BAD_FINAL_BLOCK');
 const block=Number(latest.blockHeight),height=latest.blockHeight;
 const [lending,oracle,configured,assets,info,config,detail]=await Promise.all([
  rpc.viewAccount(o.lendingContract,block),
  rpc.viewAccount(o.oracleContract,block),
  rpc.viewAccount(o.configuredOracleContract,block),
  rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},block),
  rpc.view<unknown>(o.lendingContract,'get_all_token_pyth_infos',{},block),
  rpc.view<unknown>(o.lendingContract,'get_config',{},block),
  rpc.view<unknown>(o.lendingContract,'get_account_all_positions',{account_id:o.borrowerAccountId},block),
 ]);
 if([lending,oracle,configured].some(x=>x.blockHeight!==height)||
    [assets,info,config,detail].some(x=>x.blockHeight!==height))throw Error('CROSS_BLOCK_STAGE26_SNAPSHOT');
 if(lending.codeHash!==o.expectedLendingCodeHash||oracle.codeHash!==o.expectedOracleCodeHash||
    configured.codeHash!==o.expectedConfiguredOracleCodeHash)throw Error('STAGE26_DEPLOYED_CODE_CHANGED');
 const cfg=config.value;
 if(!cfg||typeof cfg!=='object'||Array.isArray(cfg)||
  (cfg as Record<string,unknown>).oracle_account_id!==o.configuredOracleContract)
 throw Error('STAGE26_EXECUTION_ORACLE_CONFIG_DRIFT');
 const pythEnabled=parseLendingPriceConfig(cfg);
 const pools=parseParityPools(assets.value);
 const parsed=parseDetailedDebtScopes(detail.value,new Set(pools.keys()));
 const metadata=parseRheaPythMetadata(info.value,[...pools.keys()]);
 const feeds=new Map(metadata.assets.map(x=>[x.assetId,x]));
 const cache=new Map<string,ObservedPriceQuote|LiveHealthReason>();
 let queried=0;
 const rows:LiveHealthRow[]=[];
 for(const pos of parsed){
  const row:LiveHealthRow={positionId:pos.positionId,debtAssetIds:pos.debtAssetIds,
   collateralAssetIds:pos.collateralAssetIds,status:'BLOCKED',reason:null,
   healthFactorBps:null,adjustedCollateralE27:null,adjustedDebtE27:null,quotes:0,
   executionEligible:false,profitVerified:false};
  const blockReason=(reason:LiveHealthReason)=>{row.reason=reason;rows.push(row);};
  if(pos.collateralAssetIds.length===0){blockReason('NO_COLLATERAL');continue;}
  if(pythEnabled!==true){blockReason('PYTH_DISABLED_OR_UNKNOWN');continue;}
  const ids=[...new Set([...pos.debtAssetIds,...pos.collateralAssetIds])].sort();
  if(ids.some(id=>feeds.get(id)?.source!=='DIRECT_PYTH'||!feeds.get(id)?.priceIdentifier)){
   blockReason('NON_DIRECT_OR_UNMAPPED_PRICE');continue;
  }
  // Preflight the distinct required feed count before any partial quotation.
  const needed=[...new Set(ids.map(id=>feeds.get(id)!.priceIdentifier!))];
  if(queried+needed.filter(id=>!cache.has(id)).length>o.maxPriceQueries){
   blockReason('FEED_QUERY_BUDGET_EXCEEDED');continue;
  }
  const quotes:ObservedPriceQuote[]=[];
  let reason:LiveHealthReason|null=null;
  for(const assetId of ids){
   const feedId=feeds.get(assetId)!.priceIdentifier!;
   let result=cache.get(feedId);
   if(result===undefined){
    queried++;
    try{
     const price=await rpc.view<unknown>(o.oracleContract,'get_price_no_older_than',{
      price_id:feedId,age:Math.ceil(o.maxPriceAgeMs/1000)},block);
     if(price.blockHeight!==height)throw Error('CROSS_BLOCK_STAGE26_PRICE');
     const p=parseAggregateOraclePrices({[feedId]:price.value},[{assetId,priceId:feedId}],{
       nowMs:o.nowMs,maxAgeMs:o.maxPriceAgeMs,maxFutureSkewMs:o.maxFutureSkewMs,
       maxConfidenceBps:o.maxConfidenceBps,
     }).prices.get(assetId)!;
     result={assetId,feedId,priceMultiplier:p.price.multiplier.toString(),
      priceDecimals:p.price.decimals,publishTimeMs:p.publishTimeMs,
      ageMs:p.ageMs,confidenceBps:p.confidenceBps.toString()};
    }catch(e){
     if(mismatch(e))throw e;
     result=e instanceof Error&&/stale|future|confidence|publish|price/i.test(e.message)?
       'PRICE_STALE_OR_UNCERTAIN':'PRICE_QUERY_FAILED';
    }
    cache.set(feedId,result);
   }
   if(typeof result==='string'){reason=result;break;}
   quotes.push({...result,assetId});
  }
  if(reason!==null){blockReason(reason);continue;}
  const evidence:PositionQuoteEvidence={accountId:o.borrowerAccountId,positionId:pos.positionId,
   debtAssetIds:pos.debtAssetIds,collateralAssetIds:pos.collateralAssetIds,
   status:'QUOTED_UNAPPROVED',blockers:[],quotes,
   executable:false,liquidationEligible:false,indicativeHealthFactor:null,estimatedProfit:null};
  try{
   const computed=calculatePaperPositionHealth(evidence,detail.value,assets.value);
   if(computed.classification==='BLOCKED'||computed.healthFactorBps===null)throw Error('PAPER_SOURCE_REJECTED');
   row.status=computed.classification;row.healthFactorBps=computed.healthFactorBps;
   row.adjustedCollateralE27=computed.adjustedCollateralE27;row.adjustedDebtE27=computed.adjustedDebtE27;
   row.quotes=quotes.length;rows.push(row);
  }catch{blockReason('SOURCE_HEALTH_PARITY_FAILED');}
 }
 const blocked=rows.filter(x=>x.status==='BLOCKED').length;
 const risk=rows.filter(x=>x.status==='PAPER_AT_RISK_UNAPPROVED').length;
 const healthy=rows.filter(x=>x.status==='PAPER_HEALTHY_UNAPPROVED').length;
 return {mode:'RHEA_STAGE26_FRESH_SINGLE_BORROWER_HEALTH',chain:'NEAR_MAINNET',
  status:rows.length===0?'NO_DEBT':blocked?'INCOMPLETE_PRICE_EVIDENCE':'PAPER_HEALTH_UNAPPROVED',
  blockHeight:height,borrowerAccountId:o.borrowerAccountId,lendingCodeHash:lending.codeHash,
  oracleCodeHash:oracle.codeHash,configuredOracleCodeHash:configured.codeHash,
  pythEnabled,positions:rows.length,paperAtRisk:risk,paperHealthy:healthy,
  blockedPositions:blocked,queriedFeeds:queried,rows,
  sourcePriceMethod:'get_price_no_older_than',sourceModel:'ARCHIVED_BURROW_REFERENCE',
  deployedExecutionOraclePriceParityVerified:false,deployedLiquidationRulesVerified:false,
  transactionReplayVerified:false,netProfitVerified:false,executionEnabled:false,
  maySign:false,mayBroadcast:false,
  warnings:['DIRECT_PYTH_ONLY_NO_DERIVED_PRICE_FALLBACK',
   'REFERENCE_PAPER_HEALTH_IS_NOT_CURRENT_EXECUTION_ORACLE_PARITY',
   'DEPLOYED_LIQUIDATION_RULES_AND_STATEFUL_SIMULATION_UNVERIFIED',
   'NO_WALLET_NO_NET_PROFIT_NO_LIVE_LIQUIDATION']};
}
