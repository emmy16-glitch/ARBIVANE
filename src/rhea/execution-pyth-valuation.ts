import type {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools} from './deployed-share-parity.ts';
import {parseDetailedDebtScopes} from './candidate-triage.ts';
import {sourceSharesToAmount,sourceFromBalancePrice,sourceDivRatio,sourceMulRatio} from './source-math.ts';

/**
 * Reconstructs the active execute_with_pyth price representation using the
 * lending contract's own TokenPythInfo rows. This is integer-only and mirrors
 * the current Rhea SDK transformation:
 *
 *   multiplier = trunc((pyth.price * 10^pyth.expo) * 10^fraction_digits)
 *   decimals   = token_decimals + fraction_digits
 *
 * A configured extra_call composes its U128 1e24 ratio before truncation.
 * The resulting Price is suitable for the archived BigDecimal valuation
 * formula, but this read-only reconstruction is not transaction authorization.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const FEED=/^[a-f0-9]{64}$/;
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const SINT=/^-?(0|[1-9][0-9]{0,77})$/;
const U128=(1n<<128n)-1n;
const E27=10n**27n;
const RATIO_SCALE=10n**24n;
const EXTRA_CALLS=new Set(['get_nearx_price','ft_price','get_st_near_price','get_high_precision_virtual_price']);

function object(v:unknown,label:string):Record<string,unknown>{
 if(v===null||typeof v!=='object'||Array.isArray(v))throw Error(`INVALID_${label}`);
 return v as Record<string,unknown>;
}
function uint(v:unknown,label:string,max=U128):bigint{
 if((typeof v!=='string'&&typeof v!=='number')||!UINT.test(String(v)))throw Error(`INVALID_${label}`);
 const n=BigInt(v);if(n>max)throw Error(`INVALID_${label}`);return n;
}
function sint(v:unknown,label:string,min:bigint,max:bigint):bigint{
 if((typeof v!=='string'&&typeof v!=='number')||!SINT.test(String(v)))throw Error(`INVALID_${label}`);
 const n=BigInt(v);if(n<min||n>max)throw Error(`INVALID_${label}`);return n;
}
function bounded(v:unknown,label:string,min:number,max:number):number{
 if((typeof v!=='string'&&typeof v!=='number')||!UINT.test(String(v)))throw Error(`INVALID_${label}`);
 const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`INVALID_${label}`);return n;
}

export interface ExecutionPythPrice {
 multiplier:bigint;decimals:number;rawPrice:bigint;exponent:number;
 fractionDigits:number;tokenDecimals:number;ratioE24:bigint|null;
}

/** Exact positive-price conversion, with one final truncation like the SDK. */
export function reconstructExecutionPythPrice(input:{
 rawPrice:string|number;exponent:string|number;tokenDecimals:number;
 fractionDigits:number;ratioE24?:string|number|null;
}):ExecutionPythPrice{
 const price=sint(input.rawPrice,'PYTH_PRICE',1n,(1n<<63n)-1n);
 const exponent=Number(sint(input.exponent,'PYTH_EXPONENT',-36n,36n));
 const tokenDecimals=bounded(input.tokenDecimals,'TOKEN_DECIMALS',0,36);
 const fractionDigits=bounded(input.fractionDigits,'FRACTION_DIGITS',0,18);
 const ratio=input.ratioE24===undefined||input.ratioE24===null?null:uint(input.ratioE24,'EXTRA_CALL_RATIO');
 if(ratio===0n)throw Error('ZERO_EXTRA_CALL_RATIO');
 const shift=exponent+fractionDigits;
 let numerator=price*(ratio??RATIO_SCALE);
 let denominator=RATIO_SCALE;
 if(shift>=0)numerator*=10n**BigInt(shift);
 else denominator*=10n**BigInt(-shift);
 const multiplier=numerator/denominator;
 if(multiplier===0n||multiplier>U128)throw Error('INVALID_RECONSTRUCTED_PRICE');
 const decimals=tokenDecimals+fractionDigits;
 if(decimals>72)throw Error('INVALID_RECONSTRUCTED_DECIMALS');
 return {multiplier,decimals,rawPrice:price,exponent,fractionDigits,tokenDecimals,ratioE24:ratio};
}

