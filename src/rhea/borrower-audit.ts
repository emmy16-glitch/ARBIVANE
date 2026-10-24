import type { NearReadOnlyRpc } from './rpc.ts';
import { inspectRheaCoverage } from './coverage.ts';
import type { MarketMetadataConfig } from './market-metadata.ts';

/** This diagnostic counts *shares* held by sampled borrowers, NOT asset balances or USD prices. */
export interface SampledAssetExposure {
  assetId: string;
  priceMetadataMissing: boolean;
  debtAccounts: number;
  collateralAccounts: number;
  suppliedAccounts: number;
  borrowedShares: string;
  collateralShares: string;
}
export interface BorrowerAuditReport {
  mode: 'READ_ONLY_BORROWER_SAMPLE';
  executionEnabled: false;
  liquidationParityVerified: false;
  status: 'UNAPPROVED_EXPOSURE_SAMPLE';
  blockHeight: string;
  lendingCodeHash: string;
  oracleCodeHash: string;
  totalAccounts: number;
  sampledAccounts: number;
  completeEnumeration: boolean;
  sampleMethod: 'FIRST_N_INDEX_ORDER';
  accountsWithDebt: number;
  accountsWithMissingPriceDebt: number;
  accountsWithMissingPriceCollateral: number;
  assets: SampledAssetExposure[];
  warnings: string[];
}
const ID=/^[a-z0-9._-]{2,64}$/;
const U=/^(0|[1-9][0-9]{0,77})$/;
function obj(x:unknown, name:string):Record<string,unknown>{
  if(x===null || typeof x!=='object' || Array.isArray(x)) throw Error(`invalid ${name}`);
  return x as Record<string,unknown>;
}
function parseUint(x:unknown,name:string,max:bigint):bigint {
  if ((typeof x !== 'string' && !(typeof x==='number' && Number.isSafeInteger(x))) || !U.test(String(x))) throw Error(`invalid ${name}`);
  const val=BigInt(String(x)); if(val>max)throw Error(`invalid ${name}`);return val;
}
function mapShares(raw:unknown, pool:Set<string>, name:string):Map<string,bigint>{
  const row=obj(raw,name);if(Object.keys(row).length>256)throw Error('position cap exceeded');
  const out=new Map<string,bigint>();
  for(const [assetId,shares] of Object.entries(row)){
    if(!ID.test(assetId)||!pool.has(assetId))throw Error(`unknown ${name} asset`);
    if(typeof shares!=='string')throw Error(`${name} shares must be string`);
    const v=parseUint(shares,`${name} shares`,10n**78n-1n);
    if(v>0n)out.set(assetId,v);
  }
  return out;
}
export function summarizeBorrowers(rows:unknown[], listedAssets:string[], missingMetadata:string[]){
  if(!Array.isArray(rows)||rows.length>200)throw Error('sample over limit');
  if(!Array.isArray(listedAssets)||listedAssets.length<1||listedAssets.length>256||listedAssets.some(x=>!ID.test(x))||new Set(listedAssets).size!==listedAssets.length)throw Error('invalid market assets');
  const pool=new Set(listedAssets), missing=new Set(missingMetadata);
  if(missing.size!==missingMetadata.length||[...missing].some(x=>!pool.has(x)))throw Error('missing metadata set inconsistent');
  const tally=new Map(listedAssets.map(id=>[id,{debt:0,collateral:0,supplied:0,borrowedShares:0n,collateralShares:0n}] as [string,{debt:number;collateral:number;supplied:number;borrowedShares:bigint;collateralShares:bigint}]));
  const seen=new Set<string>();let debtAccounts=0,unpricedDebt=0,unpricedCollateral=0;
  for(const raw of rows){
    const r=obj(raw,'borrower');
    if(r.account_id!==undefined&&r.accountId!==undefined)throw Error('ambiguous account id');
    const id=r.account_id??r.accountId;
    if(typeof id!=='string'||!ID.test(id)||seen.has(id))throw Error('invalid or duplicate borrower ID');
    seen.add(id);
    const debt=mapShares(r.borrowed,pool,'borrowed'), collateral=mapShares(r.collateral,pool,'collateral'), supplied=mapShares(r.supplied??{},pool,'supplied');
    if(debt.size)debtAccounts++;
    if([...debt.keys()].some(x=>missing.has(x)))unpricedDebt++;
    if([...collateral.keys()].some(x=>missing.has(x)))unpricedCollateral++;
    for(const [token,shares]of debt){const t=tally.get(token)!;t.debt++;t.borrowedShares+=shares;}
    for(const [token,shares]of collateral){const t=tally.get(token)!;t.collateral++;t.collateralShares+=shares;}
    for(const token of supplied.keys())tally.get(token)!.supplied++;
  }
  const assets:SampledAssetExposure[]=[...tally.entries()].map(([assetId,t])=>({assetId,priceMetadataMissing:missing.has(assetId),debtAccounts:t.debt,collateralAccounts:t.collateral,suppliedAccounts:t.supplied,borrowedShares:String(t.borrowedShares),collateralShares:String(t.collateralShares)})).sort((a,b)=>a.assetId.localeCompare(b.assetId));
  return {assets,debtAccounts,unpricedDebt,unpricedCollateral};
}
export interface BorrowerAuditConfig extends MarketMetadataConfig {maxAccounts:number;pageSize:number;}
export async function auditRheaBorrowers(rpc:NearReadOnlyRpc, config:BorrowerAuditConfig):Promise<BorrowerAuditReport>{
  if(!Number.isSafeInteger(config.maxAccounts)||config.maxAccounts<1||config.maxAccounts>200)throw Error('maxAccounts must be 1..200');
  if(!Number.isSafeInteger(config.pageSize)||config.pageSize<1||config.pageSize>50)throw Error('pageSize must be 1..50');
  const coverage=await inspectRheaCoverage(rpc,config);
  const height=Number(coverage.blockHeight);
  const n=await rpc.view<unknown>(config.lendingContract,'get_num_accounts',{},height);
  if(n.blockHeight!==coverage.blockHeight)throw Error('mismatched account count block');
  const total=Number(parseUint(n.value,'account count',20_000_000n));
  const limit=Math.min(total,config.maxAccounts);const accounts:unknown[]=[];
  for(let i=0;i<limit;i+=config.pageSize){
    const size=Math.min(config.pageSize,limit-i);
    const page=await rpc.view<unknown>(config.lendingContract,'get_accounts_paged',{from_index:i,limit:size},height);
    if(page.blockHeight!==coverage.blockHeight||!Array.isArray(page.value)||page.value.length!==size)throw Error('incomplete or unpinned borrower page');
    accounts.push(...page.value);
  }
  const sample=summarizeBorrowers(accounts,coverage.examined.map(x=>x.assetId),coverage.missingMetadata);
  const complete=total<=config.maxAccounts;
  const warnings=['NO_ONCHAIN_LIQUIDATION_PARITY','SHARES_NOT_ASSET_OR_USD_BALANCES','NO_EXECUTION_AUTHORIZATION'];
  if(!complete)warnings.push('FIRST_N_IS_NOT_A_REPRESENTATIVE_MARKET_SAMPLE');
  if(coverage.missingMetadata.length)warnings.push('MISSING_METADATA_ASSETS_NOT_VALUED');
  if(sample.unpricedDebt||sample.unpricedCollateral)warnings.push('UNPRICED_ASSETS_IN_SAMPLED_BORROWER_POSITIONS');
  if(!config.expectedLendingCodeHash||!config.expectedOracleCodeHash)warnings.push('UNAPPROVED_CODE_HASHES');
  return {mode:'READ_ONLY_BORROWER_SAMPLE',executionEnabled:false,liquidationParityVerified:false,status:'UNAPPROVED_EXPOSURE_SAMPLE',
    blockHeight:coverage.blockHeight,lendingCodeHash:coverage.lendingCodeHash,oracleCodeHash:coverage.oracleCodeHash,
    totalAccounts:total,sampledAccounts:accounts.length,completeEnumeration:complete,sampleMethod:'FIRST_N_INDEX_ORDER',
    accountsWithDebt:sample.debtAccounts,accountsWithMissingPriceDebt:sample.unpricedDebt,
    accountsWithMissingPriceCollateral:sample.unpricedCollateral,assets:sample.assets,warnings};
}
