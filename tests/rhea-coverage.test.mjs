import test from 'node:test';
import assert from 'node:assert/strict';
import {examineRheaMarketExposure,inspectRheaCoverage} from '../src/rhea/coverage.ts';
import {deriveDiagnosticPrice} from '../src/rhea/derived-prices.ts';
import {compareRheaReferenceCase} from '../src/rhea/parity.ts';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
const price='a'.repeat(64), lendingHash='3'.repeat(43),oracleHash='4'.repeat(43);
const A='token.burrow.near',B='usn',C='usdc.testnet';
const metadata={assets:[
 {assetId:A,source:'UNRESOLVED'}, {assetId:B,source:'UNRESOLVED'}, {assetId:C,source:'DIRECT_PYTH'}],
 missingMetadata:[A,B],extraMetadata:[],unresolvedAssets:[],blockHeight:'551',lendingCodeHash:lendingHash,oracleCodeHash:oracleHash};
const row=(token,balance,borrowed,flags={})=>[token,{config:{can_borrow:true,...flags},supplied:{balance,shares:balance},borrowed:{balance:borrowed,shares:borrowed}}];
const assets=[row(A,'123000','4000'),row(B,'0','0',{can_borrow:false}),row(C,'987654321','55')];
test('unpriced assets with pool liquidity/debt are flagged, not dropped or marked delisted',()=>{
 const v=examineRheaMarketExposure(assets,metadata);
 assert.equal(v.find(x=>x.assetId===A).assessment,'MISSING_METADATA_WITH_EXPOSURE');
 assert.equal(v.find(x=>x.assetId===A).poolHasOutstandingDebt,true);
 assert.equal(v.find(x=>x.assetId===B).assessment,'MISSING_METADATA_NO_OBSERVED_EXPOSURE');
 assert.equal(v.find(x=>x.assetId===B).canBorrow,false);
 assert.equal(v.find(x=>x.assetId===C).assessment,'PRICE_SOURCE_DECLARED');
});
test('pool membership and cardinality must match metadata snapshot',()=>{
 assert.throws(()=>examineRheaMarketExposure(assets.slice(0,2),metadata),/count mismatch/);
 assert.throws(()=>examineRheaMarketExposure([assets[0],assets[0],assets[2]],metadata),/duplicate lending asset/);
});
test('missing pool fields remain UNKNOWN, never automatic no exposure',()=>{
 const v=examineRheaMarketExposure([ [A,{config:{}}],assets[1],assets[2] ],metadata);
 assert.equal(v.find(x=>x.assetId===A).assessment,'MISSING_METADATA_EXPOSURE_UNKNOWN');
 assert.equal(v.find(x=>x.assetId===A).poolHasOutstandingDebt,null);
});
test('pool values reject scientific notation, negative or corrupt balances',()=>{
 for(const v of ['-1','1e9',123,'0001']){
  const x=[row(A,'5','0'),row(B,'0','0'),row(C,'2','1')];x[0][1].supplied.balance=v;
  assert.throws(()=>examineRheaMarketExposure(x,metadata),/must be unsigned/);
 }
 assert.throws(()=>examineRheaMarketExposure([row(A,'2','0',{can_borrow:'false'}),assets[1],assets[2]],metadata),/must be boolean/);
});
test('reject contradictory empty pool shares with nonzero balance',()=>{
 const x=[row(A,'10','0'),assets[1],assets[2]];x[0][1].supplied.shares='0';
 assert.throws(()=>examineRheaMarketExposure(x,metadata),/balance without shares/);
});
function rpcFixture({mismatch=false,missing=false}={}) {
 const calls=[];
 const fetcher=async(_url,opt)=>{
  const p=JSON.parse(opt.body).params;calls.push(p);
  const wrap=v=>({ok:true,json:async()=>({result:v})});
  if(p.request_type==='view_account')return wrap({block_height:551,code_hash:p.account_id==='lending.testnet'?lendingHash:oracleHash});
  const value=p.method_name==='get_assets_paged' ? assets
    : p.method_name==='get_config'?{enable_pyth_oracle:true}
    : p.method_name==='get_all_token_pyth_infos' ? {[C]:{price_identifier:price,decimals:6,fraction_digits:4}} : null;
  if(!value)throw Error('unexpected call');
  const count=calls.filter(c=>c.method_name==='get_assets_paged').length;
  return wrap({block_height:mismatch&&count===2?552:551,result:[...new TextEncoder().encode(JSON.stringify(missing&&p.method_name==='get_assets_paged'&&count===2?assets.slice(1):value))]});
 };
 return {rpc:new NearReadOnlyRpc('https://rpc.testnet.near.org',fetcher),calls};
}
const cfg={lendingContract:'lending.testnet',oracleContract:'oracle.testnet'};
test('finalized metadata and exposure views stay pinned to the same block, no send tx',async()=>{
 const {rpc,calls}=rpcFixture();const result=await inspectRheaCoverage(rpc,cfg);
 assert.equal(result.status,'UNVERIFIED_MISSING_METADATA');
 assert.equal(result.executionEnabled,false);
 assert.equal(result.borrowerPositionsExamined,0);
 assert.deepEqual(result.missingMetadata,[A,B]);
 assert.ok(result.warnings.includes('UNPRICED_POOL_WITH_FUNDS_OR_OUTSTANDING_DEBT'));
 assert.equal(calls.filter(c=>c.method_name==='get_assets_paged').length,2);
 assert.deepEqual(calls.slice(1).map(c=>c.block_id),Array(5).fill(551));
 assert.ok(calls.every(c=>c.request_type==='call_function'||c.request_type==='view_account'));
});
test('reject changed asset membership or inconsistent block after metadata read',async()=>{
 await assert.rejects(()=>inspectRheaCoverage(rpcFixture({mismatch:true}).rpc,cfg),/inconsistent snapshot block/);
 await assert.rejects(()=>inspectRheaCoverage(rpcFixture({missing:true}).rpc,cfg),/metadata\/asset count mismatch/);
});
const ratio={kind:'STNEAR_NEAR',underlyingAssetId:'wrap.near',derivativeAssetId:'meta-pool.near',
 numerator:'1200000000000000000000000',denominator:'1000000000000000000000000',ratioReadBlock:'887',underlyingPriceReadBlock:'887',sourceMethod:'get_stnear_price',operatorApproved:true};
