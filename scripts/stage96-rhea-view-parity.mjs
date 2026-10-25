/** Stage96 — fail-closed, stage-specific Rhea post-clone view parity witness.
 * Hash-only observations prevent borrower/contract data or RPC secrets from
 * being exposed in public Actions artifacts. Cloning does not prove liquidation.
 */
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {stage104AttestTemporalAccrual} from './stage104-temporal-accrual-parity.mjs';
const VIEWS=Object.freeze([
 {id:'CONFIG',method:'get_config',args:()=>({})},
 {id:'BORROWER',method:'get_account_all_positions',
  args:id=>({account_id:id})},
 {id:'ASSETS',method:'get_assets_paged',args:()=>({})},
]);
const ERR=/^(?:STAGE[0-9]{1,3}|SANDBOX|NEAR_WORKSPACES|ACTIVE_PYTH)_[A-Z0-9_]{1,115}$/;
const ID=/^[a-z0-9._-]{2,64}$/;
const stable=(v)=>{
 const s=JSON.stringify(v);
 if(typeof s!=='string'||s.length>5_000_000)
  throw Error('STAGE96_INVALID_OR_UNBOUNDED_SOURCE_VIEW');
 return s;
};
const sha=s=>createHash('sha256').update(s).digest('hex');
// Rust HashMap/HashSet iteration is not a deterministic JSON ordering contract.
// Only the borrower view's documented unordered collections are treated as
// multisets. Every element and every scalar must still match source exactly.
const STAGE101_UNORDERED_BORROWER_ARRAYS=new Set([
 'supplied','collateral','borrowed','farms','rewards'
]);
function stage101CanonicalBorrower(value,field=''){
 if(Array.isArray(value)){
  const entries=value.map(x=>stage101CanonicalBorrower(x,''));
  if(STAGE101_UNORDERED_BORROWER_ARRAYS.has(field))
   entries.sort((a,b)=>{
    const left=JSON.stringify(a),right=JSON.stringify(b);
    return left<right?-1:left>right?1:0;
   });
  return entries;
 }
 if(value!==null&&typeof value==='object'){
  return Object.fromEntries(Object.keys(value).sort().map(key=>[
   key,stage101CanonicalBorrower(value[key],key)
  ]));
 }
 return value;
}
// Stage102: identify which *type* of derived asset field disagrees.
// Do not persist token IDs, amounts, APR values, RPC errors, or source data.
export function stage102BorrowerAssetDifferenceClasses(source,sandbox){
 const issues=new Set(),MAX_POSITIONS=64,MAX_ASSETS=128;
 function compareAssets(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||
    a.length>MAX_ASSETS||b.length>MAX_ASSETS){
   issues.add('ASSET_COLLECTION_SHAPE_OR_BUDGET');return;
  }
  const sorted=x=>[...x].sort((u,v)=>{
   const left=typeof u?.token_id==='string'?u.token_id:'';
   const right=typeof v?.token_id==='string'?v.token_id:'';
   return left<right?-1:left>right?1:0;
  });
  const left=sorted(a),right=sorted(b);
  if(left.length!==right.length||
   left.some((v,i)=>v?.token_id!==right[i]?.token_id)){
   issues.add('ASSET_MEMBERSHIP_DIFFERENT');return;
  }
  for(let i=0;i<left.length;i++){
   const x=left[i],y=right[i];
   if(x?.shares!==y?.shares)issues.add('ASSET_SHARES_DIFFERENT');
   if(x?.balance!==y?.balance)issues.add('ASSET_BALANCE_DIFFERENT');
   if(JSON.stringify(stage101CanonicalBorrower(x?.apr))!==
      JSON.stringify(stage101CanonicalBorrower(y?.apr)))
    issues.add('ASSET_APR_DIFFERENT');
   if(!stage101SameBorrowerView(
    Object.fromEntries(Object.entries(x??{}).filter(([k])=>!
     ['shares','balance','apr'].includes(k))),
    Object.fromEntries(Object.entries(y??{}).filter(([k])=>!
     ['shares','balance','apr'].includes(k)))))
    issues.add('ASSET_OTHER_FIELDS_DIFFERENT');
  }
 }
 compareAssets(source?.supplied,sandbox?.supplied);
 const lp=source?.positions,rp=sandbox?.positions;
 if(!lp||!rp||typeof lp!=='object'||typeof rp!=='object'||
  Array.isArray(lp)||Array.isArray(rp)){
  issues.add('POSITION_COLLECTION_SHAPE');return [...issues].sort();
 }
 const keys=Object.keys(lp),other=Object.keys(rp);
 if(keys.length>MAX_POSITIONS||other.length>MAX_POSITIONS){
  issues.add('POSITION_COLLECTION_BUDGET');return [...issues].sort();
 }
 if(keys.length!==other.length||keys.some(k=>!Object.hasOwn(rp,k))){
  issues.add('POSITION_MEMBERSHIP_DIFFERENT');return [...issues].sort();
 }
 for(const key of keys){
  compareAssets(lp[key]?.collateral,rp[key]?.collateral);
  compareAssets(lp[key]?.borrowed,rp[key]?.borrowed);
 }
 if(issues.size===0&&!stage101SameBorrowerView(source,sandbox))
  issues.add('NON_ASSET_BORROWER_FIELDS_DIFFERENT');
 return [...issues].sort();
}

