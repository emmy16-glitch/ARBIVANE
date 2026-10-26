import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {stage139AuditHistoricalCollateral} from './stage139-flash-liquidity-admission.mjs';
import {stage142CreateFinancingIntent} from './stage142-financing-intent.mjs';
import {stage144SimulatePartnerFundedRhea} from './stage144-partner-financing-simulation.mjs';
import {stage145ProductionReview} from './stage145-production-qualification.mjs';

const parse=async file=>JSON.parse(await readFile(file,'utf8'));
/** Replay real Stage93 source checks plus *separate* simulated partner finance.
 * This cannot convert a real collateral-backed Rhea liquidation into a
 * previously unperformed partner-funded Rhea transaction.
 */
export async function stage144EvaluateWithOriginalStage93(archiveDir){
 const funding=await parse(join(archiveDir,'stage49-sandbox-funding.json'));
 const witness=await parse(join(archiveDir,'stage41-sandbox-balance-settlement.json'));
 const proposal=await parse(join(archiveDir,'stage38-positive-stage35-evidence.json'));
 const genuine=stage139AuditHistoricalCollateral(funding,witness,proposal);
 const input=stage142CreateFinancingIntent({
  mode:'AUTHORIZED_PARTNER_ESCROW',
  sourceAccountId:'external-partner.test.near',
  repayAssetId:'linear-protocol.near',
  principalAtomic:'1000000',premiumAtomic:'1000',
  maxGasAndStorageInRepayAssetAtomic:'1000',
  maxSwapAndSlippageAtomic:'1000',minimumNetAtomic:'1000',
  observedMinProceedsAtomic:'1100000',ownerCollateralAtomic:'0',
  partnerEscrowAtomic:'1001000',
  operatorAccountId:'sillywiki4201.near',
  borrowerAccountId:'arbivane-replay.test.near',
  evaluatedAtMs:1000,quoteExpiresAtMs:2000
 });
 const sandboxModel=stage144SimulatePartnerFundedRhea(input,{
  partnerActualSimulatedBalanceAtomic:'1500000',
  liquidationProceedsAtomic:'1100000',
  gasAndStorageCostAtomic:'1000',swapCostAtomic:'1000'
 });
 const productionGate=stage145ProductionReview({
  financingIntent:input,journal:sandboxModel.journal,
  localSimulation:sandboxModel,assertions:{}});
 if(genuine.financingClass!=='RHEA_OVER_COLLATERALIZED_BORROW'||
  genuine.noCollateralFlashLoanDemonstrated!==false||
  genuine.observedDepositedNativeSandboxYocto!=='1000000000000000000000000'||
  sandboxModel.realNearWorkspacesExecution!==false||
  productionGate.canActivateMainnet!==false)
  throw Error('STAGE144_ORIGINAL_CAPITAL_MISCLASSIFIED');
 return {
  mode:'STAGE144_ORIGINAL_RHEA_EVIDENCE_VS_PARTNER_SIMULATION',
  authenticStage93RheaLiquidationObserved:true,
  authenticStage93FundingClass:genuine.financingClass,
  authenticStage93DepositedSandboxCollateralYocto:
   genuine.observedDepositedNativeSandboxYocto,
  authenticStage93NetSeizedFtAtomic:genuine.localSeizedFtIncreaseAtomic,
  stage144PartnerModelComplete:sandboxModel.state==='RECONCILED',
  partnerFundsActuallyTransferredToRhea:false,
  actualStage144PartnerFinancedWorkspacesLiquidation:false,
  stage144SourceAndRheaAmountsAreNotComparable:true,
  modelSimulationNetAtomic:sandboxModel.simulatedResidualActorAtomic,
  netRealizableNearTradingProfitProven:false,
  lenderPrincipalAndPremiumRepaidOnchain:false,
  ownerMainnetProfitPaid:false,mainnetBroadcastPermitted:false,
  productionStatus:productionGate.status,
  blockers:[
   'AUTHENTIC_STAGE93_USED_LOCAL_WNEAR_COLLATERAL_NOT_PARTNER_FLASH_LIQUIDITY',
   'PARTNER_TRANSFER_ON_NEAR_SANDBOX_NOT_PERFORMED',
   'BORROWER_LIQUIDATION_AND_EXTERNAL_LENDER_REPAYMENT_NOT_COEXECUTED',
   'LOCAL_PARTNER_SIMULATION_IS_SEPARATE_FROM_ACTUAL_RHEA_RECEIPTS',
   'EXTERNAL_ONCHAIN_LENDER_AND_REAL_GAS_SPONSOR_NOT_PROVEN'
  ]
 };
}
if(process.argv[1]&&process.argv[1].endsWith('stage144-authentic-bridge-cli.mjs')){
 const [source,output]=process.argv.slice(2);
 if(!source||!output||!/^[A-Za-z0-9_.-]{1,100}\.json$/.test(output))
  throw Error('STAGE144_EXPECT_SOURCE_DIR_AND_BASENAME_JSON');
 const report=await stage144EvaluateWithOriginalStage93(source);
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({realRhea:report.authenticStage93RheaLiquidationObserved,
  externallyFinancedRhea:report.actualStage144PartnerFinancedWorkspacesLiquidation,
  financingClass:report.authenticStage93FundingClass,mayBroadcast:false}));
}