test('derived price uses exact bigint arithmetic and refuses to claim execution approval',()=>{
 const got=deriveDiagnosticPrice(ratio,{multiplier:2000000n,decimals:6});
 assert.equal(got.conservativeMultiplier,'2400000000000');
 assert.equal(got.decimals,12);assert.equal(got.approvedForExecution,false);
});
test('derived price rejects mismatch block, unreviewed method, zero ratio and guessed ratio',()=>{
 assert.throws(()=>deriveDiagnosticPrice({...ratio,ratioReadBlock:'886'},{multiplier:2n,decimals:0}),/same pinned block/);
 assert.throws(()=>deriveDiagnosticPrice({...ratio,operatorApproved:false},{multiplier:2n,decimals:0}),/not been independently approved/);
 assert.throws(()=>deriveDiagnosticPrice({...ratio,numerator:'0'},{multiplier:2n,decimals:0}),/invalid ratio/);
 assert.throws(()=>deriveDiagnosticPrice({...ratio,sourceMethod:'ft_price'},{multiplier:2n,decimals:0}),/unrecognized ratio method/);
 assert.throws(()=>deriveDiagnosticPrice({...ratio,derivativeAssetId:'wrap.near'},{multiplier:2n,decimals:0}),/invalid derivative pairing/);
});
test('derived price floors fractional remainder rather than rounding up',()=>{
 const value=deriveDiagnosticPrice({...ratio,numerator:'2',denominator:'3'},{multiplier:1n,decimals:0});
 assert.equal(value.conservativeMultiplier,'666666666666');
});
const account={accountId:'user.testnet',adjustedCollateralUsdE6:90000000n,adjustedDebtUsdE6:100000000n,healthFactorBps:9000n};
const reference={accountId:'user.testnet',observedBlock:'123',sourceType:'DOC_EXAMPLE',referenceId:'https://guide.rhea.finance/fixture',
 expectedAdjustedCollateralUsdE6:'90000000',expectedAdjustedDebtUsdE6:'100000000',expectedHealthFactorBps:'9000'};
test('document example parity test passes numbers but always rejects trading approval',()=>{
 const result=compareRheaReferenceCase(account,'123',reference);
 assert.equal(result.matchesReference,true);
 assert.equal(result.executableContractParityApproved,false);
 assert.equal(result.mode,'REFERENCE_COMPARISON_ONLY');
});
test('mismatched health, adjusted collateral and debt produce explicit divergences',()=>{
 const result=compareRheaReferenceCase(account,'123',{...reference,expectedAdjustedCollateralUsdE6:'100000000',expectedAdjustedDebtUsdE6:'101000000',expectedHealthFactorBps:'9999'});
 assert.deepEqual(result.reasons,['ADJUSTED_COLLATERAL_DIVERGES','ADJUSTED_DEBT_DIVERGES','HEALTH_FACTOR_DIVERGES']);
});
test('contract reference claims require code hash and consistent block',()=>{
 assert.throws(()=>compareRheaReferenceCase(account,'123',{...reference,sourceType:'REVIEWED_DEPLOYED_CONTRACT'}),/code hash pin/);
 assert.throws(()=>compareRheaReferenceCase(account,'124',reference),/account or block/);
 assert.throws(()=>compareRheaReferenceCase(account,'123',{...reference,expectedAdjustedDebtUsdE6:'-1'}),/invalid expected/);
});