export function stage101SameBorrowerView(source,sandbox){
 return stable(stage101CanonicalBorrower(source))===
  stable(stage101CanonicalBorrower(sandbox));
}
function stage101BorrowerDifferenceSections(source,sandbox){
 const keys=['account_id','supplied','positions','farms',
  'has_non_farmed_assets','booster_staking','booster_stakings','is_locked'];
 return keys.filter(key=>JSON.stringify(stage101CanonicalBorrower(source?.[key]))!==
  JSON.stringify(stage101CanonicalBorrower(sandbox?.[key])))
  .map(key=>key.toUpperCase());
}

// Stage103: compare source-pinned and local market assets after BOTH views.
// Timestamp-driven interest may change balances without changing pool shares.
// This is diagnostic only: no clock drift permits skipping strict view parity.
export function stage103MarketAssetDifferenceClasses(source,sandbox){
 const issues=new Set(),LIMIT=512;
 if(!Array.isArray(source)||!Array.isArray(sandbox)||
  source.length>LIMIT||sandbox.length>LIMIT){
  return ['MARKET_COLLECTION_SHAPE_OR_BUDGET'];
 }
 const market=new Map();
 for(const [side,items] of [['source',source],['sandbox',sandbox]]){
  const byId=new Map();
  for(const item of items){
   if(!Array.isArray(item)||item.length!==2||
    typeof item[0]!=='string'||!ID.test(item[0])||
    !item[1]||typeof item[1]!=='object'||Array.isArray(item[1])||
    byId.has(item[0]))
    return ['MARKET_COLLECTION_SHAPE_OR_BUDGET'];
   byId.set(item[0],item[1]);
  }
  market.set(side,byId);
 }
 const left=market.get('source'),right=market.get('sandbox');
 if(left.size!==right.size||[...left.keys()].some(id=>!right.has(id)))
  return ['MARKET_ASSET_MEMBERSHIP_DIFFERENT'];
 for(const [tokenId,a] of left){
  const b=right.get(tokenId);
  if(a?.last_update_timestamp!==b?.last_update_timestamp)
   issues.add('MARKET_ACCRUAL_TIMESTAMP_DIFFERENT');
  for(const pool of ['supplied','borrowed']){
   if(a?.[pool]?.shares!==b?.[pool]?.shares)
    issues.add('MARKET_POOL_SHARES_DIFFERENT');
   if(a?.[pool]?.balance!==b?.[pool]?.balance)
    issues.add('MARKET_POOL_BALANCES_DIFFERENT');
  }
  if(a?.reserved!==b?.reserved)issues.add('MARKET_RESERVED_DIFFERENT');
  if(stable(stage101CanonicalBorrower(a?.config))!==
   stable(stage101CanonicalBorrower(b?.config)))
   issues.add('MARKET_CONFIG_DIFFERENT');
  const remainder=v=>{
   const out={...v};
   for(const key of ['supplied','borrowed','reserved','last_update_timestamp','config'])
    delete out[key];
   return out;
  };
  if(stable(stage101CanonicalBorrower(remainder(a)))!==
   stable(stage101CanonicalBorrower(remainder(b))))
   issues.add('MARKET_OTHER_FIELDS_DIFFERENT');
 }
 return [...issues].sort();
}

