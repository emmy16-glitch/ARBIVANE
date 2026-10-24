import test from 'node:test';
import assert from 'node:assert/strict';
import {parseParityPools} from '../src/rhea/deployed-share-parity.ts';
import {parseIsolatedPaged,parseIsolatedDetailed,compareIsolatedPositions,probeRheaIsolatedPositions} from '../src/rhea/isolated-parity.ts';
const lending='contract.main.burrow.near',oracle='aggregate-oracle.near',hash='2'.repeat(43);
const assets=[['wrap.near',{supplied:{shares:'10',balance:'30'},borrowed:{shares:'8',balance:'40'}}],['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'}}]];
const pools=()=>parseParityPools(assets);
const account={account_id:'alice.near',positions:{'0':{collateral:{'wrap.near':'2'},borrowed:{usn:'3'}},'1':{collateral:{},borrowed:{}}}};
const detail={supplied:[],positions:{'0':{supplied:[],collateral:[{token_id:'wrap.near',shares:'2',balance:'6'}],borrowed:[{token_id:'usn',shares:'3',balance:'3'}]},'1':{supplied:[],collateral:[],borrowed:[]}}};
const opts={lendingContract:lending,oracleContract:oracle,maxAccounts:2,pageSize:2,maxDetails:1};
function fake(patch={}){
 const calls=[];
 const rpc={
  async viewAccount(id,block){calls.push(['account',id,block]);return {blockHeight:'101',codeHash:hash};},
  async view(id,method,args,block){calls.push(['view',method,args,block]);let value;
   if(method==='get_assets_paged')value=assets;
   else if(method==='get_num_accounts')value=2;
   else if(method==='get_accounts_paged')value=[account,{account_id:'bob.near',positions:{}}];
   else if(method==='get_account_all_positions')value=detail;
   else throw Error('unexpected method');
   if(method in patch)return patch[method](value);
   return {value,blockHeight:'101'};
  },
 };return {rpc,calls};
}
test('isolated positions compare precisely by position ID and never permit trading',async()=>{
 const {rpc,calls}=fake();const r=await probeRheaIsolatedPositions(rpc,opts);
 assert.equal(r.status,'SAMPLED_POSITION_MATCH_UNAPPROVED');assert.equal(r.matchedAccounts,1);assert.equal(r.comparedLegs,2);
 assert.equal(r.liquidationParityVerified,false);assert.equal(r.executionEnabled,false);
 assert.ok(calls.filter(v=>v[0]==='view').every(v=>v[3]===101));
 assert.equal(calls.filter(v=>v[1]==='get_account_all_positions').length,1);
});
test('same asset in two separate positions stays distinct',()=>{
 const a={...account,positions:{'0':account.positions['0'],'1':{collateral:{'wrap.near':'1'},borrowed:{usn:'1'}}}};
 const b={...detail,positions:{'0':detail.positions['0'],'1':{supplied:[],collateral:[{token_id:'wrap.near',shares:'1',balance:'3'}],borrowed:[{token_id:'usn',shares:'1',balance:'1'}]}}};
 const result=compareIsolatedPositions(a,b,pools());assert.equal(result.status,'MATCH');assert.equal(result.comparedLegs,4);
});
test('position IDs must match and cannot be flattened',()=>{
 const d={...detail,positions:{'2':detail.positions['0'],'1':detail.positions['1']}};
 const result=compareIsolatedPositions(account,d,pools());assert.equal(result.status,'MISMATCH');assert.equal(result.mismatches.POSITION_ID_SET_MISMATCH,2);
});
test('mutated detailed share produces an explicit mismatch',()=>{
 const d={...detail,positions:{...detail.positions,'0':{...detail.positions['0'],borrowed:[{token_id:'usn',shares:'4',balance:'4'}]}}};
 const r=compareIsolatedPositions(account,d,pools());assert.equal(r.mismatches.INCONSISTENT_POSITION_SHARES,1);
});
test('mutated balance must fail even when shares match',()=>{
 const d={...detail,positions:{...detail.positions,'0':{...detail.positions['0'],borrowed:[{token_id:'usn',shares:'3',balance:'4'}]}}};
 const r=compareIsolatedPositions(account,d,pools());assert.equal(r.mismatches.POSITION_BALANCE_MISMATCH,1);
});
test('reject nonempty account-global collateral in isolated position model',()=>{
 assert.throws(()=>parseIsolatedPaged({...account,collateral:{'wrap.near':'1'}},pools()),/ambiguous/);
});
test('reject duplicated tokens within a single isolated position',()=>{
 assert.throws(()=>parseIsolatedPaged({...account,positions:{'0':{collateral:[{token_id:'wrap.near',shares:'1'},{token_id:'wrap.near',shares:'2'}],borrowed:{}}}},pools()),/duplicate/);
});
test('reject unknown token and u128 overflow',()=>{
 assert.throws(()=>parseIsolatedPaged({...account,positions:{'0':{collateral:{'unknown.near':'1'},borrowed:{}}}},pools()),/unknown/);
 assert.throws(()=>parseIsolatedPaged({...account,positions:{'0':{collateral:{'wrap.near':(1n<<128n).toString()},borrowed:{}}}},pools()),/overflow/);
});
test('reject malformed detailed balances and unknown assets',()=>{
 assert.throws(()=>parseIsolatedDetailed({positions:{'0':{collateral:[{token_id:'wrap.near',shares:'2',balance:'-1'}],borrowed:[]}}},pools()),/invalid u128/);
 assert.throws(()=>parseIsolatedDetailed({positions:{'0':{collateral:[{token_id:'bad.near',shares:'1',balance:'3'}],borrowed:[]}}},pools()),/unknown/);
});
test('RPC view missing reports unavailable without fallback or false approval',async()=>{
 const {rpc,calls}=fake();const old=rpc.view;
 rpc.view=async(...a)=>{if(a[1]==='get_account_all_positions')throw Error('method unavailable');return old(...a);};
 const r=await probeRheaIsolatedPositions(rpc,opts);assert.equal(r.status,'VIEW_UNAVAILABLE');assert.equal(r.schemaReasons.DETAIL_VIEW_UNAVAILABLE,1);
 assert.equal(calls.filter(v=>v[1]==='get_account').length,0);
});
test('detail at different block aborts',async()=>{
 const {rpc}=fake();const original=rpc.view;rpc.view=async(...args)=>args[1]==='get_account_all_positions'?{value:detail,blockHeight:'102'}:original(...args);
 await assert.rejects(()=>probeRheaIsolatedPositions(rpc,opts),/detailed positions block inconsistent/);
});
test('code hash pin mismatch rejects before any assets are read',async()=>{
 const {rpc,calls}=fake();await assert.rejects(()=>probeRheaIsolatedPositions(rpc,{...opts,expectedLendingCodeHash:'3'.repeat(43)}),/hash mismatch/);
 assert.equal(calls.some(v=>v[1]==='get_assets_paged'),false);
});
test('mismatched all-position result is never reported as match',async()=>{
 const {rpc}=fake();const original=rpc.view;rpc.view=async(...args)=>args[1]==='get_account_all_positions'?{value:{...detail,positions:{other:detail.positions['0']}},blockHeight:'101'}:original(...args);
 const r=await probeRheaIsolatedPositions(rpc,opts);assert.equal(r.status,'POSITION_MISMATCH');
});
test('empty isolated market never reports a successful sampled check',async()=>{
 const {rpc}=fake({'get_accounts_paged':()=>({blockHeight:'101',value:[{account_id:'alice.near',positions:{}},{account_id:'bob.near',positions:{}}]})});
 const r=await probeRheaIsolatedPositions(rpc,opts);assert.equal(r.status,'NO_ELIGIBLE_POSITIONS');
});