interface TokenInfo {
 tokenId:string;decimals:number;fractionDigits:number;priceIdentifier:string|null;
 extraCall:string|null;defaultPrice:{multiplier:bigint;decimals:number}|null;
}
function tokenInfos(raw:unknown,needed:Set<string>):Map<string,TokenInfo>{
 const rows=object(raw,'PYTH_METADATA');
 const result=new Map<string,TokenInfo>();
 for(const tokenId of [...needed].sort()){
  if(!ID.test(tokenId))throw Error('INVALID_POSITION_TOKEN');
  const row=object(rows[tokenId],`PYTH_INFO_${tokenId}`);
  const decimals=bounded(row.decimals,'TOKEN_DECIMALS',0,36);
  const fractionDigits=row.fraction_digits===null||row.fraction_digits===undefined?4:
   bounded(row.fraction_digits,'FRACTION_DIGITS',0,18);
  const feed=row.price_identifier;
  const priceIdentifier=typeof feed==='string'&&FEED.test(feed)?feed:null;
  if(feed!==null&&feed!==undefined&&feed!==''&&!priceIdentifier)throw Error('INVALID_PRICE_IDENTIFIER');
  const extra=row.extra_call;
  const extraCall=extra===null||extra===undefined?null:typeof extra==='string'&&EXTRA_CALLS.has(extra)?extra:(()=>{throw Error('UNSUPPORTED_EXTRA_CALL');})();
  let defaultPrice:TokenInfo['defaultPrice']=null;
  if(row.default_price!==null&&row.default_price!==undefined){
   const p=object(row.default_price,'DEFAULT_PRICE');
   defaultPrice={multiplier:uint(p.multiplier,'DEFAULT_MULTIPLIER'),decimals:bounded(p.decimals,'DEFAULT_DECIMALS',0,72)};
   if(defaultPrice.multiplier===0n)throw Error('ZERO_DEFAULT_PRICE');
  }
  if(!defaultPrice&&!priceIdentifier)throw Error('MISSING_EXECUTION_PRICE_SOURCE');
  if(defaultPrice&&extraCall)throw Error('DEFAULT_PRICE_WITH_EXTRA_CALL');
  result.set(tokenId,{tokenId,decimals,fractionDigits,priceIdentifier,extraCall,defaultPrice});
 }
 return result;
}

interface RawPyth {price:bigint;expo:number;conf:bigint;publishTime:number}
function rawPyth(v:unknown,nowMs:number,maxAgeMs:number,maxConfidenceBps:number):RawPyth{
 const p=object(v,'PYTH_QUOTE');
 const price=sint(p.price,'PYTH_PRICE',1n,(1n<<63n)-1n);
 const expo=Number(sint(p.expo,'PYTH_EXPO',-36n,36n));
 const conf=uint(p.conf,'PYTH_CONF',(1n<<64n)-1n);
 const publish=uint(p.publish_time,'PYTH_PUBLISH_TIME',(1n<<64n)-1n);
 const publishMs=publish*1000n;
 if(publishMs>BigInt(Number.MAX_SAFE_INTEGER))throw Error('INVALID_PYTH_PUBLISH_TIME');
 const age=nowMs-Number(publishMs);
 if(age>maxAgeMs||age< -2000)throw Error('STALE_OR_FUTURE_PYTH_PRICE');
 const confidenceBps=(conf*10000n+price-1n)/price;
 if(confidenceBps>BigInt(maxConfidenceBps))throw Error('PYTH_CONFIDENCE_TOO_WIDE');
 return {price,expo,conf,publishTime:Number(publish)};
}

