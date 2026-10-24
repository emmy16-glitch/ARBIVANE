import type { NearReadOnlyRpc } from './rpc.ts';
import { triageRheaDebtWindow, type CandidateEvidence, type DebtTriageSettings } from './candidate-triage.ts';
import { parseRheaPythMetadata, parseLendingPriceConfig, type RheaAssetPriceMetadata } from './market-metadata.ts';
import { parseAggregateOraclePrices, type AggregateOracleOptions } from './aggregate-oracle.ts';

/** Stage 13: oracle quotations for strictly scoped, read-only Rhea debt observations.
 * Feed mapping comes ONLY from the lending contract at the discovery block. A
 * usable quote is evidence of a price feed, NOT executable liquidation parity.
 */
const ID = /^[a-z0-9._-]{2,64}$/;
export type QuoteEvidenceFailure = 'UPSTREAM_TRIAGE_BLOCKED' | 'UNMAPPED_OR_DEFAULT_PRICE' |
  'QUOTE_REQUEST_LIMIT' | 'ORACLE_QUOTE_REJECTED' | 'STALE_OR_LOW_CONFIDENCE' |
  'PYTH_CONFIG_DISABLED';
export interface PriceEvidenceSettings extends DebtTriageSettings {
  maxFeedQueries:number;
  maxAgeMs:number;
  maxFutureSkewMs:number;
  maxConfidenceBps:number;
  /** Only the one-feed deployed API is in this stage's scope. */
  oracleMethod:'get_price_no_older_than';
  nowMs:number;
}
export interface ObservedPriceQuote {
  assetId:string;
  feedId:string;
  priceMultiplier:string;
  priceDecimals:number;
  publishTimeMs:number;
  ageMs:number;
  confidenceBps:string;
}
export interface PositionQuoteEvidence {
  accountId:string;
  positionId:string|null;
  debtAssetIds:string[];
  collateralAssetIds:string[];
  status:'QUOTED_UNAPPROVED'|'BLOCKED';
  blockers:QuoteEvidenceFailure[];
  quotes:ObservedPriceQuote[];
  executable:false;
  liquidationEligible:false;
  indicativeHealthFactor:null;
  estimatedProfit:null;
}
export interface PriceEvidenceReport {
  mode:'READ_ONLY_RHEA_POSITION_ORACLE_EVIDENCE';
  status:'QUOTES_OBSERVED_UNAPPROVED'|'NO_DEBT_FOUND'|'INCOMPLETE_ORACLE_EVIDENCE';
  executionEnabled:false;
  liquidationParityVerified:false;
  priceParityVerified:false;
  blockHeight:string;
  lendingCodeHash:string;
  oracleCodeHash:string;
  fromIndex:number;
  nextOffset:number;
  examinedAccounts:number;
  triagedPositions:number;
  feedQueries:number;
  successfulFeeds:number;
  blockedPositions:number;
  records:PositionQuoteEvidence[];
  warnings:string[];
}
function obj(value:unknown, label:string):Record<string,unknown> {
  if(value===null||typeof value!=='object'||Array.isArray(value))throw Error(`invalid ${label}`);
  return value as Record<string,unknown>;
}
function validate(cfg:PriceEvidenceSettings):void {
  if(!Number.isSafeInteger(cfg.maxFeedQueries)||cfg.maxFeedQueries<1||cfg.maxFeedQueries>32)throw Error('maxFeedQueries must be 1..32');
  if(cfg.oracleMethod!=='get_price_no_older_than')throw Error('unsupported oracle query method');
  if(!Number.isSafeInteger(cfg.nowMs)||cfg.nowMs<1_500_000_000_000)throw Error('invalid clock');
  if(!Number.isSafeInteger(cfg.maxAgeMs)||cfg.maxAgeMs<1||cfg.maxAgeMs>600_000)throw Error('invalid price age limit');
  if(!Number.isSafeInteger(cfg.maxFutureSkewMs)||cfg.maxFutureSkewMs<0||cfg.maxFutureSkewMs>60_000)throw Error('invalid future price tolerance');
  if(!Number.isSafeInteger(cfg.maxConfidenceBps)||cfg.maxConfidenceBps<1||cfg.maxConfidenceBps>10_000)throw Error('invalid oracle confidence');
}
function feedSource(row:RheaAssetPriceMetadata|undefined):string|null {
  return row?.source==='DIRECT_PYTH' && row.priceIdentifier ? row.priceIdentifier : null;
}
function unique<T>(items:T[]):T[] {return [...new Set(items)];}
/** Cannot silence triage problems even if an oracle happens to return a valid price. */
function eligibleForQuote(r:CandidateEvidence):boolean {
  return r.status==='DEBT_SET_OBSERVED_UNPRICED' && r.reasons.length===0 && r.positionId!==null && r.collateralAssetIds.length>0;
}
export async function inspectPositionOracleEvidence(rpc:NearReadOnlyRpc,cfg:PriceEvidenceSettings):Promise<PriceEvidenceReport> {
  validate(cfg);
  const triage=await triageRheaDebtWindow(rpc,cfg);
  const block=Number(triage.blockHeight);
  if(!Number.isSafeInteger(block)||block<1)throw Error('invalid triage finalized block');
  const [account,oracle,assets,info,config]=await Promise.all([
    rpc.viewAccount(cfg.lendingContract,block),
    rpc.viewAccount(cfg.oracleContract,block),
    rpc.view<unknown>(cfg.lendingContract,'get_assets_paged',{},block),
    rpc.view<unknown>(cfg.lendingContract,'get_all_token_pyth_infos',{},block),
    rpc.view<unknown>(cfg.lendingContract,'get_config',{},block),
  ]);
  if(account.blockHeight!==triage.blockHeight||oracle.blockHeight!==triage.blockHeight||
    [assets,info,config].some(r=>r.blockHeight!==triage.blockHeight))throw Error('CROSS_BLOCK_ORACLE_METADATA');
  if(account.codeHash!==triage.observedLendingCodeHash||oracle.codeHash!==triage.observedOracleCodeHash)throw Error('CONTRACT_HASH_CHANGED_WITHIN_BLOCK');
  if(cfg.expectedLendingCodeHash&&account.codeHash!==cfg.expectedLendingCodeHash)throw Error('LENDING_HASH_PIN_MISMATCH');
  if(cfg.expectedOracleCodeHash&&oracle.codeHash!==cfg.expectedOracleCodeHash)throw Error('ORACLE_HASH_PIN_MISMATCH');
  if(!Array.isArray(assets.value)||assets.value.length<1||assets.value.length>256)throw Error('invalid listed assets');
  const ids=assets.value.map((row:unknown)=>{
    if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||!ID.test(row[0]))throw Error('invalid asset row');
    return row[0];
  });
  const priceMap=new Map(parseRheaPythMetadata(info.value,ids).assets.map(row=>[row.assetId,row]));
  const active=parseLendingPriceConfig(config.value)===true;
  // Cache by actual price feed ID: multiple lending assets may share one feed.
  type CachedQuote={kind:'OK';quote:ReturnType<typeof parseAggregateOraclePrices>['prices'] extends Map<string,infer V>?V:never}|
    {kind:'FAIL';reason:QuoteEvidenceFailure};
  const cache=new Map<string,CachedQuote>();
  const opts:AggregateOracleOptions={nowMs:cfg.nowMs,maxAgeMs:cfg.maxAgeMs,maxFutureSkewMs:cfg.maxFutureSkewMs,maxConfidenceBps:cfg.maxConfidenceBps};
  let queries=0;
  const getQuote=async(assetId:string,feedId:string):Promise<CachedQuote>=>{
    if(cache.has(feedId))return cache.get(feedId)!;
    if(queries>=cfg.maxFeedQueries)return {kind:'FAIL',reason:'QUOTE_REQUEST_LIMIT'};
    queries++;
    let outcome:CachedQuote;
    try {
      const res=await rpc.view<unknown>(cfg.oracleContract,'get_price_no_older_than',{
        price_id:feedId,age:Math.ceil(cfg.maxAgeMs/1000),
      },block);
      // Important: mocks or wrappers may not enforce NEAR RPC block-id invariants.
      if(res.blockHeight!==triage.blockHeight)throw Error('CROSS_BLOCK_ORACLE_QUOTE');
      const parsed=parseAggregateOraclePrices({[feedId]:res.value},[{assetId,priceId:feedId}],opts);
      const price=parsed.prices.get(assetId);
      if(!price)throw Error('price lookup unavailable');
      outcome={kind:'OK',quote:price};
    } catch(err) {
      if(err instanceof Error && err.message==='CROSS_BLOCK_ORACLE_QUOTE')throw err;
      const message=err instanceof Error?err.message:'';
      outcome={kind:'FAIL',reason:message.includes('stale')||message.includes('future')||message.includes('confidence')?'STALE_OR_LOW_CONFIDENCE':'ORACLE_QUOTE_REJECTED'};
    }
    cache.set(feedId,outcome);
    return outcome;
  };
  const records:PositionQuoteEvidence[]=[];
  for(const rec of triage.records){
    const blockers:QuoteEvidenceFailure[]=[];
    const quotes:ObservedPriceQuote[]=[];
    if(!eligibleForQuote(rec))blockers.push('UPSTREAM_TRIAGE_BLOCKED');
    if(!active)blockers.push('PYTH_CONFIG_DISABLED');
    const tokens=unique([...rec.debtAssetIds,...rec.collateralAssetIds]).sort();
    // Never request quotes for positions whose detailed record was not verified.
    if(blockers.length===0){
      const feeds=tokens.map(token=>({token,feed:feedSource(priceMap.get(token))}));
      if(feeds.some(x=>!x.feed))blockers.push('UNMAPPED_OR_DEFAULT_PRICE');
      if(blockers.length===0){
        for(const pair of feeds){
          const result=await getQuote(pair.token,pair.feed!);
          if(result.kind==='FAIL'){blockers.push(result.reason);continue;}
          const p=result.quote;
          quotes.push({assetId:pair.token,feedId:pair.feed!,priceMultiplier:p.price.multiplier.toString(),
            priceDecimals:p.price.decimals,publishTimeMs:p.publishTimeMs,ageMs:p.ageMs,confidenceBps:p.confidenceBps.toString()});
        }
      }
    }
    records.push({accountId:rec.accountId,positionId:rec.positionId,debtAssetIds:rec.debtAssetIds,
      collateralAssetIds:rec.collateralAssetIds,status:blockers.length?'BLOCKED':'QUOTED_UNAPPROVED',
      blockers:unique(blockers),quotes:quotes.sort((a,b)=>a.assetId.localeCompare(b.assetId)),
      executable:false,liquidationEligible:false,indicativeHealthFactor:null,estimatedProfit:null});
  }
  const blocked=records.filter(r=>r.status==='BLOCKED').length;
  return {mode:'READ_ONLY_RHEA_POSITION_ORACLE_EVIDENCE',
    status:triage.status==='NO_DEBT_FOUND'?'NO_DEBT_FOUND':blocked||triage.status==='INCOMPLETE_EVIDENCE'?'INCOMPLETE_ORACLE_EVIDENCE':'QUOTES_OBSERVED_UNAPPROVED',
    executionEnabled:false,liquidationParityVerified:false,priceParityVerified:false,
    blockHeight:triage.blockHeight,lendingCodeHash:account.codeHash,oracleCodeHash:oracle.codeHash,
    fromIndex:triage.fromIndex,nextOffset:triage.nextOffset,examinedAccounts:triage.scannedAccounts,
    triagedPositions:triage.records.length,feedQueries:queries,
    successfulFeeds:[...cache.values()].filter(v=>v.kind==='OK').length,blockedPositions:blocked,records,
    warnings:['FEED_QUOTE_DOES_NOT_PROVE_DEPLOYED_LIQUIDATION_MATH',
      'DEBT_AND_COLLATERAL_AMOUNTS_NOT_VALUED','NO_DERIVATIVE_OR_DEFAULT_PRICE_PROOF',
      'NO_CONTRACT_SOURCE_PROVENANCE','NO_EXECUTION_AUTHORIZATION',
      'INDEX_CHECKPOINTS_MAY_MOVE_BETWEEN_BLOCKS',
      ...(!cfg.expectedLendingCodeHash||!cfg.expectedOracleCodeHash?['CONTRACT_HASH_PINS_NOT_REVIEWED']:[])],
  };
}
