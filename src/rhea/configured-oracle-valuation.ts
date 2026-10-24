import type {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools} from './deployed-share-parity.ts';
import {parseDetailedDebtScopes} from './candidate-triage.ts';
import {sourceSharesToAmount,sourceFromBalancePrice,sourceDivRatio,sourceMulRatio} from './source-math.ts';

/** Stage 28: independent price denomination cross-check against the LENDING-CONFIGURED
 * legacy oracle PriceData at one finalized block.
 *
 * This is a DIAGNOSTIC REFERENCE and cannot attest to the current Pyth execution
 * branch, liquidation profitability, or source/Wasm equivalence.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const U=/^(0|[1-9][0-9]{0,38})$/;
const NS=/^[1-9][0-9]{12,19}$/;
const E27=10n**27n, MAX=(1n<<128n)-1n;
export interface ConfiguredValuationOptions {
 lendingContract:string;configuredOracle:string;borrowerAccountId:string;
 expectedLendingCodeHash:string;expectedConfiguredOracleCodeHash:string;
 nowMs:number;maxQuoteAgeMs:number;sanityMaxUsd:string;
}
export interface ConfiguredValueLeg {
 positionId:string;role:'borrowed'|'collateral';tokenId:string;
 balanceInternalAtomic:string;shares:string;extraDecimals:number;
 oracleMultiplier:string;oracleDecimals:number;volatilityBps:number;
 referenceUsdE27:string;referenceAdjustedUsdE27:string;
}
export interface ConfiguredValuationReport {
 mode:'RHEA_STAGE28_CONFIGURED_ORACLE_PRICE_DENOMINATION';chain:'NEAR_MAINNET';
 status:'NO_DEBT'|'CONFIGURED_ORACLE_QUOTES_UNAVAILABLE'|'REFERENCE_VALUE_RECONCILED_UNAPPROVED'|'INCOMPLETE_REFERENCE_VALUATION';
 blockHeight:string;borrowerAccountId:string;
 lendingCodeHash:string;configuredOracleCodeHash:string;
 configuredOraclePriceViewReturned:boolean;
 pricePublishAgeMs:number|null;legacyOraclePriceRecencySeconds:number|null;
 quotedTokens:number;candidatePositions:number;
 positions:Array<{positionId:string;status:'PAPER_AT_RISK_UNAPPROVED'|'PAPER_HEALTHY_UNAPPROVED'|'BLOCKED';
 reason:string|null;adjustedCollateralE27:string|null;adjustedDebtE27:string|null;
 healthFactorBps:string|null;legs:ConfiguredValueLeg[];}>;
 valueUnitsReconciledToLegacyPriceShape:boolean;
 currentExecutionOracleBranchAttested:false;currentPythPriceParityAttested:false;
 fullStateReplayPerformed:false;walletFundsAttested:false;profitVerified:false;
 executionEnabled:false;maySign:false;mayBroadcast:false;
 blockers:string[];
}
function obj(v:unknown,label:string):Record<string,unknown> {
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_'+label);
 return v as Record<string,unknown>;
}
function quantity(v:unknown,name:string):bigint{
 if(typeof v!=='string'||!U.test(v)||BigInt(v)>MAX)throw Error('INVALID_'+name);
 return BigInt(v);
}
function bounded(v:unknown,name:string,min:number,max:number):number{
 if((typeof v!=='number'&&typeof v!=='string')||!/^(0|[1-9][0-9]*)$/.test(String(v))||
  !Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)throw Error('INVALID_'+name);
 return Number(v);
}
function settings(o:ConfiguredValuationOptions){
 if(![o.lendingContract,o.configuredOracle,o.borrowerAccountId].every(x=>typeof x==='string'&&ID.test(x))||
  o.lendingContract===o.configuredOracle||
  ![o.expectedLendingCodeHash,o.expectedConfiguredOracleCodeHash].every(x=>typeof x==='string'&&HASH.test(x))||
  !Number.isSafeInteger(o.nowMs)||Math.abs(Date.now()-o.nowMs)>30000||
  !Number.isSafeInteger(o.maxQuoteAgeMs)||o.maxQuoteAgeMs<1000||o.maxQuoteAgeMs>180000)
  throw Error('INVALID_STAGE28_OPTIONS');
 const cap=quantity(o.sanityMaxUsd,'SANITY_CAP_USD');
 if(cap<100n||cap>100_000_000n)throw Error('INVALID_STAGE28_SANITY_CAP');
 return cap;
}
function parsePrices(v:unknown,expected:string[],now:number,maxAge:number):{
 prices:Map<string,{multiplier:bigint;decimals:number}>;ageMs:number;recency:number;
}{
 const data=obj(v,'PRICE_DATA');
 const recency=bounded(data.recency_duration_sec,'PRICE_RECENCY_SECONDS',1,180);
 const timestamp=data.timestamp;
 if(typeof timestamp!=='string'||!NS.test(timestamp))throw Error('INVALID_PRICE_TIMESTAMP_NS');
 const ns=BigInt(timestamp),ms=ns/1_000_000n;
 if(ms>BigInt(Number.MAX_SAFE_INTEGER))throw Error('INVALID_PRICE_TIMESTAMP_MS');
 const age=now-Number(ms);
 if(age< -2000||age>maxAge)throw Error('STALE_CONFIGURED_ORACLE_DATA');
 if(!Array.isArray(data.prices)||data.prices.length!==expected.length)throw Error('INCOMPLETE_CONFIGURED_ORACLE_PRICE_DATA');
 const seen=new Set<string>(),out=new Map<string,{multiplier:bigint;decimals:number}>();
 for(const p of data.prices){
  const row=obj(p,'PRICE_ENTRY'),token=row.asset_id;
  if(typeof token!=='string'||!ID.test(token)||!expected.includes(token)||seen.has(token))throw Error('INVALID_PRICE_ASSET_SET');
  seen.add(token);
  if(row.price===null){continue;} // missing quote blocks affected positions
  const price=obj(row.price,'PRICE');
  const multiplier=quantity(price.multiplier,'ORACLE_PRICE_MULTIPLIER');
  const decimals=bounded(price.decimals,'ORACLE_PRICE_DECIMALS',0,36);
  if(multiplier===0n)throw Error('ZERO_ORACLE_PRICE');
  out.set(token,{multiplier,decimals});
 }
 if(seen.size!==expected.length)throw Error('MISSING_PRICE_ASSET_SET');
 return {prices:out,ageMs:age,recency};
}
function blocked(positionId:string,reason:string){
 return {positionId,status:'BLOCKED' as const,reason,adjustedCollateralE27:null,adjustedDebtE27:null,
  healthFactorBps:null,legs:[] as ConfiguredValueLeg[]};
}
export async function inspectConfiguredOracleDenomination(
 rpc:Pick<NearReadOnlyRpc,'viewAccount'|'view'>,o:ConfiguredValuationOptions,
):Promise<ConfiguredValuationReport>{
 const cap=settings(o);
 const latest=await rpc.viewAccount(o.lendingContract);
 if(!/^[1-9][0-9]{0,15}$/.test(latest.blockHeight)||
  !Number.isSafeInteger(Number(latest.blockHeight))||
  latest.codeHash!==o.expectedLendingCodeHash)throw Error('STAGE28_LENDING_CODE_DRIFT');
 const height=Number(latest.blockHeight),str=latest.blockHeight;
 const [lending,oracle,config,assetView,accountView]=await Promise.all([
  rpc.viewAccount(o.lendingContract,height),rpc.viewAccount(o.configuredOracle,height),
  rpc.view<unknown>(o.lendingContract,'get_config',{},height),
  rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},height),
  rpc.view<unknown>(o.lendingContract,'get_account_all_positions',{account_id:o.borrowerAccountId},height),
 ]);
 if([lending,oracle].some(v=>v.blockHeight!==str)||[config,assetView,accountView].some(v=>v.blockHeight!==str))
  throw Error('STAGE28_CROSS_BLOCK');
 if(lending.codeHash!==o.expectedLendingCodeHash||oracle.codeHash!==o.expectedConfiguredOracleCodeHash||
  obj(config.value,'CONFIG').oracle_account_id!==o.configuredOracle)
  throw Error('STAGE28_CODE_OR_ORACLE_POINTER_DRIFT');
 const pools=parseParityPools(assetView.value);
 const positions=parseDetailedDebtScopes(accountView.value,new Set(pools.keys()));
 const ids=[...new Set(positions.flatMap(p=>[...p.debtAssetIds,...p.collateralAssetIds]))].sort();
 if(ids.length>48)throw Error('TOO_MANY_POSITION_PRICE_TOKENS');
 const base={mode:'RHEA_STAGE28_CONFIGURED_ORACLE_PRICE_DENOMINATION' as const,
  chain:'NEAR_MAINNET' as const,blockHeight:str,borrowerAccountId:o.borrowerAccountId,
  lendingCodeHash:lending.codeHash,configuredOracleCodeHash:oracle.codeHash,
  currentExecutionOracleBranchAttested:false as const,currentPythPriceParityAttested:false as const,
  fullStateReplayPerformed:false as const,walletFundsAttested:false as const,profitVerified:false as const,
  executionEnabled:false as const,maySign:false as const,mayBroadcast:false as const,
  candidatePositions:positions.length};
 if(!positions.length)return {...base,status:'NO_DEBT' as const,configuredOraclePriceViewReturned:false,
  pricePublishAgeMs:null,legacyOraclePriceRecencySeconds:null,quotedTokens:0,positions:[],
  valueUnitsReconciledToLegacyPriceShape:false,
  blockers:['NO_CURRENT_BORROWER_DEBT','CURRENT_EXECUTION_ORACLE_BRANCH_UNATTESTED']};
 let parsed:ReturnType<typeof parsePrices>;
 try{
  const view=await rpc.view<unknown>(o.configuredOracle,'get_price_data',{asset_ids:ids},height);
  if(view.blockHeight!==str)throw Error('STAGE28_CROSS_BLOCK_CONFIGURED_ORACLE');
  parsed=parsePrices(view.value,ids,o.nowMs,o.maxQuoteAgeMs);
 }catch(e){
  if(e instanceof Error&&/CROSS_BLOCK/.test(e.message))throw e;
  return {...base,status:'CONFIGURED_ORACLE_QUOTES_UNAVAILABLE',configuredOraclePriceViewReturned:false,
   pricePublishAgeMs:null,legacyOraclePriceRecencySeconds:null,quotedTokens:0,
   positions:positions.map(p=>blocked(p.positionId,'LEGACY_PRICE_VIEW_MISSING_INVALID_OR_STALE')),
   valueUnitsReconciledToLegacyPriceShape:false,blockers:[
    'CONFIGURED_ORACLE_GET_PRICE_DATA_UNAVAILABLE_OR_INVALID',
    'CANNOT_USE_RAW_PYTH_EXPONENT_AS_LENDING_PRICE_DECIMALS',
    'NO_TRADE_ACTION_OR_PROFIT_PROOF',
   ]};
 }
 const assets=new Map<string,{extraDecimals:number;volatility:bigint}>();
 if(!Array.isArray(assetView.value))throw Error('INVALID_ASSET_TUPLES');
 for(const row of assetView.value){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||!pools.has(row[0]))throw Error('INVALID_ASSET_ROW');
  const cfg=obj(obj(row[1],'ASSET').config,'ASSET_CONFIG');
  const extra=bounded(cfg.extra_decimals??cfg.extraDecimals,'EXTRA_DECIMALS',0,36);
  const vol=BigInt(bounded(cfg.volatility_ratio??cfg.volatilityRatio,'VOLATILITY',1,10000));
  assets.set(row[0],{extraDecimals:extra,volatility:vol});
 }
 const all=obj(obj(accountView.value,'DETAILED_ACCOUNT').positions,'POSITIONS');
 const rows:ConfiguredValuationReport['positions']=[];
 const threshold=cap*E27;
 for(const p of positions){
  const tokens=obj(all[p.positionId],'POSITION');
  const used=new Set([...p.debtAssetIds,...p.collateralAssetIds]);
  if([...used].some(id=>!parsed.prices.has(id))){
   rows.push(blocked(p.positionId,'MISSING_CONFIGURED_ORACLE_TOKEN_QUOTE'));continue;
  }
  try {
   const legs:ConfiguredValueLeg[]=[];
   let collateral=0n,debt=0n;
   for(const role of ['borrowed','collateral'] as const) {
    const entries=tokens[role];
    if(!Array.isArray(entries)||entries.length>48)throw Error('INVALID_POSITION_LEGS');
    for(const value of entries){
     const v=obj(value,'LEG'),token=v.token_id;
     if(typeof token!=='string'||!used.has(token))throw Error('TOKEN_SET_DRIFT');
     const shares=quantity(v.shares,'SHARES');
     const balance=quantity(v.balance,'BALANCE');
     const market=pools.get(token);
     const quote=parsed.prices.get(token);
     const conf=assets.get(token);
     if(!market||!quote||!conf||shares===0n)throw Error('INCOMPLETE_SOURCE_ASSET');
     const recomputed=sourceSharesToAmount(shares,
      role==='borrowed'?market.borrowed:market.supplied,role==='borrowed');
     if(recomputed!==balance)throw Error('SOURCE_SHARE_BALANCE_DRIFT');
     const priced=sourceFromBalancePrice(balance,quote.multiplier,quote.decimals,conf.extraDecimals);
     const adjusted=role==='borrowed'?sourceDivRatio(priced,conf.volatility):sourceMulRatio(priced,conf.volatility);
     if(role==='borrowed')debt+=adjusted;else collateral+=adjusted;
     legs.push({positionId:p.positionId,role,tokenId:token,balanceInternalAtomic:balance.toString(),
      shares:shares.toString(),extraDecimals:conf.extraDecimals,
      oracleMultiplier:quote.multiplier.toString(),oracleDecimals:quote.decimals,
      volatilityBps:Number(conf.volatility),referenceUsdE27:priced.toString(),
      referenceAdjustedUsdE27:adjusted.toString()});
    }
   }
   if(debt===0n)throw Error('NO_DEBT_AFTER_PARSE');
   if(debt>threshold||collateral>threshold)throw Error('REFERENCE_UNIT_SANITY_CAP_EXCEEDED');
   rows.push({positionId:p.positionId,status:collateral<debt?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
    reason:null,adjustedCollateralE27:collateral.toString(),adjustedDebtE27:debt.toString(),
    healthFactorBps:(collateral*10000n/debt).toString(),legs});
  }catch(e){
   rows.push(blocked(p.positionId,e instanceof Error?e.message:'REFERENCE_VALUATION_FAILURE'));
  }
 }
 const failed=rows.filter(r=>r.status==='BLOCKED').length;
 return {...base,status:failed?'INCOMPLETE_REFERENCE_VALUATION':'REFERENCE_VALUE_RECONCILED_UNAPPROVED',
  configuredOraclePriceViewReturned:true,pricePublishAgeMs:parsed.ageMs,
  legacyOraclePriceRecencySeconds:parsed.recency,quotedTokens:parsed.prices.size,positions:rows,
  valueUnitsReconciledToLegacyPriceShape:failed===0,blockers:[
   ...(failed?['MISSING_OR_INVALID_LEGACY_ORACLE_PRICE_OR_SHARE_PARITY']:[]),
   'CONFIGURED_ORACLE_VIEW_NOT_EXECUTION_TIME_LIQUIDATION_PRICE_PROOF',
   'PYTH_AND_LEGACY_PRICE_PATHS_NOT_ATTESTED_TO_DEPLOYED_WASM',
   'NO_SANDBOX_REPLAY_FINANCING_GAS_SWAP_OR_SIGNER_APPROVAL',
  ]};
}
