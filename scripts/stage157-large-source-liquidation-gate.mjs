import {readFile,writeFile} from 'node:fs/promises';

// Stage157: quantify original mainnet Rhea + active-Pyth reference sizing
// BEFORE allowing a new isolated Workspaces attempt. These are NOT realized
// token prices, executable quotes, or evidence of a mainnet financing source.
const NUM=/^(0|[1-9][0-9]{0,70})$/;
const denied={chain:'NEAR_MAINNET',stage:'STAGE157_LARGE_LIQUIDATION_SOURCE_GATE',
 mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 actualMainnetLoan:false,actualFlashLoan:false,realizedNetEconomicProfitVerified:false,
 partnerFullyRepaidVerified:false};
const isNo=x=>x===false;
function decimal(x,name){
 if(typeof x!=='string'||!NUM.test(x))throw Error('STAGE157_INVALID_'+name);
 return BigInt(x);
}
function block(x){
 return typeof x==='string'&&/^[1-9][0-9]{0,15}$/.test(x);
}
export function stage157EvaluateLargeSourceLiquidation(qualification){
 const base={...denied,sourceBorrower:null,sourceBlockHeight:null,
  sourceRepayAsset:null,sourceSeizeAsset:null,referenceRepayUsdE27:null,
  referenceGrossUsdE27:null,minimumRepayUsdE27:'0',
  minimumGrossUsdE27:'0',sizeFloorApplied:false,canAttemptSandbox:false,
  status:'BLOCKED_NO_VERIFIED_LARGE_SOURCE',blockers:[]};
 if(!qualification||qualification.mode!=='RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX'||
  qualification.chain!=='NEAR_MAINNET'||
  !isNo(qualification.mainnetExecutionEnabled)||!isNo(qualification.maySignMainnet)||
  !isNo(qualification.mayBroadcastMainnet)||!isNo(qualification.netProfitVerified)||
  !isNo(qualification.walletApproved)||
  qualification.sourceDebtAccounts!==7801||
  !block(qualification.sourceBlockHeight)||
  !Array.isArray(qualification.rows)||
  !Number.isSafeInteger(qualification.reviewed)||
  qualification.reviewed<1||
  qualification.refreshed!==qualification.paperAtRiskFromPreviousScan)
  return {...base,blockers:['STAGE157_MISSING_TRUSTED_FRESH_SOURCE_ATTESTATION']};
 const p=qualification.bestProposal;
 if(!p||qualification.sandboxPlanReady!==true||
  qualification.status!=='SANDBOX_PLAN_READY_NOT_AUTHORIZED')
  return {...base,blockers:['STAGE157_NO_FRESH_REFERENCE_RULE_PASSING_BORROWER']};
 if(p.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  p.chain!=='NEAR_MAINNET'||p.status!=='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'||
  p.referenceRulesPass!==true||!block(p.blockHeight)||
  !isNo(p.executionEnabled)||!isNo(p.maySign)||!isNo(p.mayBroadcast)||
  !isNo(p.mainnetWalletApproved)||!isNo(p.sandboxStateReplaySucceeded)||
  !isNo(p.contractRouteParityVerified)||!isNo(p.gasAndSwapNetProfitVerified)||
  !isNo(p.repay?.fundsAvailabilityVerified)||
  typeof p.borrowerAccountId!=='string'||p.borrowerAccountId.length<2||
  p.repay?.tokenId!==p.seize?.tokenId||
  !qualification.rows.some(x=>x.borrowerAccountId===p.borrowerAccountId&&
   x.status==='FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY'&&
   x.observationBlockHeight===p.blockHeight&&
   x.paperGrossUsdE27===p.paperGrossUsdE27&&
   x.executionEligible===false&&x.netProfitVerified===false))
  return {...base,blockers:['STAGE157_SOURCE_REFERENCE_IDENTITY_OR_RULE_PARITY_FAILED']};
 // Stage37 currently implements the original LiNEAR -> LiNEAR Rhea route.
 // A larger WNEAR or other same-token *paper* opportunity must NOT be
 // promoted to executable status until its deployed route is verified.
 if(p.repay.tokenId!=='linear-protocol.near'||p.seize.tokenId!=='linear-protocol.near')
  return {...base,sourceBorrower:p.borrowerAccountId,sourceBlockHeight:p.blockHeight,
   sourceRepayAsset:p.repay.tokenId,sourceSeizeAsset:p.seize.tokenId,
   blockers:['STAGE157_UNSUPPORTED_DEPLOYED_LARGE_LIQUIDATION_ASSET_ROUTE']};
 let gross,repay,repayInternal,seizeInternal;
 try{
  gross=decimal(p.paperGrossUsdE27,'GROSS');
  repay=decimal(p.repay.referenceUsdE27,'REPAY');
  repayInternal=decimal(p.repay.amountLendingInternalAtomic,'REPAY_INTERNAL_UNITS');
  seizeInternal=decimal(p.seize.amountLendingInternalAtomic,'SEIZE_INTERNAL_UNITS');
 }catch(e){
  return {...base,blockers:[String(e.message).slice(0,120)]};
 }
 const observations={sourceBorrower:p.borrowerAccountId,sourceBlockHeight:p.blockHeight,
  sourceRepayAsset:p.repay.tokenId,sourceSeizeAsset:p.seize.tokenId,
  referenceRepayUsdE27:repay.toString(),referenceGrossUsdE27:gross.toString()};
 // No artificial dollar or 10x token floor. Rhea must still have a
 // positive protocol-denominated repay, genuine seized proceeds and a
 // positive same-token remainder. Conversion, financing and gas are separate
 // *mandatory* gates before any real-money execution, never assumed here.
 if(repayInternal===0n||seizeInternal<=repayInternal||repay===0n||gross===0n)
  return {...base,...observations,blockers:[
   ...(repayInternal===0n||repay===0n?['STAGE160_ZERO_REPAY_AMOUNT']:[]),
   ...(seizeInternal<=repayInternal?['STAGE159_NONPOSITIVE_INTERNAL_SAME_TOKEN_SPREAD']:[]),
   ...(gross===0n?['STAGE160_NO_POSITIVE_REFERENCE_SPREAD']:[])
  ]};
 return {...base,...observations,
  status:'ELIGIBLE_FOR_SOURCE_PINNED_LOCAL_SANDBOX_REPLAY_ONLY',
  canAttemptSandbox:true,
  blockers:['STAGE157_NOT_APPROVED_FOR_MAINNET_OR_REAL_PROFIT',
   'STAGE157_REAL_PROVIDER_INTEREST_GAS_AND_LIQUIDITY_NOT_VERIFIED']};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const src=process.env.STAGE157_STAGE38_EVIDENCE??'stage38-qualification.json';
 const output=process.env.STAGE157_REPORT??'stage157-large-source-admission.json';
 try{
  if(process.env.EXECUTION_ENABLED!=='false'||
   process.env.NEAR_WORKSPACES_NETWORK!=='sandbox'||
   process.env.NEAR_PRIVATE_KEY||process.env.MAINNET_PRIVATE_KEY)
   throw Error('STAGE157_KEYLESS_SANDBOX_ONLY');
  const source=JSON.parse(await readFile(src,'utf8'));
  const result=stage157EvaluateLargeSourceLiquidation(source);
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{encoding:'utf8',mode:0o600});
  console.log(JSON.stringify(result,null,2));
 }catch(error){
  const result={...denied,canAttemptSandbox:false,
   status:'BLOCKED_SOURCE_VALIDATION_ERROR',
   blockers:[String(error?.message??error).slice(0,180)]};
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{encoding:'utf8',mode:0o600});
  console.log(JSON.stringify(result,null,2));
  process.exitCode=2;
 }
}
