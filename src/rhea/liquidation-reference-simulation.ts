import {SOURCE_SCALE,sourceCheckLiquidationRules} from './source-math.ts';

/** Stage 23: deterministic reference arithmetic only. No signable payload,
 * contract execution or claim that this is NEAR transaction dry-run.
 */
const UINT=/^(0|[1-9][0-9]{0,54})$/;
const MAX=(1n<<128n)-1n;
export type FourRuleScenario={
 beforeCollateralE27:string;beforeDebtE27:string;afterCollateralE27:string;afterDebtE27:string;
 repaidE27:string;seizedE27:string;
};
export interface SourceReferenceSimulation{
 mode:'RHEA_ARCHIVED_SOURCE_ONLY_NOT_DEPLOYED_DRY_RUN';
 referenceRulesPass:boolean;reasons:string[];initialDiscountE27:string;newDiscountE27:string;
 grossPaperSpreadE27:string|null;sourceContractParityVerified:false;transactionSimulated:false;
 gasVerified:false;netProfitVerified:false;executionEnabled:false;mayBroadcast:false;
 warnings:string[];
}
function u(v:unknown,name:string):bigint{
 if(typeof v!=='string'||!UINT.test(v))throw Error('INVALID_'+name);
 const n=BigInt(v);if(n>MAX)throw Error('OVERFLOW_'+name);return n;
}
export function simulateArchivedLiquidationRules(input:unknown):SourceReferenceSimulation{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_ARCHIVED_SCENARIO');
 const v=input as Record<string,unknown>;
 const names=['beforeCollateralE27','beforeDebtE27','afterCollateralE27','afterDebtE27','repaidE27','seizedE27'] as const;
 if(Object.keys(v).length!==names.length)throw Error('INVALID_ARCHIVED_SCENARIO_FIELDS');
 const n=Object.fromEntries(names.map(k=>[k,u(v[k],k)])) as Record<typeof names[number],bigint>;
 if(n.beforeDebtE27===0n||n.repaidE27===0n||n.seizedE27===0n)
  throw Error('EMPTY_LIQUIDATION_SCENARIO');
 const checked=sourceCheckLiquidationRules(n);
 const reasons=[...checked.reasons];
 // Do not imply a plausible source result is a profitable trade.
 const spread=n.seizedE27>n.repaidE27?(n.seizedE27-n.repaidE27).toString():null;
 return {mode:'RHEA_ARCHIVED_SOURCE_ONLY_NOT_DEPLOYED_DRY_RUN',
  referenceRulesPass:checked.validBySourceRules,reasons,
  initialDiscountE27:checked.initialDiscountE27,newDiscountE27:checked.newDiscountE27,
  grossPaperSpreadE27:spread,sourceContractParityVerified:false,transactionSimulated:false,
  gasVerified:false,netProfitVerified:false,executionEnabled:false,mayBroadcast:false,
  warnings:['SOURCE_ONLY_NOT_PROOF_OF_EXECUTABLE_LIQUIDATION',
   'DEPLOYED_WASM_NOT_REPRODUCIBLY_ATTESTED','DYNAMIC_PRICES_SLIPPAGE_AND_GAS_NOT_MODELED',
   'PUBLIC_GUIDE_LISTS_THREE_CHECKS_ARCHIVED_SOURCE_LISTS_FOUR']};
}
export const USDE27=SOURCE_SCALE;
