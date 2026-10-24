/** Independent check against reviewed expectation data, NOT a deployed contract simulator.
 * Every case requires a source identity, block and explicit expected numbers. Without
 * verified on-chain/audited contract outputs, the gate remains unapproved even on match.
 */
import type {RheaAccount} from './valuation.ts';
export interface RheaReferenceCase {
  accountId:string;
  observedBlock:string;
  sourceType:'DOC_EXAMPLE'|'REVIEWED_DEPLOYED_CONTRACT';
  contractCodeHash?:string;
  referenceId:string;
  expectedAdjustedCollateralUsdE6:string;
  expectedAdjustedDebtUsdE6:string;
  expectedHealthFactorBps:string|null;
}
export interface ParityResult {
  mode:'REFERENCE_COMPARISON_ONLY';
  matchesReference:boolean;
  reasons:string[];
  executableContractParityApproved:false;
  accountId:string;
  blockHeight:string;
}
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const ACCOUNT=/^[a-z0-9._-]{2,64}$/;
export function compareRheaReferenceCase(account:RheaAccount,accountBlock:string, ref:RheaReferenceCase):ParityResult {
  if (!ACCOUNT.test(ref.accountId)||account.accountId!==ref.accountId || !UINT.test(accountBlock)||accountBlock!==ref.observedBlock) throw new Error('account or block identity mismatch');
  if (!['DOC_EXAMPLE','REVIEWED_DEPLOYED_CONTRACT'].includes(ref.sourceType)||typeof ref.referenceId!=='string'||ref.referenceId.length<8||ref.referenceId.length>512) throw new Error('invalid reference provenance');
  if (ref.sourceType==='REVIEWED_DEPLOYED_CONTRACT' && (!ref.contractCodeHash || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(ref.contractCodeHash))) throw new Error('deployed code hash pin required');
  const comparisons:[string,string,string][]=[
    ['ADJUSTED_COLLATERAL', account.adjustedCollateralUsdE6.toString(),ref.expectedAdjustedCollateralUsdE6],
    ['ADJUSTED_DEBT',account.adjustedDebtUsdE6.toString(),ref.expectedAdjustedDebtUsdE6],
  ];
  const reasons:string[]=[];
  for(const [label,actual,expected] of comparisons){if(!UINT.test(expected))throw new Error('invalid expected '+label);if(actual!==expected)reasons.push(`${label}_DIVERGES`)}
  const health=account.healthFactorBps?.toString()??null;
  if(ref.expectedHealthFactorBps!==null && !UINT.test(ref.expectedHealthFactorBps)) throw new Error('invalid expected health');
  if(health!==ref.expectedHealthFactorBps)reasons.push('HEALTH_FACTOR_DIVERGES');
  // Important: an expected value published by an operator is not proof of the
  // current deployed contract's internal math or a safe liquidation opportunity.
  return {mode:'REFERENCE_COMPARISON_ONLY',matchesReference:reasons.length===0,reasons,
    executableContractParityApproved:false,accountId:account.accountId,blockHeight:accountBlock};
}
