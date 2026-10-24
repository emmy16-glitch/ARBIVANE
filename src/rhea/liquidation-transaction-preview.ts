import type {Stage24Report,CodeWitness} from './deployed-wasm-witness.ts';

/**
 * Stage 25: recognize the deployed oracle-routed liquidation method surface and
 * produce a constrained UNSIGNED PREVIEW of the public Burrow bot action format.
 * This is a preview of ABI-shaped JSON, NOT an approved transaction, replay,
 * source/deployed bytecode parity, financing proof or release authorization.
 *
 * Reference pattern: burrowHQ/burrowland-liquidation-bot/src/libs/account.js
 * (Borrow -> Liquidate -> Withdraw, sent via priceoracle.near/oracle_call).
 * That archived code's share buffers/prices must NOT be assumed current.
 */
const ACCOUNT=/^[a-z0-9._-]{2,64}$/;
const HEIGHT=/^[1-9][0-9]{0,15}$/;
const CODEHASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const UINT=/^[1-9][0-9]{0,38}$/;
const U128=(1n<<128n)-1n;
const MAX_LEGS=4;
const MAX_BORROW_OVERAGE_BPS=10n; // <=0.1% hypothetical rounding buffer, not an on-chain safe value
export interface AtomicLeg{tokenId:string;amount:string}
export interface ReferenceLiquidationInput{
 borrowerId:string;liquidatorId:string;
 blockHeight:string;lendingCodeHash:string;configuredOracleCodeHash:string;
 repay:AtomicLeg[];seize:AtomicLeg[];borrow:AtomicLeg[];
 withdrawalCount:number;
}
export interface Stage25Route {
 mode:'RHEA_STAGE25_ORACLE_LIQUIDATION_ROUTE';
 blockHeight:string;lendingContract:string;configuredOracleContract:string;
 aggregatePriceReader:string;oracleIsDistinctFromAggregate:boolean;
 lendingExecuteExportObserved:true;configuredOracleCallExportObserved:true;
 deployedSourceParityVerified:false;contractLiquidationBranchVerified:false;
 transactionReplayed:false;pricesAndNetProfitVerified:false;
 executionEnabled:false;mayBroadcast:false;
 blockers:string[];
}
export interface LiquidationPreview{
 mode:'RHEA_STAGE25_UNSIGNED_SOURCE_PATTERN_PREVIEW';
 route:Stage25Route;
 contractId:string;methodName:'oracle_call';
 args:{receiver_id:string;msg:string};
 actions:Array<Record<string,unknown>>;
 selectedBorrowerId:string;selectedLiquidatorId:string;
 gasEstimateVerified:false;walletBalanceVerified:false;assetAvailabilityVerified:false;
 atomicQuantitiesOnly:true;liquidationEligible:false;netProfitVerified:false;
 transactionReplayed:false;executionEnabled:false;mayBroadcast:false;
 blockers:string[];
}
function obj(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_STAGE25_OBJECT');
 return v as Record<string,unknown>;
}
function id(v:unknown):string{if(typeof v!=='string'||!ACCOUNT.test(v))throw Error('INVALID_ACCOUNT_OR_ASSET_ID');return v;}
function h(v:unknown):string{
 if(typeof v!=='string'||!HEIGHT.test(v)||BigInt(v)>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error('INVALID_FINALIZED_HEIGHT');
 return v;
}
function codehash(v:unknown):string{if(typeof v!=='string'||!CODEHASH.test(v))throw Error('INVALID_DEPLOYED_CODE_HASH');return v;}
function assertWitness(w:CodeWitness):void{
 if(!w||w.codeBytesHashMatched!==true||w.sourceWasmReproduciblyMatched!==false||
 w.executionEnabled!==false||w.mayBroadcast!==false||
 w.observedCodeHash!==w.computedCodeHash||w.observedCodeHash!==w.rpcReportedCodeHash||
 !Array.isArray(w.publicFunctionExports))throw Error('UNVERIFIED_STAGE24_CODE_WITNESS');
 id(w.accountId);h(w.blockHeight);codehash(w.observedCodeHash);
}
export function inspectStage25LiquidationRoute(source:unknown):Stage25Route{
 const report=obj(source) as unknown as Stage24Report;
 if(report.mode!=='RHEA_STAGE24_DEPLOYED_WASM_WITNESS'||
 report.status!=='DEPLOYED_CODE_BYTES_ATTESTED_SOURCE_UNVERIFIED'||
 report.chain!=='NEAR_MAINNET'||report.executionEnabled!==false||report.mayBroadcast!==false||
 report.sourceWasmReproduciblyMatched!==false||report.deployedLiquidationRulesVerified!==false||
 report.transactionDryRunPerformed!==false||report.netProfitVerified!==false||
 report.walletAuthorized!==false)throw Error('STAGE24_NOT_RESEARCH_ONLY');
 assertWitness(report.lending);assertWitness(report.oracle);
 h(report.blockHeight);
 if(report.lending.blockHeight!==report.blockHeight||report.oracle.blockHeight!==report.blockHeight)
  throw Error('STAGE24_CROSS_BLOCK_WITNESS');
 if(report.lendingConfigOracleAccountId===null)throw Error('CONFIGURED_ORACLE_UNKNOWN');
 id(report.lendingConfigOracleAccountId);
 const configured=report.lendingConfigOracleAccountId===report.oracle.accountId?report.oracle:report.configuredOracle;
 if(!configured||configured.accountId!==report.lendingConfigOracleAccountId)
  throw Error('CONFIGURED_ORACLE_NOT_ATTESTED');
 assertWitness(configured);
 if(configured.blockHeight!==report.blockHeight)throw Error('CONFIGURED_ORACLE_CROSS_BLOCK');
 if(report.oracleAccountPointerStatus!==(report.oracle.accountId===configured.accountId?'EXPLICIT_MATCH':'DISTINCT_CONFIGURED_ORACLE'))
  throw Error('INCONSISTENT_ORACLE_POINTER_STATUS');
 if(!report.lending.publicFunctionExports.includes('execute'))throw Error('LENDING_EXECUTE_EXPORT_MISSING');
 if(!configured.publicFunctionExports.includes('oracle_call'))throw Error('CONFIGURED_ORACLE_CALL_EXPORT_MISSING');
 return {mode:'RHEA_STAGE25_ORACLE_LIQUIDATION_ROUTE',blockHeight:report.blockHeight,
  lendingContract:report.lending.accountId,configuredOracleContract:configured.accountId,
  aggregatePriceReader:report.oracle.accountId,
  oracleIsDistinctFromAggregate:configured.accountId!==report.oracle.accountId,
  lendingExecuteExportObserved:true,configuredOracleCallExportObserved:true,
  deployedSourceParityVerified:false,contractLiquidationBranchVerified:false,
  transactionReplayed:false,pricesAndNetProfitVerified:false,executionEnabled:false,mayBroadcast:false,
  blockers:['EXPORTED_METHOD_NAMES_ARE_NOT_EXECUTABLE_BRANCH_PARITY',
   'ARCHIVED_BOT_ACTION_FORMAT_NOT_CONFIRMED_AGAINST_CURRENT_WASM',
   'NO_FRESH_REAL_BORROWER_LIQUIDATION_ELIGIBILITY',
   'NO_FULL_TOKEN_AMOUNTS_OR_WALLET_CAPITAL_CHECK',
   'NO_PINNED_STATE_TRANSACTION_REPLAY',
   'NO_GAS_SWAP_SLIPPAGE_COMPETITION_OR_NET_PROFIT_PROOF',
   'NO_OPERATOR_APPROVAL_OR_HARD_LOSS_LIMITS']};
}
function atomic(v:unknown):string{
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)throw Error('INVALID_ATOMIC_AMOUNT');
 return v;
}
function legs(value:unknown,name:string):AtomicLeg[]{
 if(!Array.isArray(value)||value.length<1||value.length>MAX_LEGS)throw Error('INVALID_'+name+'_LEGS');
 const seen=new Set<string>();
 return value.map((x:unknown)=>{
  const o=obj(x);
  if(Object.keys(o).sort().join(',')!=='amount,tokenId')throw Error('UNEXPECTED_'+name+'_FIELD');
  const tokenId=id(o.tokenId),amount=atomic(o.amount);
  if(seen.has(tokenId))throw Error('DUPLICATE_'+name+'_ASSET');
  seen.add(tokenId);
  return {tokenId,amount};
 });
}
export function prepareReferenceLiquidationPreview(
 stage24:unknown,raw:unknown,currentFinalizedHeight:string,
):LiquidationPreview{
 const route=inspectStage25LiquidationRoute(stage24);
 const p=obj(raw);
 const expected=['blockHeight','borrow','borrowerId','configuredOracleCodeHash','lendingCodeHash',
  'liquidatorId','repay','seize','withdrawalCount'];
 if(Object.keys(p).sort().join(',')!==expected.sort().join(','))
  throw Error('UNEXPECTED_LIQUIDATION_PROPOSAL_FIELDS');
 const now=BigInt(h(currentFinalizedHeight));
 const height=BigInt(h(p.blockHeight));
 if(height!==BigInt(route.blockHeight)||now<height||now-height>10n)
  throw Error('STALE_LIQUIDATION_RESEARCH_SNAPSHOT');
 if(codehash(p.lendingCodeHash)!==(stage24 as Stage24Report).lending.observedCodeHash)
  throw Error('LENDING_CODE_HASH_DRIFT');
 const sr=stage24 as Stage24Report;
 const witness=sr.configuredOracle??sr.oracle;
 if(codehash(p.configuredOracleCodeHash)!==witness.observedCodeHash)
  throw Error('CONFIGURED_ORACLE_HASH_DRIFT');
 const borrower=id(p.borrowerId),liquidator=id(p.liquidatorId);
 if(borrower===liquidator)throw Error('LIQUIDATOR_EQUALS_BORROWER');
 if(!Number.isSafeInteger(p.withdrawalCount)||Number(p.withdrawalCount)<0||
   Number(p.withdrawalCount)>MAX_LEGS)throw Error('INVALID_WITHDRAWAL_COUNT');
 const repay=legs(p.repay,'REPAY'),seize=legs(p.seize,'SEIZE'),borrow=legs(p.borrow,'BORROW');
 if(borrow.length!==repay.length)throw Error('BORROW_AND_REPAY_ASSET_COUNT_MISMATCH');
 const borrowed=new Map(borrow.map(x=>[x.tokenId,BigInt(x.amount)]));
 for(const x of repay){
  const value=borrowed.get(x.tokenId),repaid=BigInt(x.amount);
  if(value===undefined||value<repaid||
     // Require buffer <=0.1% *per token*, but still NOT attest share rounding.
     (value-repaid)*10000n>repaid*MAX_BORROW_OVERAGE_BPS)
   throw Error('BORROWED_ATOMIC_CAP_VIOLATION');
 }
 if(Number(p.withdrawalCount)>seize.length)throw Error('WITHDRAWAL_COUNT_EXCEEDS_SEIZED_ASSETS');
 const borrowActions=borrow.map(x=>({Borrow:{token_id:x.tokenId,amount:x.amount}}));
 const liquidateAction={Liquidate:{
  account_id:borrower,
  in_assets:repay.map(x=>({token_id:x.tokenId,amount:x.amount})),
  out_assets:seize.map(x=>({token_id:x.tokenId,amount:x.amount})),
 }};
 const withdrawActions=seize.slice(0,Number(p.withdrawalCount))
  .map(x=>({Withdraw:{token_id:x.tokenId,max_amount:x.amount}}));
 const actions=[...borrowActions,liquidateAction,...withdrawActions];
 return {mode:'RHEA_STAGE25_UNSIGNED_SOURCE_PATTERN_PREVIEW',route,
  contractId:route.configuredOracleContract,methodName:'oracle_call',
  args:{receiver_id:route.lendingContract,msg:JSON.stringify({Execute:{actions}})},
  actions,selectedBorrowerId:borrower,selectedLiquidatorId:liquidator,
  gasEstimateVerified:false,walletBalanceVerified:false,assetAvailabilityVerified:false,
  atomicQuantitiesOnly:true,liquidationEligible:false,netProfitVerified:false,
  transactionReplayed:false,executionEnabled:false,mayBroadcast:false,
  blockers:[...route.blockers,'RAW_TOKEN_AMOUNTS_ARE_UNVERIFIED_AND_MUST_NOT_BE_SENT',
   'NO_SIGNER_GAS_OR_ATTACHED_DEPOSIT_IS_PROVIDED']};
}
