import type { RheaAccount, RheaMarket } from './valuation.ts';
import { sourceValueAccount, SOURCE_SCALE } from './source-math.ts';

/**
 * Compare Stage 2 conservative micro-USD arithmetic to the 27-decimal source
 * reproduction. Differences are reported, never papered over by a tolerance.
 * A match is not a deployed wasm match, audited source match or trade approval.
 */
export interface SourceDifferentialReport {
  mode: 'OFFLINE_SOURCE_DIFFERENTIAL';
  accountId: string;
  blockHeight: string;
  differences: string[];
  exactValuesAgreeAtMicroUsd: boolean;
  sourceModelAdjustedCollateralE27: string;
  sourceModelAdjustedDebtE27: string;
  sourceModelDiscountE27: string;
  researchOnly: true;
  executableContractParityVerified: false;
  approvedForExecution: false;
}
export function compareSourceToStage2(account: RheaAccount, market: RheaMarket): SourceDifferentialReport {
  const model = sourceValueAccount(account, market);
  const scale = SOURCE_SCALE / 1_000_000n;
  const cSource = BigInt(model.adjustedCollateralE27);
  const dSource = BigInt(model.adjustedDebtE27);
  const cStage = account.adjustedCollateralUsdE6;
  const dStage = account.adjustedDebtUsdE6;
  const differences: string[]=[];
  if (cStage!==cSource / scale) differences.push('ADJUSTED_COLLATERAL_ROUNDING_DIVERGENCE');
  if (dStage!==dSource / scale) differences.push('ADJUSTED_DEBT_ROUNDING_DIVERGENCE');
  const stageHealth = dStage===0n ? null : (cStage * 10_000n / dStage);
  const sourceHealth = dSource===0n ? null : (cSource * 10_000n / dSource);
  if(stageHealth!==sourceHealth) differences.push('DISPLAY_HEALTH_BPS_DIVERGENCE');
  return {mode:'OFFLINE_SOURCE_DIFFERENTIAL',accountId:account.accountId,blockHeight:market.blockHeight,
    differences,exactValuesAgreeAtMicroUsd:differences.length===0,
    sourceModelAdjustedCollateralE27:model.adjustedCollateralE27,
    sourceModelAdjustedDebtE27:model.adjustedDebtE27,sourceModelDiscountE27:model.discountE27,
    researchOnly:true,executableContractParityVerified:false,approvedForExecution:false};
}
