import type { NearReadOnlyRpc } from './rpc.ts';

/** Stage 5: read-only discovery of lending-owned Pyth metadata, NOT execution approval.
 * The deployed lending contract, not asset ticker guesses, is the authoritative source
 * for its declared asset->price feed metadata. Even declared feeds do not prove that
 * prices are safe, used for a specific operation, or convertible into liquidation P&L.
 */
export type RheaPriceSource = 'DIRECT_PYTH' | 'CONTRACT_DEFAULT' | 'UNRESOLVED';
export interface RheaAssetPriceMetadata {
  assetId: string;
  source: RheaPriceSource;
  priceIdentifier: string | null;
  defaultPrice: { multiplier: string; decimals: number } | null;
  decimals: number | null;
  fractionDigits: number | null;
}
export interface RheaMetadataSnapshot {
  mode: 'METADATA_READ_ONLY';
  executionEnabled: false;
  contractParityVerified: false;
  priceParityVerified: false;
  blockHeight: string;
  lendingContract: string;
  lendingCodeHash: string;
  oracleContract: string;
  oracleCodeHash: string;
  configEnablesPyth: boolean | null;
  assets: RheaAssetPriceMetadata[];
  missingMetadata: string[];
  extraMetadata: string[];
  unresolvedAssets: string[];
  uniqueDirectFeeds: string[];
  warnings: string[];
  status: 'METADATA_PRESENT_UNAPPROVED' | 'INCOMPLETE_METADATA';
}
const ID = /^[a-z0-9._-]{2,64}$/;
const FEED_ID = /^(?:[a-fA-F0-9]{64})$/;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
function record(v: unknown, label: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${label} must be object`);
  return v as Record<string, unknown>;
}
function boundedInt(v: unknown, label: string, max: number): number {
  if ((typeof v !== 'number' && typeof v !== 'string') || !/^(0|[1-9][0-9]*)$/.test(String(v))) throw new Error(`${label}: invalid integer`);
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n > max) throw new Error(`${label}: out of range`);
  return n;
}
function rawStringNumber(v: unknown, label: string): string {
  if (typeof v !== 'string' || !/^[1-9][0-9]{0,77}$/.test(v)) throw new Error(`${label}: positive integer string required`);
  return v;
}
function accountId(v: unknown, label: string): string {
  if (typeof v !== 'string' || !ID.test(v)) throw new Error(`invalid ${label}`);
  return v;
}
export function parseRheaPythMetadata(raw: unknown, listedAssetIds: string[]): Pick<RheaMetadataSnapshot,'assets'|'missingMetadata'|'extraMetadata'|'unresolvedAssets'|'uniqueDirectFeeds'> {
  if (!Array.isArray(listedAssetIds) || !listedAssetIds.length || listedAssetIds.length > 256) throw new Error('invalid listed asset set');
  const listed = new Set(listedAssetIds.map(id=>accountId(id,'asset ID')));
  if (listed.size !== listedAssetIds.length) throw new Error('duplicate listed asset');
  const rows = record(raw,'on-chain Pyth metadata');
  if (Object.keys(rows).length > 512) throw new Error('too many Pyth metadata rows');
  const extraMetadata = Object.keys(rows).filter(id=>!listed.has(id)).sort();
  const assets: RheaAssetPriceMetadata[] = [];
  const missingMetadata: string[] = [];
  const unresolvedAssets: string[] = [];
  const uniqueFeeds = new Set<string>();
  for (const assetId of [...listed].sort()) {
    const data = rows[assetId];
    if (data === undefined || data === null) {
      missingMetadata.push(assetId);
      assets.push({assetId,source:'UNRESOLVED',priceIdentifier:null,defaultPrice:null,decimals:null,fractionDigits:null});
      continue;
    }
    const info = record(data,`Pyth metadata for ${assetId}`);
    const identifier = info.price_identifier;
    // A feed ID can be shared by different assets; duplicate token IDs are invalid,
    // duplicate oracle price IDs are legitimate and de-duplicated for reads.
    let feed: string | null = null;
    if (identifier !== null && identifier !== undefined && identifier !== '') {
      if (typeof identifier !== 'string' || !FEED_ID.test(identifier)) throw new Error('invalid on-chain Pyth price_identifier');
      feed = identifier.toLowerCase();
    }
    const fractionDigits = info.fraction_digits === undefined || info.fraction_digits === null ? null : boundedInt(info.fraction_digits,'fraction_digits',36);
    const decimals = info.decimals === undefined || info.decimals === null ? null : boundedInt(info.decimals,'decimals',36);
    let defaultPrice: RheaAssetPriceMetadata['defaultPrice'] = null;
    if (info.default_price !== undefined && info.default_price !== null) {
      const p = record(info.default_price,'default_price');
      defaultPrice = {multiplier:rawStringNumber(p.multiplier,'default multiplier'),decimals:boundedInt(p.decimals,'default decimals',72)};
    }
    let source: RheaPriceSource = 'UNRESOLVED';
    // Upstream Rhea Go SDK gives default_price precedence even when a
    // price_identifier is also present. Do not reject that valid configuration.
    // This is metadata only; the active valuation branch still needs parity checks.
    if (defaultPrice) source = 'CONTRACT_DEFAULT';
    else if (feed) { source = 'DIRECT_PYTH'; uniqueFeeds.add(feed); }
    else unresolvedAssets.push(assetId);
    assets.push({assetId,source,priceIdentifier:feed,defaultPrice,decimals,fractionDigits});
  }
  return {assets,missingMetadata,extraMetadata,unresolvedAssets,uniqueDirectFeeds:[...uniqueFeeds].sort()};
}
export function parseLendingPriceConfig(raw: unknown): boolean | null {
  const cfg = record(raw,'lending config');
  if (cfg.enable_pyth_oracle === undefined || cfg.enable_pyth_oracle === null) return null;
  if (typeof cfg.enable_pyth_oracle !== 'boolean') throw new Error('invalid enable_pyth_oracle config');
  return cfg.enable_pyth_oracle;
}
export interface MarketMetadataConfig {
  lendingContract: string;
  oracleContract: string;
  expectedLendingCodeHash?: string;
  expectedOracleCodeHash?: string;
}
export async function inspectRheaMarketMetadata(rpc: NearReadOnlyRpc, cfg: MarketMetadataConfig): Promise<RheaMetadataSnapshot> {
  if (!ID.test(cfg.lendingContract) || !ID.test(cfg.oracleContract) || cfg.lendingContract === cfg.oracleContract) throw new Error('invalid lending/oracle contract');
  for (const h of [cfg.expectedLendingCodeHash,cfg.expectedOracleCodeHash]) if (h !== undefined && !HASH.test(h)) throw new Error('invalid code hash pin');
  const lending = await rpc.viewAccount(cfg.lendingContract);
  const height = Number(lending.blockHeight);
  if (!Number.isSafeInteger(height) || height < 1) throw new Error('invalid finalized block height');
  const oracle = await rpc.viewAccount(cfg.oracleContract,height);
  if (cfg.expectedLendingCodeHash && cfg.expectedLendingCodeHash !== lending.codeHash) throw new Error('PINNED_LENDING_CODE_HASH_MISMATCH');
  if (cfg.expectedOracleCodeHash && cfg.expectedOracleCodeHash !== oracle.codeHash) throw new Error('PINNED_ORACLE_CODE_HASH_MISMATCH');
  const [rawAssets,rawConfig,rawInfo] = await Promise.all([
    rpc.view<unknown>(cfg.lendingContract,'get_assets_paged',{},height),
    rpc.view<unknown>(cfg.lendingContract,'get_config',{},height),
    rpc.view<unknown>(cfg.lendingContract,'get_all_token_pyth_infos',{},height),
  ]);
  if (!Array.isArray(rawAssets.value) || rawAssets.value.length < 1 || rawAssets.value.length > 256) throw new Error('invalid lending assets response');
  const ids = rawAssets.value.map((v:unknown)=> {
    if (!Array.isArray(v) || v.length !== 2) throw new Error('invalid lending asset row');
    return accountId(v[0],'listed asset ID');
  });
  const info = parseRheaPythMetadata(rawInfo.value,ids);
  const enabled = parseLendingPriceConfig(rawConfig.value);
  const warnings = ['ONCHAIN_METADATA_IS_NOT_PRICE_OR_LIQUIDATION_PARITY', 'DERIVED_ASSET_RATIOS_NOT_VERIFIED','NO_TRANSACTION_AUTHORIZATION'];
  if (!cfg.expectedLendingCodeHash || !cfg.expectedOracleCodeHash) warnings.push('CODE_HASH_PINS_NOT_APPROVED');
  if (enabled !== true) warnings.push('PYTH_CONFIG_DISABLED_OR_UNKNOWN');
  if (info.extraMetadata.length) warnings.push('METADATA_CONTAINS_NONLISTED_ASSETS');
  if (info.missingMetadata.length || info.unresolvedAssets.length) warnings.push('ASSET_PRICE_CONFIGURATION_INCOMPLETE');
  // Even a 100% mapping does NOT imply an executable valuation: derivative
  // conversions, oracle aggregation rules, liquidation rounding remain unverified.
  return {mode:'METADATA_READ_ONLY',executionEnabled:false,contractParityVerified:false,priceParityVerified:false,
    blockHeight:String(height),lendingContract:cfg.lendingContract,lendingCodeHash:lending.codeHash,
    oracleContract:cfg.oracleContract,oracleCodeHash:oracle.codeHash,configEnablesPyth:enabled,
    ...info,warnings,status:info.missingMetadata.length || info.unresolvedAssets.length || enabled !== true ? 'INCOMPLETE_METADATA':'METADATA_PRESENT_UNAPPROVED'};
}
