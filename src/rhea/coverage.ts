import type { NearReadOnlyRpc } from './rpc.ts';
import {
  inspectRheaMarketMetadata,
  type MarketMetadataConfig,
  type RheaAssetPriceMetadata,
  type RheaMetadataSnapshot,
} from './market-metadata.ts';

/** Public-data diagnostic only. Pool balances DO NOT establish individual borrower exposure.
 * Unpriced, missing or disputed assets must NEVER be silently treated as delisted.
 */
export interface LendingPoolExposure {
  assetId: string;
  canBorrow: boolean | null;
  canUseAsCollateral: boolean | null;
  suppliedBalanceAtomic: string | null;
  suppliedShares: string | null;
  borrowedBalanceAtomic: string | null;
  borrowedShares: string | null;
  poolHasSuppliedBalance: boolean | null;
  poolHasOutstandingDebt: boolean | null;
  metadataSource: RheaAssetPriceMetadata['source'];
  assessment: 'PRICE_SOURCE_DECLARED' | 'MISSING_METADATA_WITH_EXPOSURE' | 'MISSING_METADATA_NO_OBSERVED_EXPOSURE' | 'MISSING_METADATA_EXPOSURE_UNKNOWN' | 'UNRESOLVED_METADATA';
}
export interface RheaCoverageReport {
  mode: 'COVERAGE_DIAGNOSTIC_ONLY';
  executionEnabled: false;
  contractParityVerified: false;
  priceParityVerified: false;
  blockHeight: string;
  lendingCodeHash: string;
  oracleCodeHash: string;
  listedAssetsCount: number;
  missingMetadata: string[];
  orphanMetadata: string[];
  examined: LendingPoolExposure[];
  borrowerPositionsExamined: 0;
  warnings: string[];
  status: 'UNVERIFIED_MISSING_METADATA' | 'DECLARED_METADATA_ONLY';
}
const ACCOUNT = /^[a-z0-9._-]{2,64}$/;
function record(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`invalid ${what}`);
  return v as Record<string, unknown>;
}
function uintText(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(v)) throw new Error(`${what} must be unsigned integer string`);
  return v;
}
function nullablePool(v: unknown, what: string): {balance:string;shares:string}|null {
  if (v === undefined || v === null) return null;
  const p=record(v,what);
  const balance=uintText(p.balance,`${what}.balance`);
  const shares=uintText(p.shares,`${what}.shares`);
  if (shares === '0' && balance !== '0') throw new Error(`${what}: balance without shares`);
  return {balance,shares};
}
function boolOrNull(value:unknown, label:string): boolean|null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}
export function examineRheaMarketExposure(rawAssets: unknown, metadata: RheaMetadataSnapshot): LendingPoolExposure[] {
  if (!Array.isArray(rawAssets) || rawAssets.length < 1 || rawAssets.length > 256) throw new Error('invalid lending asset pagination');
  const declared = new Map(metadata.assets.map(a=>[a.assetId,a]));
  if (declared.size !== metadata.assets.length || declared.size !== rawAssets.length) throw new Error('metadata/asset count mismatch');
  const seen=new Set<string>();
  const rows: LendingPoolExposure[]=[];
  for (const raw of rawAssets) {
    if (!Array.isArray(raw) || raw.length !== 2 || typeof raw[0] !== 'string' || !ACCOUNT.test(raw[0])) throw new Error('invalid lending asset tuple');
    const id=raw[0];
    if (seen.has(id)) throw new Error(`duplicate lending asset ${id}`);
    seen.add(id);
    const m=declared.get(id);
    if (!m) throw new Error(`metadata snapshot missing listed asset ${id}`);
    const a=record(raw[1],`asset ${id}`);
    const config=record(a.config,`asset ${id} config`);
    const supplied=nullablePool(a.supplied,`supplied ${id}`);
    const borrowed=nullablePool(a.borrowed,`borrowed ${id}`);
    const borrow=boolOrNull(config.can_borrow ?? config.canBorrow,`${id} can_borrow`);
    // Some lending versions do not expose a direct collateral enable flag.
    const collateral=boolOrNull(config.can_use_as_collateral ?? config.canUseAsCollateral,`${id} can_use_as_collateral`);
    const exposed=borrowed === null || supplied === null ? null : BigInt(borrowed.balance)>0n || BigInt(supplied.balance)>0n;
    const missing=m.source==='UNRESOLVED';
    rows.push({assetId:id,canBorrow:borrow,canUseAsCollateral:collateral,
      suppliedBalanceAtomic:supplied?.balance??null,suppliedShares:supplied?.shares??null,
      borrowedBalanceAtomic:borrowed?.balance??null,borrowedShares:borrowed?.shares??null,
      poolHasSuppliedBalance:supplied ? BigInt(supplied.balance)>0n : null,
      poolHasOutstandingDebt:borrowed ? BigInt(borrowed.balance)>0n : null,
      metadataSource:m.source,
      assessment: missing
        ? exposed === null ? 'MISSING_METADATA_EXPOSURE_UNKNOWN'
          : exposed ? 'MISSING_METADATA_WITH_EXPOSURE' : 'MISSING_METADATA_NO_OBSERVED_EXPOSURE'
        : m.source==='DIRECT_PYTH' || m.source==='CONTRACT_DEFAULT' ? 'PRICE_SOURCE_DECLARED' : 'UNRESOLVED_METADATA'});
  }
  if (seen.size!==declared.size) throw new Error('metadata and pool asset membership diverged');
  return rows.sort((x,y)=>x.assetId.localeCompare(y.assetId));
}
export async function inspectRheaCoverage(rpc: NearReadOnlyRpc, cfg: MarketMetadataConfig): Promise<RheaCoverageReport> {
  const metadata=await inspectRheaMarketMetadata(rpc,cfg);
  const blockId=Number(metadata.blockHeight);
  if (!Number.isSafeInteger(blockId)||blockId<1) throw new Error('bad metadata block height');
  // Re-read at the SAME final block. Never mix metadata and market exposures at different heights.
  const response=await rpc.view<unknown>(cfg.lendingContract,'get_assets_paged',{},blockId);
  if (response.blockHeight!==metadata.blockHeight) throw new Error('market exposure block mismatch');
  const examined=examineRheaMarketExposure(response.value,metadata);
  const warnings=['READ_ONLY_NO_TRADE_AUTHORIZATION','POOL_TOTALS_DO_NOT_ESTABLISH_BORROWER_ELIGIBILITY','DERIVATIVE_RATIOS_NOT_VERIFIED','DEPLOYED_CONTRACT_PARITY_NOT_PROVEN'];
  if (metadata.missingMetadata.length) warnings.push('MISSING_ORACLE_METADATA_CANNOT_BE_AUTO_CLASSIFIED_AS_DELISTED');
  if (examined.some(x=>x.assessment==='MISSING_METADATA_WITH_EXPOSURE')) warnings.push('UNPRICED_POOL_WITH_FUNDS_OR_OUTSTANDING_DEBT');
  if (examined.some(x=>x.assessment==='MISSING_METADATA_EXPOSURE_UNKNOWN')) warnings.push('MISSING_ASSET_EXPOSURE_UNKNOWN');
  if (metadata.extraMetadata.length) warnings.push('ORPHAN_PRICE_METADATA_PRESENT');
  return {mode:'COVERAGE_DIAGNOSTIC_ONLY',executionEnabled:false,contractParityVerified:false,priceParityVerified:false,
    blockHeight:metadata.blockHeight,lendingCodeHash:metadata.lendingCodeHash,oracleCodeHash:metadata.oracleCodeHash,
    listedAssetsCount:examined.length,missingMetadata:[...metadata.missingMetadata],orphanMetadata:[...metadata.extraMetadata],examined,
    borrowerPositionsExamined:0,warnings,status:metadata.missingMetadata.length || metadata.unresolvedAssets.length ? 'UNVERIFIED_MISSING_METADATA':'DECLARED_METADATA_ONLY'};
}
