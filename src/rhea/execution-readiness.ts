/** Execution readiness is a NON-AUTHORIZING checklist.
 * Even passing documentation gates cannot directly enable signing or transfers.
 */
export type ExecutionBlocker='CURRENT_BORROWER_HEALTH_NOT_VERIFIED'|
 'DEPLOYED_LIQUIDATION_MATH_NOT_ATTESTED'|'ORACLE_PRICE_PARITY_NOT_ATTESTED'|
 'FINANCING_AND_GAS_NOT_ATTESTED'|'NEAR_TRANSACTION_SIMULATION_NOT_ATTESTED'|
 'WALLET_CUSTODY_AND_LIMITS_NOT_APPROVED'|'CURRENT_COMPETITION_AND_NET_PROFIT_UNVERIFIED'|
 'INDEPENDENT_RELEASE_APPROVAL_NOT_PRESENT';
export interface ExecutionAttestations {
 currentBorrowerHealthVerified:boolean;deployedLiquidationMathAttested:boolean;
 oraclePriceParityAttested:boolean;financingGasAttested:boolean;
 nearTransactionSimulationAttested:boolean;walletCustodyLimitsApproved:boolean;
 competitionAndNetProfitVerified:boolean;independentReleaseApproved:boolean;
}
export function assessExecutionReadiness(e:unknown):{
 mode:'NEAR_RHEA_EXECUTION_READINESS';status:'BLOCKED'|'RESEARCH_GATES_REPORTED_ONLY';
 blockers:ExecutionBlocker[];executionEnabled:false;mayBroadcast:false;
}{
 if(!e||typeof e!=='object'||Array.isArray(e))throw Error('INVALID_ATTESTATIONS');
 const obj=e as Record<string,unknown>;
 const keys:[keyof ExecutionAttestations,ExecutionBlocker][]=[
  ['currentBorrowerHealthVerified','CURRENT_BORROWER_HEALTH_NOT_VERIFIED'],
  ['deployedLiquidationMathAttested','DEPLOYED_LIQUIDATION_MATH_NOT_ATTESTED'],
  ['oraclePriceParityAttested','ORACLE_PRICE_PARITY_NOT_ATTESTED'],
  ['financingGasAttested','FINANCING_AND_GAS_NOT_ATTESTED'],
  ['nearTransactionSimulationAttested','NEAR_TRANSACTION_SIMULATION_NOT_ATTESTED'],
  ['walletCustodyLimitsApproved','WALLET_CUSTODY_AND_LIMITS_NOT_APPROVED'],
  ['competitionAndNetProfitVerified','CURRENT_COMPETITION_AND_NET_PROFIT_UNVERIFIED'],
  ['independentReleaseApproved','INDEPENDENT_RELEASE_APPROVAL_NOT_PRESENT']
 ];
 if(Object.keys(obj).length!==keys.length||keys.some(([k])=>typeof obj[k]!=='boolean'))throw Error('INVALID_ATTESTATIONS');
 const blockers=keys.filter(([k])=>!obj[k]).map(([,reason])=>reason);
 return {mode:'NEAR_RHEA_EXECUTION_READINESS',status:blockers.length?'BLOCKED':'RESEARCH_GATES_REPORTED_ONLY',
  blockers,executionEnabled:false,mayBroadcast:false};
}
