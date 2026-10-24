/** Independent READ-ONLY derived-price arithmetic. These are diagnostic comparisons,
 * NOT protocol-approved on-chain prices. Never infer a ratio from a token's ticker.
 */
import type { RheaPrice } from './valuation.ts';
export type RatioKind = 'NEARX_NEAR' | 'LINEAR_NEAR' | 'STNEAR_NEAR' | 'RNEAR_NEAR' | 'XRHEA_RHEA';
export interface AttestedRatioInput {
  kind: RatioKind;
  underlyingAssetId: string;
  derivativeAssetId: string;
  /** Raw integer ratio: derivative underlying units = derivative units * numerator / denominator. */
  numerator: string;
  denominator: string;
  ratioReadBlock: string;
  underlyingPriceReadBlock: string;
  sourceMethod: string;
  /** This requires human reviewed contract source and method semantics; not supplied by metadata. */
  operatorApproved: boolean;
}
export interface DerivedPriceDiagnostic {
  mode: 'DERIVED_PRICE_DIAGNOSTIC';
  comparable: boolean;
  approvedForExecution: false;
  sourceKind: RatioKind;
  derivativeAssetId: string;
  blockHeight: string;
  conservativeMultiplier: string;
  decimals: number;
  reason: string;
}
const CONTRACT=/^[a-z0-9._-]{2,64}$/;
const POS=/^[1-9][0-9]{0,77}$/;
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const VALID:Record<RatioKind,string[]>={
  NEARX_NEAR:['get_nearx_price'],LINEAR_NEAR:['ft_price'],STNEAR_NEAR:['get_stnear_price'],RNEAR_NEAR:['ft_price'],
  XRHEA_RHEA:['get_high_precision_virtual_price'],
};
export function deriveDiagnosticPrice(input: AttestedRatioInput, base: RheaPrice): DerivedPriceDiagnostic {
  if (!CONTRACT.test(input.underlyingAssetId) || !CONTRACT.test(input.derivativeAssetId) || input.underlyingAssetId===input.derivativeAssetId) throw new Error('invalid derivative pairing');
  if (!POS.test(input.numerator) || !POS.test(input.denominator)) throw new Error('invalid ratio');
  if (!UINT.test(input.ratioReadBlock)||!UINT.test(input.underlyingPriceReadBlock)||input.ratioReadBlock!==input.underlyingPriceReadBlock) throw new Error('ratio and price must use same pinned block');
  if (!Object.hasOwn(VALID,input.kind) || !VALID[input.kind].includes(input.sourceMethod)) throw new Error('unrecognized ratio method for token class');
  if (input.operatorApproved!==true) throw new Error('ratio source has not been independently approved');
  if (typeof base.multiplier!=='bigint'||base.multiplier<=0n||!Number.isInteger(base.decimals)||base.decimals<0||base.decimals>36) throw new Error('invalid underlying price');
  // Preserve full precision using fractional ratio in the denominator, rather
  // than rounding a floating-point price or rounding a ratio upward.
  const n=BigInt(input.numerator),d=BigInt(input.denominator);
  const multiplier=base.multiplier*n;
  const denominator=d*10n**BigInt(base.decimals);
  // A 12-decimal diagnostic scaling: floor to avoid optimistic overvaluation.
  const scale=10n**12n;
  const adjusted=multiplier*scale/denominator;
  if(adjusted===0n) throw new Error('derived price rounded to zero');
  return {mode:'DERIVED_PRICE_DIAGNOSTIC',comparable:true,approvedForExecution:false,
    sourceKind:input.kind,derivativeAssetId:input.derivativeAssetId,blockHeight:input.ratioReadBlock,
    conservativeMultiplier:adjusted.toString(),decimals:12,
    reason:'OFFCHAIN_DIAGNOSTIC_ONLY; requires deployed-contract ratio and rounding parity'};
}
