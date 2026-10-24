import {simulateArchivedLiquidationRules,type FourRuleScenario} from './liquidation-reference-simulation.ts';

/** Research-only schema from archived Burrow's Action::Liquidate.
 * No transaction envelope, gas, nonce, wallet/key, receiver, oracle_call or broadcast.
 * A positive paper margin is NOT proof of current Rhea execution/profit.
 */
const ACCOUNT=/^[a-z0-9._-]{2,64}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const U128=(1n<<128n)-1n;
const E27=10n**27n;
export interface DraftLeg {tokenId:string;amountAtomic:string}
export interface DraftCosts {
 repaidUsdE27:string;seizedUsdE27:string;maximumGasUsdE27:string;
 maximumSwapSlippageUsdE27:string;maximumFinancingUsdE27:string;
 maximumCompetitionUsdE27:string;minimumNetProfitUsdE27:string;maximumRepayUsdE27:string;
}
export interface ResearchDraftInput {
 borrowerAccountId:string;liquidatorAccountId:string;
 inAssets:DraftLeg[];outAssets:DraftLeg[];
 archivedSourceScenario:FourRuleScenario;
 budgets:DraftCosts;
}
function n(x:unknown,name:string):bigint{
 if(typeof x!=='string'||!UINT.test(x))throw Error('INVALID_'+name);
 const v=BigInt(x);if(v>U128)throw Error('OVERFLOW_'+name);
 return v;
}
function legs(input:unknown,name:string):{token_id:string;amount:string}[]{
 if(!Array.isArray(input)||input.length<1||input.length>4)throw Error('INVALID_'+name+'_LEGS');
 const seen=new Set<string>();
 return input.map((raw:unknown)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==2)
   throw Error('INVALID_'+name+'_LEG');
  const v=raw as Record<string,unknown>;
  if(typeof v.tokenId!=='string'||!ACCOUNT.test(v.tokenId)||seen.has(v.tokenId))
   throw Error('DUPLICATE_OR_INVALID_'+name+'_TOKEN');
  seen.add(v.tokenId);
  const amount=n(v.amountAtomic,name+'_AMOUNT');
  if(amount===0n)throw Error('ZERO_'+name+'_AMOUNT');
  return {token_id:v.tokenId,amount:amount.toString()};
 });
}
export function buildResearchLiquidationAction(input:ResearchDraftInput):{
 mode:'RHEA_ARCHIVED_LIQUIDATION_ACTION_DRAFT';
 status:'BLOCKED_NO_EXECUTION';
 historicalOnly:{Execute:{actions:[{Liquidate:{
  account_id:string;in_assets:{token_id:string;amount:string}[];
  out_assets:{token_id:string;amount:string}[];
 }}]}};
 estimatedPaperGrossUsdE27:string;estimatedPaperWorstCaseNetUsdE27:string;
 paperRulesPass:boolean;positiveWorstCaseMargin:boolean;
 blockers:string[];sourceContractParityVerified:false;
 executionEnabled:false;transactionPrepared:false;maySign:false;mayBroadcast:false;
}{
 if(!input||typeof input!=='object'||Array.isArray(input)||
  !ACCOUNT.test(input.borrowerAccountId)||!ACCOUNT.test(input.liquidatorAccountId)||
  input.borrowerAccountId===input.liquidatorAccountId)throw Error('INVALID_LIQUIDATION_PARTICIPANTS');
 const inside=legs(input.inAssets,'REPAY'),outside=legs(input.outAssets,'SEIZE');
 if(!input.budgets||typeof input.budgets!=='object'||Array.isArray(input.budgets)||
  Object.keys(input.budgets).length!==8)throw Error('INVALID_RESEARCH_BUDGET');
 const b=input.budgets;
 const repay=n(b.repaidUsdE27,'REPAY_USD');
 const seize=n(b.seizedUsdE27,'SEIZED_USD');
 const gas=n(b.maximumGasUsdE27,'GAS_USD');
 const swap=n(b.maximumSwapSlippageUsdE27,'SWAP_USD');
 const finance=n(b.maximumFinancingUsdE27,'FINANCE_USD');
 const competition=n(b.maximumCompetitionUsdE27,'COMPETITION_USD');
 const minimum=n(b.minimumNetProfitUsdE27,'MINIMUM_PROFIT_USD');
 const cap=n(b.maximumRepayUsdE27,'MAX_REPAY_USD');
 if(repay===0n||repay>cap||minimum<E27/100n||
   [gas,swap,finance,competition].some(v=>v===0n))throw Error('INVALID_CAP_OR_COST_BUFFER');
 const source=simulateArchivedLiquidationRules(input.archivedSourceScenario);
 if(repay!==BigInt(input.archivedSourceScenario.repaidE27)||
   seize!==BigInt(input.archivedSourceScenario.seizedE27))
  throw Error('PAPER_COSTS_DO_NOT_MATCH_REFERENCE_SCENARIO');
 const gross=seize-repay;
 const net=gross-gas-swap-finance-competition;
 const blockers=[
  ...(!source.referenceRulesPass?['ARCHIVED_FOUR_RULE_TEST_REJECTED']:[]),
  ...(net<minimum?['PAPER_NET_BELOW_CONFIGURED_MINIMUM']:[]),
  'EXACT_LIVE_BORROWER_AND_PRICE_PARITY_UNVERIFIED',
  'CURRENT_DEPLOYED_EXECUTE_WITH_PYTH_ROUTE_NOT_ATTESTED',
  'NO_STATEFUL_TX_REPLAY_OR_WALLET_BALANCE_ATTESTATION',
  'NO_REAL_SWAP_GAS_AND_COMPETITOR_EXECUTION_PROOF',
  'NO_AUTHORIZED_SIGNER_OR_REAL_MONEY_RELEASE',
 ];
 return {mode:'RHEA_ARCHIVED_LIQUIDATION_ACTION_DRAFT',status:'BLOCKED_NO_EXECUTION',
  historicalOnly:{Execute:{actions:[{Liquidate:{
   account_id:input.borrowerAccountId,in_assets:inside,out_assets:outside,
  }}]}},
  estimatedPaperGrossUsdE27:gross.toString(),estimatedPaperWorstCaseNetUsdE27:net.toString(),
  paperRulesPass:source.referenceRulesPass,positiveWorstCaseMargin:net>=minimum,
  blockers,sourceContractParityVerified:false,executionEnabled:false,
  transactionPrepared:false,maySign:false,mayBroadcast:false};
}
