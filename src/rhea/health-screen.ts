import type { NearReadOnlyRpc } from './rpc.ts';
import { inspectPositionOracleEvidence, type PositionQuoteEvidence, type PriceEvidenceSettings } from './price-evidence.ts';
import { parseParityPools } from './deployed-share-parity.ts';
import { SOURCE_SCALE, sourceComputeDiscount, sourceDivRatio, sourceFromBalancePrice, sourceMulRatio,
  sourceSharesToAmount } from './source-math.ts';

/**
 * Stage 15: paper health factors for position-level verified reads.
 * Math reflects historical Burrow source only, NOT independently verified
 * deployed Rhea/Wasm or executable liquidation mechanics.
 */
const ACCOUNT=/^[a-z0-9._-]{2,64}$/;
const MAX_U128=(1n<<128n)-1n;
const INT=/^(0|[1-9][0-9]{0,38})$/;
const BPS=10_000n;
export type HealthBlocker='UPSTREAM_PRICE_OR_POSITION_GAP'|'DETAIL_BUDGET_EXHAUSTED'|
 'DETAIL_VIEW_UNAVAILABLE'|'CROSS_BLOCK_READ'|'UNSUPPORTED_POSITION_DETAIL'|
 'DEBT_OR_COLLATERAL_SET_MISMATCH'|'SOURCE_SHARE_BALANCE_MISMATCH'|'PRICE_OR_CONFIG_INVALID';
