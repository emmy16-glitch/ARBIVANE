/** Stage96 — fail-closed, stage-specific Rhea post-clone view parity witness.
 * Hash-only observations prevent borrower/contract data or RPC secrets from
 * being exposed in public Actions artifacts. Cloning does not prove liquidation.
 */
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
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
export async function attestStage96PinnedRheaViews({
 lending,borrowerAccountId,config,borrower,assets,
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
  catch{
   witness.failedView=id;witness.failureCode='STAGE96_'+id+'_VIEW_CALL_FAILED';
   witness.checks.push({view:id,status:'SANDBOX_VIEW_FAILED',expectedSha256:sha(target)});
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
  const match=target===actual;
  witness.checks.push({view:id,
   status:match?'SOURCE_SANDBOX_MATCH':'SOURCE_SANDBOX_MISMATCH',
   expectedSha256:sha(target),actualSha256:sha(actual)});
  if(!match){
   witness.failedView=id;witness.failureCode='STAGE96_'+id+'_VIEW_MISMATCH';
   witness.status='BLOCKED_PINNED_PARITY_MISMATCH';await store();
   throw Error(witness.failureCode);
  }
  await store();
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
