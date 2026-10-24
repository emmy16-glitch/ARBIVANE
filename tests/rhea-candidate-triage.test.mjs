import test from 'node:test';
import assert from 'node:assert/strict';
import { triageRheaDebtWindow, parseDetailedDebtScopes, classifyDebtPosition } from '../src/rhea/candidate-triage.ts';
import { parseRheaPythMetadata } from '../src/rhea/market-metadata.ts';
const HASH='2'.repeat(43);
const pools=[
 ['wrap.near',{supplied:{shares:'10',balance:'20'},borrowed:{shares:'5',balance:'10'}}],
 ['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'}}],
];
const accounts=[
 {account_id:'alice.near',positions:{'isolated:1':{borrowed:[{token_id:'usn',shares:'2'}],collateral:[{token_id:'wrap.near',shares:'3'}]}}},
 {account_id:'bob.near',positions:{'isolated:2':{borrowed:[{token_id:'wrap.near',shares:'1'}],collateral:[{token_id:'wrap.near',shares:'2'}]}}},
 {account_id:'charlie.near',positions:{'isolated:3':{borrowed:[],collateral:[]}}},
];
const details={
 'alice.near':{supplied:[],positions:{'isolated:1':{borrowed:[{token_id:'usn',shares:'2',balance:'2'}],collateral:[{token_id:'wrap.near',shares:'3',balance:'6'}]}}},
 'bob.near':{supplied:[],positions:{'isolated:2':{borrowed:[{token_id:'wrap.near',shares:'1',balance:'2'}],collateral:[{token_id:'wrap.near',shares:'2',balance:'4'}]}}},
};
const meta={'wrap.near':{price_identifier:'a'.repeat(64),decimals:24,fraction_digits:4}};
const cfg={lendingContract:'contract.main.burrow.near',oracleContract:'aggregate-oracle.near',fromIndex:0,maxAccounts:3,pageSize:2,maxFindings:10,maxDetails:4};
function mock({rows=accounts, detailed=details, metadata=meta, badBlock=false, disabled=false, failDetail=false, codeHash=HASH}={}){
 const calls=[];
 const rpc={
  async viewAccount(id,block){calls.push({kind:'account',id,block});return {blockHeight:'101',codeHash};},
  async view(id,method,args,block){calls.push({kind:'view',id,method,args,block});
   if(failDetail&&method==='get_account_all_positions')throw Error('RPC_METHOD_NOT_FOUND: secret');
   const value=method==='get_assets_paged'?pools:
     method==='get_num_accounts'?rows.length:
     method==='get_accounts_paged'?rows.slice(args.from_index,args.from_index+args.limit):
     method==='get_all_token_pyth_infos'?metadata:
     method==='get_config'?{enable_pyth_oracle:!disabled}:
     method==='get_account_all_positions'?detailed[args.account_id]??null:undefined;
   if(value===undefined)throw Error('unexpected RPC call '+method);
   return {blockHeight:badBlock&&method==='get_account_all_positions'?'102':'101',value};
  }
 };return {rpc,calls};
}
test('read-only triage differentiates missing price metadata from direct feed metadata',async()=>{
 const {rpc,calls}=mock();const r=await triageRheaDebtWindow(rpc,cfg);
 assert.equal(r.status,'INCOMPLETE_EVIDENCE');assert.equal(r.discoveredBorrowers,2);
 assert.equal(r.detailedBorrowers,2);assert.equal(r.records.length,2);
 assert.equal(r.records[0].status,'PRICE_METADATA_GAP');
 assert.deepEqual(r.records[0].reasons,['MISSING_PRICE_METADATA']);
 assert.equal(r.records[1].status,'DEBT_SET_OBSERVED_UNPRICED');
 assert.equal(r.executionEnabled,false);assert.equal(r.liquidationParityVerified,false);
 assert.equal(r.priceParityVerified,false);assert.equal(r.financialEligibilityVerified,false);
 assert.ok(r.records.every(x=>x.expectedProfitUsd===null&&x.liquidationEligible===false));
 assert.equal(r.nextOffset,3);
 assert.ok(calls.filter(x=>x.kind==='view').every(x=>x.block===101));
});
test('no discovered borrower means NO_DEBT_FOUND not empty eligible list',async()=>{
 const {rpc}=mock({rows:[accounts[2]]});const r=await triageRheaDebtWindow(rpc,{...cfg,maxAccounts:1});
 assert.equal(r.status,'NO_DEBT_FOUND');assert.equal(r.records.length,0);
});
test('detailed debt set mismatch reports fail closed',async()=>{
 const modified={...details,'bob.near':{supplied:[],positions:{'isolated:2':{borrowed:[{token_id:'usn',shares:'1',balance:'1'}],collateral:[]}}}};
 const {rpc}=mock({detailed:modified});const r=await triageRheaDebtWindow(rpc,cfg);
 assert.equal(r.rejectedBorrowers,1);assert.equal(r.records[1].status,'DETAIL_INCOMPATIBLE');
 assert.deepEqual(r.records[1].reasons,['DEBT_SCOPE_MISMATCH']);
});
test('detail RPC failure is bounded and sanitized, never interpreted as zero debt',async()=>{
 const {rpc}=mock({failDetail:true});const r=await triageRheaDebtWindow(rpc,cfg);
 assert.equal(r.records[0].status,'DETAIL_UNAVAILABLE');assert.ok(!JSON.stringify(r).includes('secret'));
});
test('cross block borrower details abort',async()=>{
 const {rpc}=mock({badBlock:true});await assert.rejects(()=>triageRheaDebtWindow(rpc,cfg),/cross-block borrower detail/);
});
test('hash pins prevent operating on unexpected contracts',async()=>{
 const {rpc,calls}=mock();await assert.rejects(()=>triageRheaDebtWindow(rpc,{...cfg,expectedOracleCodeHash:'3'.repeat(43)}),/PINNED_ORACLE_CODE_HASH_MISMATCH/);
 assert.equal(calls.filter(x=>x.method==='get_account_all_positions').length,0);
});
test('max detailed budget marks unverified positions rather than ignoring them',async()=>{
 const {rpc}=mock();const r=await triageRheaDebtWindow(rpc,{...cfg,maxDetails:1});
 assert.equal(r.records[1].status,'DETAIL_BUDGET_EXHAUSTED');assert.equal(r.records[1].reasons[0],'DETAIL_BUDGET_EXHAUSTED');
});
test('source details validate duplicate rows, u128 overflow, and zero shares',()=>{
 const allowed=new Set(['usn','wrap.near']);
 assert.throws(()=>parseDetailedDebtScopes({positions:{p:{borrowed:[{token_id:'usn',shares:'1',balance:'1'},{token_id:'usn',shares:'2',balance:'2'}]}}},allowed),/duplicate/);
 assert.throws(()=>parseDetailedDebtScopes({positions:{p:{borrowed:[{token_id:'usn',shares:'0',balance:'0'}]}}},allowed),/zero-share/);
 assert.throws(()=>parseDetailedDebtScopes({positions:{p:{borrowed:[{token_id:'usn',shares:(1n<<128n).toString(),balance:'1'}]}}},allowed),/overflow/);
 assert.throws(()=>parseDetailedDebtScopes({positions:{'bad space':{borrowed:[]}}},allowed),/position ID/);
});
test('explicit contract defaults remain unapproved for pricing',()=>{
 const m=parseRheaPythMetadata({'usn':{default_price:{multiplier:'10000',decimals:4},decimals:24}},['usn']);
 const c=classifyDebtPosition({positionId:'p',debtAssetIds:['usn'],collateralRecorded:true},['usn'],new Map(m.assets.map(x=>[x.assetId,x])),true);
 assert.equal(c.status,'PRICE_METADATA_GAP');assert.ok(c.reasons.includes('NON_DIRECT_ORACLE_SOURCE'));
});
test('disabled Pyth config is not silently treated as priced',async()=>{
 const {rpc}=mock({disabled:true,metadata:{'wrap.near':meta['wrap.near'],'usn':{price_identifier:'b'.repeat(64)}}});
 const r=await triageRheaDebtWindow(rpc,cfg);
 assert.ok(r.records.every(x=>x.reasons.includes('PYTH_CONFIG_DISABLED_OR_UNKNOWN')));
});
test('legacy default position is not mapped to isolated position ID 0',async()=>{
 const legacy={account_id:'legacy.near',borrowed:{usn:'1'},collateral:{'wrap.near':'1'}};
 const {rpc}=mock({rows:[legacy]});const r=await triageRheaDebtWindow(rpc,{...cfg,maxAccounts:1});
 assert.equal(r.records[0].status,'DETAIL_INCOMPATIBLE');
 assert.deepEqual(r.records[0].reasons,['LEGACY_SCOPE_NOT_VERIFIED']);
 assert.equal(r.detailedBorrowers,0);
});
test('invalid scanner budgets reject before any data reads',async()=>{
 for(const patch of [{maxDetails:21},{maxAccounts:1001},{fromIndex:-1},{maxFindings:101}]){
  const {rpc,calls}=mock();await assert.rejects(()=>triageRheaDebtWindow(rpc,{...cfg,...patch}),/invalid|must be/);
  assert.equal(calls.length,0);
 }
});

test('collateral presence mismatch blocks a position even if debt token sets agree',async()=>{
 const detail={...details,'alice.near':{supplied:[],positions:{'isolated:1':{borrowed:[{token_id:'usn',shares:'2',balance:'2'}],collateral:[]}}}};
 const {rpc}=mock({detailed:detail});const r=await triageRheaDebtWindow(rpc,cfg);
 assert.equal(r.records[0].status,'DETAIL_INCOMPATIBLE');
 assert.deepEqual(r.records[0].reasons,['COLLATERAL_SCOPE_MISMATCH']);
});