export interface ExecutionPythValuationOptions {
 lendingContract:string;pythOracle:string;borrowerAccountId:string;
 expectedLendingCodeHash:string;expectedPythOracleCodeHash:string;
 nowMs:number;maxConfidenceBps:number;sanityMaxUsd:string;maxConcurrency:number;
 pinnedBlockHeight?:number;
}
export interface ExecutionPythValuationReport {
 mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION';chain:'NEAR_MAINNET';
 status:'NO_DEBT'|'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED'|'INCOMPLETE_ACTIVE_PYTH_VALUATION';
 blockHeight:string;borrowerAccountId:string;lendingCodeHash:string;pythOracleCodeHash:string;
 pythEnabled:boolean;legacyOracleEnabled:boolean;pythValiditySeconds:number;
 uniqueFeeds:number;extraCalls:number;candidatePositions:number;
 positions:Array<{positionId:string;status:'PAPER_AT_RISK_UNAPPROVED'|'PAPER_HEALTHY_UNAPPROVED'|'BLOCKED';
  reason:string|null;adjustedCollateralE27:string|null;adjustedDebtE27:string|null;healthFactorBps:string|null;
  legs:Array<{role:'borrowed'|'collateral';tokenId:string;balanceInternalAtomic:string;shares:string;
   extraDecimals:number;priceSource:'PYTH'|'PYTH_DERIVED'|'DEFAULT';priceMultiplier:string;priceDecimals:number;
   rawPythPrice:string|null;pythExponent:number|null;fractionDigits:number;tokenDecimals:number;ratioE24:string|null;
   referenceUsdE27:string;referenceAdjustedUsdE27:string}>}>;
 priceConstructionMatchesCurrentSdk:boolean;deployedMetadataAndConfigObserved:boolean;
 sourceWasmReproduciblyMatched:false;transactionReplayVerified:false;profitVerified:false;
 executionEnabled:false;maySign:false;mayBroadcast:false;blockers:string[];
}

function validateOptions(o:ExecutionPythValuationOptions):bigint{
 if(![o.lendingContract,o.pythOracle,o.borrowerAccountId].every(x=>ID.test(x))||o.lendingContract===o.pythOracle||
  ![o.expectedLendingCodeHash,o.expectedPythOracleCodeHash].every(x=>HASH.test(x))||
  !Number.isSafeInteger(o.nowMs)||Math.abs(Date.now()-o.nowMs)>30000||
  !Number.isSafeInteger(o.maxConfidenceBps)||o.maxConfidenceBps<1||o.maxConfidenceBps>300||
  !Number.isSafeInteger(o.maxConcurrency)||o.maxConcurrency<1||o.maxConcurrency>16||
 (o.pinnedBlockHeight!==undefined&&(!Number.isSafeInteger(o.pinnedBlockHeight)||o.pinnedBlockHeight<1)))throw Error('INVALID_ACTIVE_PYTH_OPTIONS');
 const cap=uint(o.sanityMaxUsd,'SANITY_CAP_USD');
 if(cap<100n||cap>100_000_000n)throw Error('INVALID_SANITY_CAP');
 return cap;
}
async function mapBounded<T,R>(values:T[],limit:number,fn:(v:T)=>Promise<R>):Promise<R[]>{
 const out=new Array<R>(values.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{
  for(;;){const i=next++;if(i>=values.length)return;out[i]=await fn(values[i]!);}
 }));
 return out;
}

