import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 STAGE141_WATCHLIST,stage141Survey,stage141QualifyEntry
} from '../scripts/stage141-near-lender-qualification.mjs';
import {stage140EncodeBase58} from '../scripts/stage140-native-flash-provider-discovery.mjs';

function wasm(exported){
 const name=Buffer.from(exported,'utf8');
 return Buffer.from([
 0,97,115,109,1,0,0,0,
 1,4,1,0x60,0,0,
 3,2,1,0,
 7,4+name.length,1,name.length,...name,0,0,
 10,4,1,2,0,11]);
}
function scenario({nativeFlash=false,badHash=false,tokenMetadataInvalid=false,
 drift=false,tokenBalance='10000000000000000000000'}={}){
 const binaries=Object.fromEntries(STAGE141_WATCHLIST.map(x=>[
  x.id,wasm(x.id==='dclv2.ref-labs.near'&&nativeFlash?'flash_loan':'execute')
 ]));
 const hashed=Object.fromEntries(Object.entries(binaries).map(([id,b])=>[
  id,stage140EncodeBase58(createHash('sha256').update(b).digest())
 ]));
 const visited=[];
 const fetcher=async(_url,request)=>{
  assert.equal(request.method,'POST');
  assert.ok(!request.body.includes('broadcast_tx'));
  const j=JSON.parse(request.body),p=j.params;
  assert.equal(j.method,'query');
  assert.ok(['view_account','view_code','call_function'].includes(p.request_type));
  visited.push({type:p.request_type,accountId:p.account_id,
   method:p.method_name,blockId:p.block_id});
  let r;
  if(p.request_type==='view_account'){
   r={block_height:5678,code_hash:badHash&&p.account_id==='intents.near'?
    '11111111111111111111111111111111':hashed[p.account_id]};
  }else if(p.request_type==='view_code'){
   r={block_height:drift&&p.account_id==='intents.near'?5677:5678,
    hash:hashed[p.account_id],code_base64:binaries[p.account_id].toString('base64')};
  }else{
   let value;
   if(p.method_name==='ft_metadata'){
    assert.equal(p.account_id,'linear-protocol.near');
    value=tokenMetadataInvalid?{spec:'bad',name:'x',symbol:'x',decimals:24}:
     {spec:'ft-1.0.0',name:'LiNEAR',symbol:'LiNEAR',decimals:24};
   }else if(p.method_name==='ft_balance_of'){
    assert.equal(p.account_id,'linear-protocol.near');
    const args=JSON.parse(Buffer.from(p.args_base64,'base64').toString());
    assert.equal(args.account_id,'dclv2.ref-labs.near');
    value=tokenBalance;
   }else throw Error('unexpected method');
   r={block_height:5678,result:[...Buffer.from(JSON.stringify(value))]};
  }
  return {ok:true,headers:{get:()=>null},json:async()=>({jsonrpc:'2.0',id:j.id,result:r})};
 };
 return {fetcher,visited};
}
test('Stage141 scans SIX source-listed accounts, all read-only and no forged loan provider',async()=>{
 const f=scenario();
 const r=await stage141Survey({fetcher:f.fetcher,now:()=>123});
 assert.equal(r.mode,'STAGE141_EXTENDED_NEAR_LENDER_QUALIFICATION');
 assert.equal(r.candidates.length,6);
 assert.equal(r.providerCountExamined,6);
 assert.equal(r.loanTokenMetadataVerified,true);
 assert.equal(r.loanTokenMetadata.symbol,'LiNEAR');
 assert.equal(r.fundingStatus,'NO_VERIFIED_UNCOLLATERALIZED_NATIVE_LINEAR_LOAN_SOURCE');
 assert.deepEqual(r.qualifyingUncollateralizedProviders,[]);
 assert.equal(r.actualFundsBorrowed,false);
 assert.equal(r.maySignMainnet,false);
 assert.equal(r.mayBroadcastMainnet,false);
 assert.ok(r.candidates.every(x=>x.deployedWasmHashVerified&&
  x.status==='NO_RECOGNIZED_FLASH_LOAN_EXPORT'&&
  x.loanExecutionAllowed===false));
 assert.equal(f.visited.filter(x=>x.type==='view_account').length,6);
 assert.equal(f.visited.filter(x=>x.type==='view_code').length,6);
 assert.equal(f.visited.filter(x=>x.type==='call_function').length,1);
 assert.equal(f.visited.at(-1).blockId,5678);
});
test('Stage141 sees a REAL named WASM export but will never equate held LiNEAR to borrowable funds',async()=>{
 const f=scenario({nativeFlash:true});
 const r=await stage141Survey({fetcher:f.fetcher});
 const candidate=r.candidates.find(x=>x.accountId==='dclv2.ref-labs.near');
 assert.deepEqual(candidate.observedFlashNamedExports,['flash_loan']);
 assert.equal(candidate.status,'FLASH_NAMED_EXPORT_REQUIRES_REAL_LOAN_EVIDENCE');
 assert.equal(candidate.observedContractHeldLinearAtomic,'10000000000000000000000');
 assert.equal(candidate.observedBalanceIsBorrowableLiquidity,false);
 assert.equal(candidate.observedBalanceIsFlashLoanOffer,false);
 assert.equal(candidate.externalLoanContractVerified,false);
 assert.equal(candidate.uncollateralizedPrincipalTransferVerified,false);
 assert.equal(candidate.asynchronousRepaymentGuaranteeVerified,false);
 assert.equal(candidate.loanExecutionAllowed,false);
 assert.ok(f.visited.some(x=>x.method==='ft_balance_of'));
});
test('Stage141 invalid metadata and untrusted reserve amounts cannot promote candidate',async()=>{
 const f=scenario({nativeFlash:true,tokenMetadataInvalid:true});
 const r=await stage141Survey({fetcher:f.fetcher});
 assert.equal(r.loanTokenMetadataVerified,false);
 assert.equal(r.loanTokenMetadataReason,'STAGE141_BAD_NEP141_METADATA');
 assert.ok(r.candidates.every(x=>x.loanExecutionAllowed===false));
 assert.ok(f.visited.every(x=>x.method!=='ft_balance_of'));
 const g=scenario({nativeFlash:true,tokenBalance:'1.5'});
 const t=await stage141Survey({fetcher:g.fetcher});
 const c=t.candidates.find(x=>x.accountId==='dclv2.ref-labs.near');
 assert.equal(c.observedContractHeldLinearAtomic,null);
 assert.equal(c.observedContractTokenBalanceReason,'STAGE141_NONCANONICAL_FT_BALANCE');
 assert.equal(c.loanExecutionAllowed,false);
 assert.throws(()=>stage141QualifyEntry({accountId:'x.near'},{
  tokenAccountBalanceAtomic:'9999999999999999999999999999999999999999999999'
 }),/STAGE141_UNTRUSTED_LOAN_ASSET_BALANCE/);
});
test('Stage141 code hash mismatches and wrong finalized block cannot establish usable provider',async()=>{
 for(const opts of [{badHash:true},{drift:true}]){
  const f=scenario(opts);
  const r=await stage141Survey({fetcher:f.fetcher});
  const x=r.candidates.find(y=>y.accountId==='intents.near');
  assert.equal(x.deployedWasmHashVerified,false);
  assert.equal(x.loanExecutionAllowed,false);
  assert.equal(x.verifiedDeployedCodeHash,null);
 }
});
test('Stage141 watchlist is source documented; no unknown private account or signing path',async()=>{
 assert.deepEqual(STAGE141_WATCHLIST.map(x=>x.id),[
  'contract.main.burrow.near','v2.ref-finance.near','dclv2.ref-labs.near',
  'linear-protocol.near','intents.near','dex.intear.near']);
 for(const x of STAGE141_WATCHLIST){
  assert.match(x.source,/^https:\/\//);
  assert.notEqual(x.role,'FLASH_LENDER');
 }
 const f=scenario();
 await assert.rejects(()=>stage141Survey({
  rpcUrl:'http://untrusted.external',fetcher:f.fetcher
 }),/STAGE140_INSECURE_RPC/);
});