export interface PaperHealthPosition {
 accountId:string;positionId:string|null;
 mode:'PAPER_RHEA_HEALTH_ONLY';
 classification:'PAPER_AT_RISK_UNAPPROVED'|'PAPER_HEALTHY_UNAPPROVED'|'BLOCKED';
 blockers:HealthBlocker[];
 adjustedCollateralE27:string|null;adjustedDebtE27:string|null;
 healthFactorBps:string|null;discountE27:string|null;
 executionEnabled:false;liquidationEligible:false;liquidationParityVerified:false;
 estimatedProfit:null;
}
export interface HealthScreenOptions extends PriceEvidenceSettings {maxHealthDetails:number}
export interface HealthScreenReport {
 mode:'READ_ONLY_RHEA_PAPER_HEALTH';
 status:'NO_DEBT_FOUND'|'PAPER_HEALTH_EVIDENCE_UNAPPROVED'|'INCOMPLETE_HEALTH_EVIDENCE';
 blockHeight:string;lendingCodeHash:string;oracleCodeHash:string;
 positionsSeen:number;paperAtRisk:number;paperHealthy:number;blockedPositions:number;
 records:PaperHealthPosition[];
 executionEnabled:false;liquidationParityVerified:false;priceParityVerified:false;
 warnings:string[];
}
function obj(x:unknown,label:string):Record<string,unknown>{
 if(x===null||typeof x!=='object'||Array.isArray(x))throw Error(`invalid ${label}`);
 return x as Record<string,unknown>;
}
function uint(x:unknown,label:string):bigint{
 if(typeof x!=='string'||!INT.test(x))throw Error(`invalid ${label}`);
 const n=BigInt(x);if(n>MAX_U128)throw Error(`overflow ${label}`);return n;
}
function configInt(x:unknown,label:string,max:number,min=0):number{
 if((typeof x!=='string'&&typeof x!=='number')||!/^(0|[1-9][0-9]*)$/.test(String(x)))throw Error(`invalid ${label}`);
 const n=Number(x);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`invalid ${label}`);return n;
}
function fail(rec:PositionQuoteEvidence,reason:HealthBlocker):PaperHealthPosition{
 return {accountId:rec.accountId,positionId:rec.positionId,mode:'PAPER_RHEA_HEALTH_ONLY',classification:'BLOCKED',
   blockers:[reason],adjustedCollateralE27:null,adjustedDebtE27:null,healthFactorBps:null,discountE27:null,
   executionEnabled:false,liquidationEligible:false,liquidationParityVerified:false,estimatedProfit:null};
}
/** No fallbacks. A mismatched account/position schema is not a clean health score. */
export function calculatePaperPositionHealth(
 rec:PositionQuoteEvidence,detail:unknown,rawAssets:unknown,
):PaperHealthPosition {
 if(rec.status!=='QUOTED_UNAPPROVED'||rec.blockers.length>0||rec.positionId===null||!ACCOUNT.test(rec.accountId))
   return fail(rec,'UPSTREAM_PRICE_OR_POSITION_GAP');
 const assets=parseParityPools(rawAssets);
 const configs=new Map<string,{extraDecimals:number;volatility:bigint}>();
 if(!Array.isArray(rawAssets))throw Error('invalid assets');
 for(const entry of rawAssets){
   if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||!assets.has(entry[0]))throw Error('invalid market asset tuple');
   const conf=obj(obj(entry[1],'asset').config,'asset config');
   const extra=configInt(conf.extra_decimals??conf.extraDecimals,'extra decimals',36);
   const vol=BigInt(configInt(conf.volatility_ratio??conf.volatilityRatio,'volatility ratio',10_000,1));
   configs.set(entry[0],{extraDecimals:extra,volatility:vol});
 }
 const payload=obj(detail,'account all positions');
 const positions=obj(payload.positions,'isolated positions');
 if(Object.keys(positions).length>64||!Object.hasOwn(positions,rec.positionId))throw Error('position not found');
 const position=obj(positions[rec.positionId],'isolated position');
 if(rec.debtAssetIds.length===0||rec.collateralAssetIds.length===0)throw Error('missing debt or collateral');
 const expectedIds=new Set([...rec.debtAssetIds,...rec.collateralAssetIds]);
 if(expectedIds.size>256)throw Error('too many position tokens');
 const prices=new Map<string,{multiplier:bigint;decimals:number}>();
 for(const q of rec.quotes){
   if(prices.has(q.assetId)||!expectedIds.has(q.assetId)||!assets.has(q.assetId))throw Error('unexpected or duplicate quote');
   const multiplier=uint(q.priceMultiplier,'price multiplier');
   if(multiplier===0n)throw Error('zero oracle price');
   if(!Number.isSafeInteger(q.priceDecimals)||q.priceDecimals<0||q.priceDecimals>36)throw Error('invalid price decimals');
   prices.set(q.assetId,{multiplier,decimals:q.priceDecimals});
 }
 if(prices.size!==expectedIds.size)throw Error('position price set incomplete');
 const sum=(role:'borrowed'|'collateral'):bigint=>{
   const rows=position[role];if(!Array.isArray(rows)||rows.length>256)throw Error('invalid position rows');
   const expected=new Set(role==='borrowed'?rec.debtAssetIds:rec.collateralAssetIds);
   if(rows.length!==expected.size)throw Error('position token set mismatch');
   const seen=new Set<string>();let total=0n;
   for(const raw of rows){
     const row=obj(raw,'position token row'),token=row.token_id;
     if(typeof token!=='string'||!ACCOUNT.test(token)||!expected.has(token)||seen.has(token))throw Error('position token set mismatch');
     seen.add(token);
     const sh=uint(row.shares,'shares');if(sh===0n)throw Error('zero share token row');
     const bal=uint(row.balance,'balance');
     const pool=assets.get(token)!;
     const p=role==='borrowed'?pool.borrowed:pool.supplied;
     if(sourceSharesToAmount(sh,p,role==='borrowed')!==bal)throw Error('SOURCE_SHARE_BALANCE_MISMATCH');
     const cfg=configs.get(token)!,quote=prices.get(token)!;
     const usd=sourceFromBalancePrice(bal,quote.multiplier,quote.decimals,cfg.extraDecimals);
     total+=role==='borrowed'?sourceDivRatio(usd,cfg.volatility):sourceMulRatio(usd,cfg.volatility);
   }
   return total;
 };
 const debt=sum('borrowed'),collateral=sum('collateral');
 if(debt===0n)throw Error('zero adjusted debt');
 return {accountId:rec.accountId,positionId:rec.positionId,mode:'PAPER_RHEA_HEALTH_ONLY',
   classification:collateral<debt?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
   blockers:[],adjustedCollateralE27:collateral.toString(),adjustedDebtE27:debt.toString(),
   healthFactorBps:(collateral*BPS/debt).toString(),discountE27:sourceComputeDiscount(collateral,debt).toString(),
   executionEnabled:false,liquidationEligible:false,liquidationParityVerified:false,estimatedProfit:null};
}
function category(error:unknown):HealthBlocker {
 const message=error instanceof Error?error.message:'';
 if(message.includes('SOURCE_SHARE_BALANCE_MISMATCH'))return 'SOURCE_SHARE_BALANCE_MISMATCH';
 if(message.includes('set mismatch')||message.includes('not found'))return 'DEBT_OR_COLLATERAL_SET_MISMATCH';
 if(message.includes('config')||message.includes('price')||message.includes('volatility'))return 'PRICE_OR_CONFIG_INVALID';
 return 'UNSUPPORTED_POSITION_DETAIL';
}
/** All RPC calls pin to the block obtained from the full upstream evidence chain. */
export async function inspectRheaPaperHealth(rpc:NearReadOnlyRpc,cfg:HealthScreenOptions):Promise<HealthScreenReport>{
 if(!Number.isSafeInteger(cfg.maxHealthDetails)||cfg.maxHealthDetails<1||cfg.maxHealthDetails>20)throw Error('invalid maxHealthDetails');
 const upstream=await inspectPositionOracleEvidence(rpc,cfg);
 const block=Number(upstream.blockHeight);
 if(!Number.isSafeInteger(block)||block<1)throw Error('invalid finalized block');
 const [lending,assets]=await Promise.all([
   rpc.viewAccount(cfg.lendingContract,block),
   rpc.view<unknown>(cfg.lendingContract,'get_assets_paged',{},block),
 ]);
 if(lending.blockHeight!==upstream.blockHeight||lending.codeHash!==upstream.lendingCodeHash||assets.blockHeight!==upstream.blockHeight)
   throw Error('CROSS_BLOCK_OR_CONTRACT_DRIFT');
 const detailCache=new Map<string,unknown>();let attempts=0;
 const records:PaperHealthPosition[]=[];
 for(const position of upstream.records){
   if(position.status!=='QUOTED_UNAPPROVED'||position.blockers.length){records.push(fail(position,'UPSTREAM_PRICE_OR_POSITION_GAP'));continue;}
   let detail:unknown;
   if(detailCache.has(position.accountId))detail=detailCache.get(position.accountId);
   else{
     if(attempts>=cfg.maxHealthDetails){records.push(fail(position,'DETAIL_BUDGET_EXHAUSTED'));continue;}
     attempts++;
     try{
       const response=await rpc.view<unknown>(cfg.lendingContract,'get_account_all_positions',{account_id:position.accountId},block);
       if(response.blockHeight!==upstream.blockHeight)throw Error('CROSS_BLOCK_READ');
       detail=response.value;
       detailCache.set(position.accountId,detail);
     }catch(error){
       if(error instanceof Error&&error.message==='CROSS_BLOCK_READ')throw error;
       records.push(fail(position,'DETAIL_VIEW_UNAVAILABLE'));continue;
     }
   }
   try{records.push(calculatePaperPositionHealth(position,detail,assets.value));}
   catch(error){records.push(fail(position,category(error)));}
 }
 const blocked=records.filter(x=>x.classification==='BLOCKED').length;
 const healthy=records.filter(x=>x.classification==='PAPER_HEALTHY_UNAPPROVED').length;
 const risk=records.filter(x=>x.classification==='PAPER_AT_RISK_UNAPPROVED').length;
 return {mode:'READ_ONLY_RHEA_PAPER_HEALTH',
   status:upstream.status==='NO_DEBT_FOUND'?'NO_DEBT_FOUND':blocked||upstream.status==='INCOMPLETE_ORACLE_EVIDENCE'?'INCOMPLETE_HEALTH_EVIDENCE':'PAPER_HEALTH_EVIDENCE_UNAPPROVED',
   blockHeight:upstream.blockHeight,lendingCodeHash:upstream.lendingCodeHash,oracleCodeHash:upstream.oracleCodeHash,
   positionsSeen:records.length,paperAtRisk:risk,paperHealthy:healthy,blockedPositions:blocked,records,
   executionEnabled:false,liquidationParityVerified:false,priceParityVerified:false,
   warnings:['PAPER_HEALTH_NOT_DEPLOYED_WASM_PARITY','HISTORICAL_BURROW_ROUNDING_MODEL_ONLY',
     'PRICE_FEEDS_MAY_REQUIRE_DERIVATIVE_CONVERSION','NO_LIQUIDATION_ELIGIBILITY_OR_EXPECTED_PROFIT',
     'NO_TRANSACTION_EXECUTION_OR_SIGNING','BORROWER_INDEX_SAMPLE_NOT_FULL_MARKET_INDEX'],
 };
}
