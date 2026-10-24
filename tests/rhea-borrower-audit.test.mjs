import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeBorrowers,auditRheaBorrowers} from '../src/rhea/borrower-audit.ts';
import {compareRheaReferenceSuite} from '../src/rhea/reference-suite.ts';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
const price='eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a';
const ids=['usn','wrap.near','token.burrow.near'];
const row=(id,borrowed={},collateral={},supplied={})=>({account_id:id,borrowed,collateral,supplied});
const rows=[row('alice.near',{usn:'500', 'wrap.near':'100'},{'wrap.near':'42'}),row('bob.near',{'wrap.near':'10'},{'token.burrow.near':'2'},{usn:'99'}),row('carol.near')];
test('borrower sample counts unresolved debt and collateral by account without calculating USD values',()=>{
 const data=summarizeBorrowers(rows,ids,['usn','token.burrow.near']);
 assert.equal(data.debtAccounts,2); assert.equal(data.unpricedDebt,1);assert.equal(data.unpricedCollateral,1);
 assert.deepEqual(data.assets.find(x=>x.assetId==='usn'),{assetId:'usn',priceMetadataMissing:true,debtAccounts:1,collateralAccounts:0,suppliedAccounts:1,borrowedShares:'500',collateralShares:'0'});
});
test('reject unknown pool assets even if their shares are valid',()=>{
 assert.throws(()=>summarizeBorrowers([row('a.near',{unknown:'5'})],ids,['usn']),/unknown borrowed asset/);
});
test('reject malformed negative, scientific, nonstring and padded shares',()=>{
 for(const v of ['-1','1e4','01','1.5',5]){
  assert.throws(()=>summarizeBorrowers([row('a.near',{usn:v})],ids,['usn']),/shares/);
 }
});
test('reject duplicate borrowers and ambiguous account id shape',()=>{
 assert.throws(()=>summarizeBorrowers([rows[0],rows[0]],ids,['usn']),/duplicate borrower/);
 assert.throws(()=>summarizeBorrowers([{...rows[0],accountId:'other.near'}],ids,['usn']),/ambiguous account/);
});
test('reject incomplete or ambiguous account and market structures',()=>{
 assert.throws(()=>summarizeBorrowers([{account_id:'bad.near',borrowed:{usn:'1'}}],ids,['usn']),/invalid collateral/);
 assert.throws(()=>summarizeBorrowers(rows,['usn','usn'],['usn']),/invalid market assets/);
 assert.throws(()=>summarizeBorrowers(rows,ids,['missing']),/missing metadata set inconsistent/);
 assert.throws(()=>summarizeBorrowers(Array(201).fill(rows[0]),ids,['usn']),/sample over limit/);
});
const hash='3'.repeat(43),otherHash='4'.repeat(43);
const assets=ids.map(id=>[id,{supplied:{balance:'100',shares:'100'},borrowed:{balance:'10',shares:'10'},config:{can_borrow:false}}]);
function rpcFixture({badPage=false,badBlock=false,badCount=false}={}){
 const calls=[];const fetcher=async(_url,opts)=>{
  const p=JSON.parse(opts.body).params;calls.push(p);
  let data;
  if(p.request_type==='view_account')return {ok:true,json:async()=>({result:{block_height:991,code_hash:p.account_id==='lending.testnet'?hash:otherHash}})};
  if(p.method_name==='get_assets_paged')data=assets;
  else if(p.method_name==='get_config')data={enable_pyth_oracle:true};
  else if(p.method_name==='get_all_token_pyth_infos')data={'wrap.near':{price_identifier:price,decimals:24}};
  else if(p.method_name==='get_num_accounts')data=badCount?'not-a-number':'10';
  else if(p.method_name==='get_accounts_paged')data=rows.slice(p.args_base64?JSON.parse(atob(p.args_base64)).from_index:0, (p.args_base64?JSON.parse(atob(p.args_base64)).from_index:0)+(p.args_base64?JSON.parse(atob(p.args_base64)).limit:0));
  else throw Error('unexpected method');
  if(badPage&&p.method_name==='get_accounts_paged')data=data.slice(0,0);
  const block=badBlock&&p.method_name==='get_accounts_paged'?992:991;
  return {ok:true,json:async()=>({result:{block_height:block,result:[...new TextEncoder().encode(JSON.stringify(data))]}})};
 };
 return {rpc:new NearReadOnlyRpc('https://rpc.testnet.near.org',fetcher),calls};
}
const cfg={lendingContract:'lending.testnet',oracleContract:'oracle.testnet',maxAccounts:2,pageSize:1};
test('pinned public RPC borrower audit does not send transactions or assume full market coverage',async()=>{
 const {rpc,calls}=rpcFixture();const report=await auditRheaBorrowers(rpc,cfg);
 assert.equal(report.totalAccounts,10);assert.equal(report.sampledAccounts,2);assert.equal(report.completeEnumeration,false);
 assert.equal(report.accountsWithMissingPriceDebt,1);assert.equal(report.accountsWithMissingPriceCollateral,1);
 assert.equal(report.executionEnabled,false);assert.equal(report.liquidationParityVerified,false);
 assert.ok(report.warnings.includes('FIRST_N_IS_NOT_A_REPRESENTATIVE_MARKET_SAMPLE'));
 assert.equal(calls.filter(x=>x.method_name==='get_accounts_paged').length,2);
 assert.ok(calls.every(x=>x.request_type==='view_account'||x.request_type==='call_function'));
 assert.ok(calls.filter(x=>x.method_name).every(x=>x.block_id===991));
});
test('reject paginated borrower omissions, inconsistent blocks and bad total',async()=>{
 await assert.rejects(()=>auditRheaBorrowers(rpcFixture({badPage:true}).rpc,cfg),/incomplete or unpinned/);
 await assert.rejects(()=>auditRheaBorrowers(rpcFixture({badBlock:true}).rpc,cfg),/inconsistent snapshot block|incomplete or unpinned/);
 await assert.rejects(()=>auditRheaBorrowers(rpcFixture({badCount:true}).rpc,cfg),/invalid account count/);
});
test('reject unbounded scan configurations before RPC access',async()=>{
 await assert.rejects(()=>auditRheaBorrowers(rpcFixture().rpc,{...cfg,maxAccounts:201}),/maxAccounts/);
 await assert.rejects(()=>auditRheaBorrowers(rpcFixture().rpc,{...cfg,pageSize:51}),/pageSize/);
});
const snapshot=()=>({mode:'DISCOVERY_ONLY',blockHeight:'54321',accountCount:1,assets:[
 ['wrap.near',{supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{volatility_ratio:5000,extra_decimals:0,can_borrow:true}}],
 ['dai.near',{supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{volatility_ratio:10000,extra_decimals:0,can_borrow:true}}]
],oracle:{timestamp:'1792800000000000000',prices:[
 {asset_id:'wrap.near',price:{multiplier:'7000000',decimals:6}},
 {asset_id:'dai.near',price:{multiplier:'1000000',decimals:6}}]},accounts:[row('alice.near',{'dai.near':'4000'},{'wrap.near':'1000'})]});