// Stage98: expose only a bounded, non-sensitive failure category. Never persist
// an SDK error message, panic text, RPC URL, account data or stack trace.
export function stage98ClassifyViewFailure(error){
 const name=typeof error?.name==='string'?error.name:'';
 const message=typeof error?.message==='string'?error.message.slice(0,4096):'';
 const combined=name+' '+message;
 if(/access.key|private.key|authorization|bearer|secret|token/i.test(combined))
  return 'REDACTED_RUNTIME_FAILURE';
 if(/deserialize|borsh|invalid.enum|unknown.variant|invalid.variant/i.test(combined))
  return 'STATE_DESERIALIZATION_FAILURE';
 if(/index.out.of.bounds|index.*bounds/i.test(combined))
  return 'COLLECTION_INDEX_FAILURE';
 if(/key.not.found|missing.key|not.found.in.storage/i.test(combined))
  return 'STORAGE_LOOKUP_FAILURE';
 if(/gas.exceeded|out.of.gas/i.test(combined))
  return 'VIEW_GAS_EXHAUSTED';
 if(/timed?.out|network|connection|socket|503|429/i.test(combined))
  return 'VIEW_TRANSPORT_FAILURE';
 if(/wasm|unreachable|trap|panic/i.test(combined))
  return 'WASM_EXECUTION_FAILURE';
 return 'UNCLASSIFIED_LOCAL_VIEW_FAILURE';
}

