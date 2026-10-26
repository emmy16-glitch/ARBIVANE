import {readFile,writeFile} from 'node:fs/promises';

/**
 * Stage157: read-only, source-evidenced LARGE liquidation admission.
 * A large partner loan is NOT a large liquidation. This screen requires
 * both the actual source-sized repay and theoretical liquidation discount
 * to exceed explicit USD thresholds at an independently pinned block.
 * The decision can ONLY unlock an isolated local Sandbox replay.
 */
const E27=10n**27n;
const UINT=/^(0|[1-9][0-9]{0,55})$/;
const digits=(v,label)=>{
 if(typeof v!=='string'||!UINT.test(v))throw Error('STAGE157_BAD_'+label);
 return BigInt(v);
};
const threshold=(v,label)=>{
 if(typeof v!=='string'||!/^[1-9][0-9]{0,55}$/.test(v))
  throw Error('STAGE157_BAD_'+label);
 return BigInt(v);
};
export function stage157LargeSourceAdmission({qualification,minRepayUsdE27=(500n*E27).toString(),
 minGrossUsdE27=(5n*E27).toString()}){
 const minRepay=threshold(minRepayUsdE27,'MIN_REPAY');
 const minGross=threshold(minGrossUsdE27,'MIN_GROSS');
 if(!qualification||qualification.mode!=='RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX'||
  qualification.chain!=='NEAR_MAINNET'||qualification.mainnetExecutionEnabled!==false||
  qualification.maySignMainnet!==false||qualification.mayBroadcastMainnet!==false||
  qualification.netProfitVerified!==false||qualification.sourceDebtAccounts!==7801||
  !Number.isSafeInteger(qualification.startFinding)||
  !Number.isSafeInteger(qualification.nextFinding)||
  qualification.startFinding<0||qualification.nextFinding>7801||
  qualification.nextFinding<=qualification.startFinding)
  throw Error('STAGE157_UNTRUSTED_SOURCE_QUALIFICATION');
 const p=qualification.bestProposal;
 let admitted=false,blocker='NO_SOURCE_SIZED_ELIGIBLE_PROPOSAL';
 let debtUsd='0',grossUsd='0',accountId=null,sourceBlock=null,tokenId=null;
 if(p!==null&&p!==undefined){
  if(qualification.status!=='SANDBOX_PLAN_READY_NOT_AUTHORIZED'||
   qualification.sandboxPlanReady!==true||
   !Number.isSafeInteger(qualification.positiveSourcePlans)||
   qualification.positiveSourcePlans<1||
   !Array.isArray(qualification.rows)||
   !qualification.rows.some(row=>
    row.borrowerAccountId===p.borrowerAccountId&&
    row.status==='FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY'&&
    row.observationBlockHeight===p.blockHeight))
   throw Error('STAGE157_UNATTESTED_BEST_PROPOSAL');
  if(p.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
   p.chain!=='NEAR_MAINNET'||p.status!=='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'||
   p.referenceRulesPass!==true||p.executionEnabled!==false||
   p.maySign!==false||p.mayBroadcast!==false||
   p.gasAndSwapNetProfitVerified!==false||p.sandboxStateReplaySucceeded!==false||
   typeof p.borrowerAccountId!=='string'||p.borrowerAccountId.length<2||
   typeof p.blockHeight!=='string'||!/^[1-9][0-9]{0,15}$/.test(p.blockHeight)||
   !p.repay||!p.seize)
   throw Error('STAGE157_UNTRUSTED_SOURCE_PROPOSAL');
  debtUsd=digits(p.repay.referenceUsdE27,'SOURCE_REPAY_USD').toString();
  grossUsd=digits(p.paperGrossUsdE27,'PAPER_GROSS_USD').toString();
  accountId=p.borrowerAccountId;
  sourceBlock=p.blockHeight;
  tokenId=p.repay.tokenId;
  if(p.repay.tokenId!=='linear-protocol.near'||
     p.seize.tokenId!=='linear-protocol.near')
   blocker='UNSUPPORTED_LARGE_SOURCE_ASSET_ROUTE';
  else if(BigInt(debtUsd)<minRepay)
   blocker='SOURCE_LIQUIDATION_REPAY_BELOW_LARGE_THRESHOLD';
  else if(BigInt(grossUsd)<minGross)
   blocker='SOURCE_LIQUIDATION_DISCOUNT_BELOW_LARGE_THRESHOLD';
  else {
   admitted=true;blocker=null;
  }
 }
 return {
  mode:'STAGE157_SOURCE_ATTESTED_LARGE_LIQUIDATION_ADMISSION',
  chain:'NEAR_SANDBOX',
  status:admitted?'LARGE_SOURCE_CANDIDATE_SANDBOX_ONLY':'NO_VERIFIED_LARGE_LIQUIDATION',
  blocker,sourceFindingRange:[qualification.startFinding,qualification.nextFinding],
  sourceBorrowerAccountId:accountId,sourceBlockHeight:sourceBlock,
  repayAssetId:tokenId,sourceRepayReferenceUsdE27:debtUsd,
  sourcePaperGrossUsdE27:grossUsd,
  requiredSourceRepayUsdE27:minRepay.toString(),
  requiredPaperGrossUsdE27:minGross.toString(),
  sourceSizeLargeEnoughForSandbox:admitted,
  actualOriginalSettlementVerified:false,realFinancingCostsVerified:false,
  actualMainnetProfitVerified:false,externalLenderVerified:false,
  noOwnerFundsUsed:true,maySignMainnet:false,mayBroadcastMainnet:false,
  executionEnabled:false,
  warnings:['SOURCE_USD_NOT_TOKEN_ATOMIC_AMOUNT',
   'PAPER_GROSS_EXCLUDES_REAL_GAS_INTEREST_SLIPPAGE_AND_SWAP',
   'ONLY_GENUINE_LOCAL_SANDBOX_FULL_RECEIPTS_MAY_ESTABLISH_LIQUIDATION',
   'NO_MAINNET_TRADE_OR_EXTERNAL_FLASH_LOAN'],
 };
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const e=process.env;
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||
  e.NEAR_WORKSPACES_NETWORK!=='sandbox'||e.NEAR_PRIVATE_KEY||e.MAINNET_PRIVATE_KEY)
  throw Error('STAGE157_REQUIRES_KEYLESS_READONLY_MAINNET_AND_SANDBOX_REPLAY');
 const input=e.STAGE157_QUALIFICATION_PATH??'stage38-qualification.json';
 const report=e.STAGE157_ADMISSION_PATH??'stage157-large-source-admission.json';
 const result=stage157LargeSourceAdmission({
  qualification:JSON.parse(await readFile(input,'utf8')),
  minRepayUsdE27:e.STAGE157_MIN_REPAY_USD_E27??(500n*E27).toString(),
  minGrossUsdE27:e.STAGE157_MIN_GROSS_USD_E27??(5n*E27).toString()
 });
 await writeFile(report,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
