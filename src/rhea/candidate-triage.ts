import type { NearReadOnlyRpc } from './rpc.ts';
import { scanRheaDebtWindow, type DebtAccountFinding, type DebtPositionFinding } from './debt-discovery.ts';
import { parseRheaPythMetadata, parseLendingPriceConfig, type RheaAssetPriceMetadata } from './market-metadata.ts';

/** Stage 12: borrower POSITION evidence only. No health, profit, signer or tx output.
 * This deliberately cannot produce an execution-eligible classification.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const POS=/^[A-Za-z0-9._:-]{1,100}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const MAX_U128=(1n<<128n)-1n;
function obj(x:unknown, label:string):Record<string,unknown>{
  if(!x||typeof x!=='object'||Array.isArray(x))throw Error(`invalid ${label}`);
  return x as Record<string,unknown>;
}
function exactShares(x:unknown):bigint{
  if(typeof x!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(x))throw Error('invalid exact share string');
  const n=BigInt(x);if(n>MAX_U128)throw Error('share u128 overflow');return n;
}
export type TriageReason='DETAIL_VIEW_UNAVAILABLE'|'DETAIL_SCHEMA_INVALID'|'DEBT_SCOPE_MISMATCH'|
  'MISSING_PRICE_METADATA'|'NON_DIRECT_ORACLE_SOURCE'|'NO_COLLATERAL_RECORDED'|
  'LEGACY_SCOPE_NOT_VERIFIED'|'DETAIL_BUDGET_EXHAUSTED'|'COLLATERAL_SCOPE_MISMATCH'|'PYTH_CONFIG_DISABLED_OR_UNKNOWN';
export interface CandidateEvidence {
  accountId:string;
  positionId:string|null;
  debtAssetIds:string[];
  collateralAssetIds:string[];
  status:'DEBT_SET_OBSERVED_UNPRICED'|'PRICE_METADATA_GAP'|'DETAIL_INCOMPATIBLE'|
    'DETAIL_UNAVAILABLE'|'DETAIL_BUDGET_EXHAUSTED'|'NO_COLLATERAL_RECORDED';
  reasons:TriageReason[];
  liquidationEligible:false;
  expectedProfitUsd:null;
}
export interface DebtTriageSettings {
  lendingContract:string;
  oracleContract:string;
  fromIndex:number;
  maxAccounts:number;
  pageSize:number;
  maxFindings:number;
  maxDetails:number;
  expectedLendingCodeHash?:string;
  expectedOracleCodeHash?:string;
}
export interface DebtTriageReport {
  mode:'READ_ONLY_POSITION_TRIAGE';
  status:'WINDOW_TRIAGED_UNAPPROVED'|'NO_DEBT_FOUND'|'INCOMPLETE_EVIDENCE';
  executionEnabled:false;
  liquidationParityVerified:false;
  priceParityVerified:false;
  financialEligibilityVerified:false;
  blockHeight:string;
  observedLendingCodeHash:string;
  observedOracleCodeHash:string;
  fromIndex:number;
  nextOffset:number;
  scannedAccounts:number;
  discoveredBorrowers:number;
  detailedBorrowers:number;
  rejectedBorrowers:number;
  records:CandidateEvidence[];
  warnings:string[];
}
export interface DetailedDebtPosition {positionId:string;debtAssetIds:string[];collateralAssetIds:string[]}
/** Detailed view is source data. A zero-share row cannot establish active debt. */
export function parseDetailedDebtScopes(raw:unknown,allowed:Set<string>):DetailedDebtPosition[] {
  const account=obj(raw,'account_all_positions');
  if(account.supplied!==undefined&&!Array.isArray(account.supplied))throw Error('invalid unisolated supply');
  const positions=obj(account.positions,'isolated positions');
  const entries=Object.entries(positions);
  if(entries.length>64)throw Error('too many isolated positions');
  const parse=(value:unknown,role:string):string[]=>{
    if(!Array.isArray(value)||value.length>256)throw Error(`invalid ${role} rows`);
    const seen=new Set<string>();
    for(const item of value){
      const row=obj(item,'position balance');const key=row.token_id;
      if(typeof key!=='string'||!ID.test(key)||!allowed.has(key)||seen.has(key))throw Error('invalid or duplicate detailed token');
      seen.add(key);
      if(exactShares(row.shares)===0n)throw Error('zero-share detailed position');
      // Validate numeric balances without implying a share-rounding parity check.
      if(typeof row.balance!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(row.balance)||BigInt(row.balance)>MAX_U128)throw Error('invalid detailed balance');
    }
    return [...seen].sort();
  };
  return entries.map(([positionId,value])=>{
    if(!POS.test(positionId))throw Error('invalid position ID');
    const position=obj(value,'isolated position');
    return {positionId,debtAssetIds:parse(position.borrowed??[],'borrowed'),collateralAssetIds:parse(position.collateral??[],'collateral')};
  }).filter(v=>v.debtAssetIds.length>0).sort((a,b)=>a.positionId.localeCompare(b.positionId));
}
function sameDebtScopes(found:DebtAccountFinding,detailed:DetailedDebtPosition[]):boolean {
  const expected=found.positions.filter(p=>p.positionId!==null).map(p=>`${p.positionId}|${[...p.debtAssetIds].sort().join(',')}`).sort();
  const actual=detailed.map(p=>`${p.positionId}|${p.debtAssetIds.join(',')}`).sort();
  return !found.positions.some(p=>p.positionId===null)&&expected.length===actual.length&&expected.every((v,i)=>v===actual[i]);
}
export function classifyDebtPosition(
  finding:DebtPositionFinding,
  collateralIds:string[],
  metadata:Map<string,RheaAssetPriceMetadata>,
  enabled:boolean|null,
):Pick<CandidateEvidence,'status'|'reasons'> {
  const reasons:TriageReason[]=[];
  if(enabled!==true)reasons.push('PYTH_CONFIG_DISABLED_OR_UNKNOWN');
  if(!collateralIds.length)reasons.push('NO_COLLATERAL_RECORDED');
  for(const token of new Set([...finding.debtAssetIds,...collateralIds])){
    const row=metadata.get(token);
    if(!row||row.source==='UNRESOLVED')reasons.push('MISSING_PRICE_METADATA');
    else if(row.source!=='DIRECT_PYTH')reasons.push('NON_DIRECT_ORACLE_SOURCE');
  }
  const unique=[...new Set(reasons)];
  const status:CandidateEvidence['status']=unique.includes('MISSING_PRICE_METADATA')||unique.includes('NON_DIRECT_ORACLE_SOURCE')||unique.includes('PYTH_CONFIG_DISABLED_OR_UNKNOWN')?'PRICE_METADATA_GAP':
    unique.includes('NO_COLLATERAL_RECORDED')?'NO_COLLATERAL_RECORDED':'DEBT_SET_OBSERVED_UNPRICED';
  return {status,reasons:unique};
}
function validate(cfg:DebtTriageSettings){
  if(!ID.test(cfg.lendingContract)||!ID.test(cfg.oracleContract)||cfg.lendingContract===cfg.oracleContract)throw Error('invalid contract configuration');
  if(!Number.isSafeInteger(cfg.maxDetails)||cfg.maxDetails<1||cfg.maxDetails>20)throw Error('maxDetails must be 1..20');
  for(const h of [cfg.expectedLendingCodeHash,cfg.expectedOracleCodeHash])if(h!==undefined&&!HASH.test(h))throw Error('invalid contract hash pin');
}
export async function triageRheaDebtWindow(rpc:NearReadOnlyRpc,cfg:DebtTriageSettings):Promise<DebtTriageReport>{
  validate(cfg);
  // The scanner locks its own entire run to a finalized block and validates the cursor.
  const discovery=await scanRheaDebtWindow(rpc,cfg);
  const height=Number(discovery.blockHeight);
  const [lending,oracle]=await Promise.all([
    rpc.viewAccount(cfg.lendingContract,height),rpc.viewAccount(cfg.oracleContract,height),
  ]);
  if(lending.blockHeight!==discovery.blockHeight||oracle.blockHeight!==discovery.blockHeight||lending.codeHash!==discovery.observedLendingCodeHash)throw Error('snapshot contract hash or block mismatch');
  if(cfg.expectedOracleCodeHash&&oracle.codeHash!==cfg.expectedOracleCodeHash)throw Error('PINNED_ORACLE_CODE_HASH_MISMATCH');
  const [assets,rawInfo,rawConfig]=await Promise.all([
    rpc.view<unknown>(cfg.lendingContract,'get_assets_paged',{},height),
    rpc.view<unknown>(cfg.lendingContract,'get_all_token_pyth_infos',{},height),
    rpc.view<unknown>(cfg.lendingContract,'get_config',{},height),
  ]);
  if([assets,rawInfo,rawConfig].some(x=>x.blockHeight!==discovery.blockHeight))throw Error('cross-block metadata read');
  if(!Array.isArray(assets.value)||assets.value.length<1||assets.value.length>256)throw Error('invalid assets for metadata');
  const ids=assets.value.map((x:unknown)=>{
    if(!Array.isArray(x)||x.length!==2||typeof x[0]!=='string'||!ID.test(x[0]))throw Error('invalid asset row');
    return x[0];
  });
  const metadata=parseRheaPythMetadata(rawInfo.value,ids);
  const map=new Map(metadata.assets.map(v=>[v.assetId,v]));
  const enabled=parseLendingPriceConfig(rawConfig.value);
  const allowed=new Set(ids);
  const records:CandidateEvidence[]=[];
  let details=0,rejected=discovery.invalidAccounts;
  const emit=(found:DebtAccountFinding,reason:TriageReason,status:CandidateEvidence['status'])=>{
    for(const p of found.positions)records.push({accountId:found.accountId,positionId:p.positionId,debtAssetIds:p.debtAssetIds,collateralAssetIds:[],status,reasons:[reason],liquidationEligible:false,expectedProfitUsd:null});
  };
  for(const found of discovery.findings){
    if(found.positions.some(p=>p.positionId===null)){
      rejected++;emit(found,'LEGACY_SCOPE_NOT_VERIFIED','DETAIL_INCOMPATIBLE');continue;
    }
    if(details>=cfg.maxDetails){emit(found,'DETAIL_BUDGET_EXHAUSTED','DETAIL_BUDGET_EXHAUSTED');continue;}
    details++;
    let response;
    try{response=await rpc.view<unknown>(cfg.lendingContract,'get_account_all_positions',{account_id:found.accountId},height);}
    catch{rejected++;emit(found,'DETAIL_VIEW_UNAVAILABLE','DETAIL_UNAVAILABLE');continue;}
    if(response.blockHeight!==discovery.blockHeight)throw Error('cross-block borrower detail');
    try{
      const parsed=parseDetailedDebtScopes(response.value,allowed);
      if(!sameDebtScopes(found,parsed)){
        rejected++;emit(found,'DEBT_SCOPE_MISMATCH','DETAIL_INCOMPATIBLE');continue;
      }
      const byId=new Map(parsed.map(p=>[p.positionId,p]));
      for(const finding of found.positions){
        const pos=byId.get(finding.positionId!);
        if(!pos)throw Error('position missing after scope comparison');
        if(finding.collateralRecorded !== (pos.collateralAssetIds.length>0))throw Error('collateral presence mismatch');
        const classification=classifyDebtPosition(finding,pos.collateralAssetIds,map,enabled);
        records.push({accountId:found.accountId,positionId:finding.positionId,debtAssetIds:finding.debtAssetIds,collateralAssetIds:pos.collateralAssetIds,
          ...classification,liquidationEligible:false,expectedProfitUsd:null});
      }
    }catch(err){rejected++;emit(found,err instanceof Error&&err.message==='collateral presence mismatch'?'COLLATERAL_SCOPE_MISMATCH':'DETAIL_SCHEMA_INVALID','DETAIL_INCOMPATIBLE');}
  }
  const incomplete=discovery.invalidAccounts>0||rejected>0||records.some(r=>r.status!=='DEBT_SET_OBSERVED_UNPRICED');
  return {mode:'READ_ONLY_POSITION_TRIAGE',status:incomplete?'INCOMPLETE_EVIDENCE':records.length?'WINDOW_TRIAGED_UNAPPROVED':'NO_DEBT_FOUND',
    executionEnabled:false,liquidationParityVerified:false,priceParityVerified:false,financialEligibilityVerified:false,
    blockHeight:discovery.blockHeight,observedLendingCodeHash:lending.codeHash,observedOracleCodeHash:oracle.codeHash,
    fromIndex:discovery.fromIndex,nextOffset:discovery.nextOffset,scannedAccounts:discovery.scannedAccounts,
    discoveredBorrowers:discovery.findingCount,detailedBorrowers:details,rejectedBorrowers:rejected,records,
    warnings:['NO_ORACLE_QUOTES_VALIDATED','DEBT_SET_ONLY_NOT_EXACT_SHARE_PARITY','NO_HEALTH_LIQUIDATION_OR_PROFIT_APPROVAL',
      'NO_EXECUTION_AUTHORIZATION','INDEX_CURSOR_ACROSS_BLOCKS_IS_NOT_A_STABLE_SNAPSHOT',
      ...(!cfg.expectedLendingCodeHash||!cfg.expectedOracleCodeHash?['CONTRACT_CODE_HASH_PINS_NOT_REVIEWED']:[])],
  };
}