export async function attestStage96PinnedRheaViews({
 lending,borrowerAccountId,config,borrower,assets,allowSandboxTemporalAccrual=false,
 persist=async witness=>writeFile('stage96-rhea-view-parity.json',
  JSON.stringify(witness,null,2)+'\n',{mode:0o600}),
}){
 if(!lending||typeof lending.view!=='function'||!ID.test(lending.accountId)||
  !ID.test(borrowerAccountId)||typeof persist!=='function')
  throw Error('STAGE96_INVALID_SANDBOX_VIEW_PROBE');
 const expected=[config,borrower,assets];
 const witness={
  mode:'STAGE96_PINNED_RHEA_POST_CLONE_VIEW_PARITY',
  chain:'NEAR_SANDBOX',status:'IN_PROGRESS',
  lendingContractId:lending.accountId,
  checks:[],failedView:null,failureCode:null,
  stage104TemporalAccrual:null,temporalAccrualVerified:false,
  allSourceViewsVerified:false,partialStateImport:true,
  liquidationAttempted:false,actualRheaSettlementVerified:false,
  realMainnetExecuted:false,positiveNetProfitVerified:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
 };
 const store=async()=>{
  try{await persist(structuredClone(witness));}
  catch{throw Error('STAGE96_PARITY_EVIDENCE_PERSISTENCE_FAILED');}
 };
 await store();
 let firstMismatch=null,localBorrower=null,localAssets=null;
 for(let i=0;i<VIEWS.length;i++){
  const {id,method,args}=VIEWS[i];
  let target;
  try{target=stable(expected[i]);}
  catch{
   witness.failedView=id;witness.failureCode='STAGE96_INVALID_PINNED_'+id+'_VIEW';
   witness.checks.push({view:id,status:'BLOCKED_UNTRUSTED_SOURCE'});
   witness.status='BLOCKED_PINNED_SOURCE_VIEW';await store();
   throw Error(witness.failureCode);
  }
  let observed;
  try{observed=await lending.view(method,args(borrowerAccountId));}
  catch(error){
   witness.failedView=id;witness.failureCode='STAGE96_'+id+'_VIEW_CALL_FAILED';
   witness.checks.push({view:id,status:'SANDBOX_VIEW_FAILED',
    stage98FailureClass:stage98ClassifyViewFailure(error),
    expectedSha256:sha(target)});
   witness.status='BLOCKED_SANDBOX_VIEW_EXCEPTION';await store();
   throw Error(witness.failureCode);
  }
  let actual;
  try{actual=stable(observed);}
  catch{
   witness.failedView=id;witness.failureCode='STAGE96_'+id+'_VIEW_INVALID_RESULT';
   witness.checks.push({view:id,status:'SANDBOX_VIEW_INVALID',expectedSha256:sha(target)});
   witness.status='BLOCKED_SANDBOX_VIEW_INVALID';await store();
   throw Error(witness.failureCode);
  }
  if(id==='BORROWER')localBorrower=observed;
  if(id==='ASSETS')localAssets=observed;
  const match=id==='BORROWER'?
   stage101SameBorrowerView(expected[i],observed):target===actual;
  const check={view:id,
   status:match?'SOURCE_SANDBOX_MATCH':'SOURCE_SANDBOX_MISMATCH',
   expectedSha256:sha(id==='BORROWER'?
    stable(stage101CanonicalBorrower(expected[i])):target),
   actualSha256:sha(id==='BORROWER'?
    stable(stage101CanonicalBorrower(observed)):actual)};
  if(id==='BORROWER'&&!match)
   check.stage101DifferentSections=stage101BorrowerDifferenceSections(expected[i],observed);
  if(id==='BORROWER'&&!match)
   check.stage102AssetDifferenceClasses=stage102BorrowerAssetDifferenceClasses(expected[i],observed);
  if(id==='ASSETS'&&!match)
   check.stage103MarketDifferenceClasses=stage103MarketAssetDifferenceClasses(expected[i],observed);
  witness.checks.push(check);
  if(!match){
   const code='STAGE96_'+id+'_VIEW_MISMATCH';
   firstMismatch??={id,code};
   witness.failedView=firstMismatch.id;
   witness.failureCode=firstMismatch.code;
   witness.status='BLOCKED_PINNED_PARITY_MISMATCH';await store();
   // Stage103: if borrower differs, collect ONE additional read-only market
   // view before blocking. Config failure remains an immediate hard stop.
   if(id!=='BORROWER'&&
      !(allowSandboxTemporalAccrual===true&&id==='ASSETS'&&
        firstMismatch.id==='BORROWER'))
    throw Error(firstMismatch.code);
   continue;
  }
  await store();
 }
 if(firstMismatch&&allowSandboxTemporalAccrual===true&&
    firstMismatch.id==='BORROWER'&&
    witness.checks[0]?.status==='SOURCE_SANDBOX_MATCH'&&
    witness.checks[2]?.view==='ASSETS'){
  const proof=stage104AttestTemporalAccrual({
   sourceBorrower:borrower,sandboxBorrower:localBorrower,
   sourceAssets:assets,sandboxAssets:localAssets,
  });
  witness.stage104TemporalAccrual=proof;
  if(proof.verified===true){
   witness.status='BOUNDED_SOURCE_STORAGE_AND_TEMPORAL_ACCRUAL_NOT_EXACT_PARITY';
   witness.temporalAccrualVerified=true;
   witness.failedView=null;witness.failureCode=null;
   await store();return witness;
  }
  await store();
 }
 if(firstMismatch){
  witness.failedView=firstMismatch.id;witness.failureCode=firstMismatch.code;
  witness.status='BLOCKED_PINNED_PARITY_MISMATCH';await store();
  throw Error(firstMismatch.code);
 }
 witness.status='ALL_REQUIRED_PINNED_VIEWS_MATCH_NOT_LIQUIDATION';
 witness.allSourceViewsVerified=true;
 await store();
 return witness;
}
export function stage96SafeError(error){
 const code=error instanceof Error?error.message:'';
 return ERR.test(code)?code:'STAGE96_UNCLASSIFIED_LOCAL_VIEW_ERROR';
}