const reference=()=>({accountId:'alice.near',observedBlock:'54321',sourceType:'DOC_EXAMPLE',referenceId:'https://guide.rhea.finance/borrower-fixture',expectedAdjustedCollateralUsdE6:'3500000000',expectedAdjustedDebtUsdE6:'4000000000',expectedHealthFactorBps:'8750'});
test('offline reference comparison matches documented example but does not approve execution',()=>{
 const r=compareRheaReferenceSuite(snapshot(),[reference()]);assert.equal(r.allMatch,true);assert.equal(r.approvedForExecution,false);assert.equal(r.compared,1);
});
test('offline comparison pin rejects omitted account, changed reference block or forged contract hash',()=>{
 assert.throws(()=>compareRheaReferenceSuite(snapshot(),[]),/one reference/);
 assert.throws(()=>compareRheaReferenceSuite(snapshot(),[{...reference(),observedBlock:'54320'}]),/account or block/);
 assert.throws(()=>compareRheaReferenceSuite(snapshot(),[{...reference(),sourceType:'REVIEWED_DEPLOYED_CONTRACT',contractCodeHash:hash}],otherHash),/contract hash/);
});
test('offline reference divergence is detectable without access to signing keys',()=>{
 const r=compareRheaReferenceSuite(snapshot(),[{...reference(),expectedHealthFactorBps:'9999'}]);
 assert.equal(r.allMatch,false);assert.deepEqual(r.differences[0].reasons,['HEALTH_FACTOR_DIVERGES']);
});