export async function inspectActivePythValuation(
 rpc:Pick<NearReadOnlyRpc,'viewAccount'|'view'>,o:ExecutionPythValuationOptions,
):Promise<ExecutionPythValuationReport>{
 const cap=validateOptions(o);
 const latest=await rpc.viewAccount(o.lendingContract,o.pinnedBlockHeight);
 if(!UINT.test(latest.blockHeight)||!Number.isSafeInteger(Number(latest.blockHeight))||latest.codeHash!==o.expectedLendingCodeHash)
  throw Error('ACTIVE_PYTH_LENDING_CODE_DRIFT');
 const block=Number(latest.blockHeight),height=latest.blockHeight;
 const [lending,oracle,configView,assetsView,metadataView,accountView]=await Promise.all([
  rpc.viewAccount(o.lendingContract,block),rpc.viewAccount(o.pythOracle,block),
  rpc.view<unknown>(o.lendingContract,'get_config',{},block),
  rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},block),
  rpc.view<unknown>(o.lendingContract,'get_all_token_pyth_infos',{},block),
  rpc.view<unknown>(o.lendingContract,'get_account_all_positions',{account_id:o.borrowerAccountId},block),
 ]);
 if([lending,oracle].some(x=>x.blockHeight!==height)||[configView,assetsView,metadataView,accountView].some(x=>x.blockHeight!==height))
  throw Error('ACTIVE_PYTH_CROSS_BLOCK');
 if(lending.codeHash!==o.expectedLendingCodeHash||oracle.codeHash!==o.expectedPythOracleCodeHash)
  throw Error('ACTIVE_PYTH_CODE_DRIFT');
 const config=object(configView.value,'LENDING_CONFIG');
 if(config.enable_pyth_oracle!==true||config.enable_price_oracle!==false||config.pyth_oracle_account_id!==o.pythOracle)
  throw Error('ACTIVE_PYTH_CONFIG_NOT_EXCLUSIVE');
 const validSeconds=bounded(config.pyth_price_valid_duration_sec,'PYTH_VALIDITY',1,180);
 const pools=parseParityPools(assetsView.value);
 const scopes=parseDetailedDebtScopes(accountView.value,new Set(pools.keys()));
 const base={mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION' as const,chain:'NEAR_MAINNET' as const,
  blockHeight:height,borrowerAccountId:o.borrowerAccountId,lendingCodeHash:lending.codeHash,
  pythOracleCodeHash:oracle.codeHash,pythEnabled:true,legacyOracleEnabled:false,pythValiditySeconds:validSeconds,
  candidatePositions:scopes.length,priceConstructionMatchesCurrentSdk:true,deployedMetadataAndConfigObserved:true,
  sourceWasmReproduciblyMatched:false as const,transactionReplayVerified:false as const,profitVerified:false as const,
  executionEnabled:false as const,maySign:false as const,mayBroadcast:false as const};
 if(!scopes.length)return {...base,status:'NO_DEBT' as const,uniqueFeeds:0,extraCalls:0,positions:[],
  blockers:['NO_CURRENT_BORROWER_DEBT','NO_TRANSACTION_REPLAY_OR_PROFIT_PROOF']};
 const needed=new Set(scopes.flatMap(x=>[...x.debtAssetIds,...x.collateralAssetIds]));
 const infos=tokenInfos(metadataView.value,needed);
 const feeds=[...new Set([...infos.values()].flatMap(x=>x.defaultPrice||!x.priceIdentifier?[]:[x.priceIdentifier]))].sort();
 const feedRows=await mapBounded(feeds,o.maxConcurrency,async feed=>{
  const v=await rpc.view<unknown>(o.pythOracle,'get_price_no_older_than',{price_id:feed,age:validSeconds},block);
  if(v.blockHeight!==height)throw Error('ACTIVE_PYTH_CROSS_BLOCK_QUOTE');
  return [feed,rawPyth(v.value,o.nowMs,validSeconds*1000,o.maxConfidenceBps)] as const;
 });
 const quotes=new Map(feedRows);
 const derived=[...infos.values()].filter(x=>x.extraCall!==null);
 const ratioRows=await mapBounded(derived,o.maxConcurrency,async info=>{
  const v=await rpc.view<unknown>(info.tokenId,info.extraCall!,{},block);
  if(v.blockHeight!==height)throw Error('ACTIVE_PYTH_CROSS_BLOCK_RATIO');
  return [info.tokenId,uint(v.value,'EXTRA_CALL_RATIO')] as const;
 });
 const ratios=new Map(ratioRows);
 const prices=new Map<string,{multiplier:bigint;decimals:number;raw:RawPyth|null;info:TokenInfo;ratio:bigint|null}>();
 for(const info of infos.values()){
  if(info.defaultPrice){prices.set(info.tokenId,{...info.defaultPrice,raw:null,info,ratio:null});continue;}
  const raw=quotes.get(info.priceIdentifier!);if(!raw)throw Error('MISSING_PYTH_QUOTE');
  const ratio=ratios.get(info.tokenId)??null;
  const p=reconstructExecutionPythPrice({rawPrice:raw.price.toString(),exponent:raw.expo,
   tokenDecimals:info.decimals,fractionDigits:info.fractionDigits,ratioE24:ratio?.toString()});
  prices.set(info.tokenId,{multiplier:p.multiplier,decimals:p.decimals,raw,info,ratio});
 }
 const configs=new Map<string,{extra:number;vol:bigint}>();
 if(!Array.isArray(assetsView.value))throw Error('INVALID_ASSET_ROWS');
 for(const row of assetsView.value){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string')throw Error('INVALID_ASSET_ROW');
  const cfg=object(object(row[1],'ASSET').config,'ASSET_CONFIG');
  configs.set(row[0],{extra:bounded(cfg.extra_decimals,'EXTRA_DECIMALS',0,36),
   vol:BigInt(bounded(cfg.volatility_ratio,'VOLATILITY',1,10000))});
 }
 const positions=object(object(accountView.value,'ACCOUNT').positions,'POSITIONS');
 const result:ExecutionPythValuationReport['positions']=[];
 for(const scope of scopes){
  try{
   const position=object(positions[scope.positionId],'POSITION');let collateral=0n,debt=0n;
   const legs:ExecutionPythValuationReport['positions'][number]['legs']=[];
   for(const role of ['borrowed','collateral'] as const){
    const rows=position[role];if(!Array.isArray(rows))throw Error('INVALID_POSITION_LEGS');
    for(const rawLeg of rows){
     const leg=object(rawLeg,'POSITION_LEG'),token=leg.token_id;
     if(typeof token!=='string'||!needed.has(token))throw Error('POSITION_TOKEN_DRIFT');
     const shares=uint(leg.shares,'SHARES'),balance=uint(leg.balance,'BALANCE');
     const pool=pools.get(token),price=prices.get(token),cfg=configs.get(token);
     if(!pool||!price||!cfg||shares===0n)throw Error('INCOMPLETE_POSITION_ASSET');
     const computed=sourceSharesToAmount(shares,role==='borrowed'?pool.borrowed:pool.supplied,role==='borrowed');
     if(computed!==balance)throw Error('SOURCE_SHARE_BALANCE_DRIFT');
     const usd=sourceFromBalancePrice(balance,price.multiplier,price.decimals,cfg.extra);
     const adjusted=role==='borrowed'?sourceDivRatio(usd,cfg.vol):sourceMulRatio(usd,cfg.vol);
     if(role==='borrowed')debt+=adjusted;else collateral+=adjusted;
     legs.push({role,tokenId:token,balanceInternalAtomic:balance.toString(),shares:shares.toString(),
      extraDecimals:cfg.extra,priceSource:price.info.defaultPrice?'DEFAULT':price.info.extraCall?'PYTH_DERIVED':'PYTH',
      priceMultiplier:price.multiplier.toString(),priceDecimals:price.decimals,
      rawPythPrice:price.raw?.price.toString()??null,pythExponent:price.raw?.expo??null,
      fractionDigits:price.info.fractionDigits,tokenDecimals:price.info.decimals,ratioE24:price.ratio?.toString()??null,
      referenceUsdE27:usd.toString(),referenceAdjustedUsdE27:adjusted.toString()});
    }
   }
   if(debt===0n)throw Error('NO_DEBT_AFTER_PARSE');
   if(debt>cap*E27||collateral>cap*E27)throw Error('RECONSTRUCTED_VALUE_SANITY_CAP_EXCEEDED');
   result.push({positionId:scope.positionId,status:collateral<debt?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
    reason:null,adjustedCollateralE27:collateral.toString(),adjustedDebtE27:debt.toString(),
    healthFactorBps:(collateral*10000n/debt).toString(),legs});
  }catch(e){result.push({positionId:scope.positionId,status:'BLOCKED',reason:e instanceof Error?e.message:'VALUATION_FAILED',
   adjustedCollateralE27:null,adjustedDebtE27:null,healthFactorBps:null,legs:[]});}
 }
 const blocked=result.some(x=>x.status==='BLOCKED');
 return {...base,status:blocked?'INCOMPLETE_ACTIVE_PYTH_VALUATION':'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',
  uniqueFeeds:feeds.length,extraCalls:derived.length,positions:result,blockers:[
   ...(blocked?['ACTIVE_PYTH_VALUATION_INCOMPLETE']:[]),
   'DEPLOYED_WASM_NOT_REPRODUCIBLY_MATCHED_TO_SOURCE',
   'LIQUIDATION_TRANSACTION_NOT_REPLAYED','FINANCING_SWAP_GAS_COMPETITION_AND_REALIZED_PROFIT_UNVERIFIED',
  ]};
}
