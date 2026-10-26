import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stage150ChooseLargeLocalPrincipal,stage150BoundLargeDebtClosure}
 from '../scripts/stage146-real-workspaces-partner-lender.mjs';
import {seedSandboxLiquidatorWithWrappedNear}
 from '../scripts/stage49-sandbox-wrap-funding.mjs';

const env=(tokens='10')=>({
 STAGE150_LARGE_SANDBOX:'true',STAGE150_LARGE_SANDBOX_TOKENS:tokens,
 STAGE146_ALLOW_LOCAL_NEAR_LOAN:'true',
 NEAR_WORKSPACES_NETWORK:'sandbox',EXECUTION_ENABLED:'false'
});
test('Stage150 genuinely targets 10 or 100 full tokens instead of increasing a report only',()=>{
 assert.deepEqual(stage150ChooseLargeLocalPrincipal({
  env:env(),sourceBorrowAmountInternal:'1858490264605801'
 }),{enabled:true,borrowInternalAtomic:'10000000000000000000000000'});
 assert.deepEqual(stage150ChooseLargeLocalPrincipal({
  env:env('100'),sourceBorrowAmountInternal:'1858490264605801'
 }),{enabled:true,borrowInternalAtomic:'100000000000000000000000000'});
 assert.deepEqual(stage150ChooseLargeLocalPrincipal({
  env:{},sourceBorrowAmountInternal:'1858490264605801'
 }),{enabled:false,borrowInternalAtomic:'1858490264605801'});
 for(const bad of [
  {...env(),NEAR_WORKSPACES_NETWORK:'mainnet'},
  {...env(),NEAR_PRIVATE_KEY:'unsafe'},
  {...env(),EXECUTION_ENABLED:'true'},
  {...env(),STAGE146_ALLOW_LOCAL_NEAR_LOAN:'false'},
  env('1000')
 ])assert.throws(()=>stage150ChooseLargeLocalPrincipal({
  env:bad,sourceBorrowAmountInternal:'1858490264605801'
 }),/STAGE150_/);
});
test('Stage150 additional liability payment strictly limited to observed actor FT and one-tenth percent principal',()=>{
 const good={debtSharesAtomic:'10000000000',debtBalanceAtomic:'10000000001',
  actorBalanceAtomic:'2531190098551',alreadySentAtomic:'0',
  realBorrowedPrincipalAtomic:'10000000000000000000000000'};
 assert.equal(stage150BoundLargeDebtClosure(good),'10000000033');
 for(const delta of [
  {debtBalanceAtomic:'100000000000000000000000'},
  {actorBalanceAtomic:'20'},
  {alreadySentAtomic:'10000000000000000000000'},
  {realBorrowedPrincipalAtomic:'200'},
  {debtSharesAtomic:'0'},
  {debtBalanceAtomic:'0'}
 ])assert.throws(()=>stage150BoundLargeDebtClosure({...good,...delta}),/STAGE150_/);
});
test('Stage150 cannot substitute larger native collateral without explicit Sandbox-only opt-in',async()=>{
 const original=Object.fromEntries(['STAGE150_LARGE_SANDBOX','NEAR_WORKSPACES_NETWORK',
  'EXECUTION_ENABLED','STAGE146_ALLOW_LOCAL_NEAR_LOAN'].map(x=>[x,process.env[x]]));
 let reads=0;
 try{
  process.env.STAGE150_LARGE_SANDBOX='false';
  process.env.NEAR_WORKSPACES_NETWORK='sandbox';
  process.env.EXECUTION_ENABLED='false';
  process.env.STAGE146_ALLOW_LOCAL_NEAR_LOAN='true';
  await assert.rejects(seedSandboxLiquidatorWithWrappedNear({
   actor:{accountId:'partner.test.near',callRaw:()=>{reads++;}},
   lending:{accountId:'contract.main.burrow.near',view:()=>{reads++;}},
   wrapped:{accountId:'wrap.near',view:()=>{reads++;}},
   assetRows:[],sandboxCollateralYocto:1000n*10n**24n
  }),/STAGE150_NON_DEFAULT_COLLATERAL_REQUIRES_LOCAL_OPT_IN/);
  assert.equal(reads,0);
 }finally{
  for(const [key,val] of Object.entries(original)){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});
test('Stage150 requires genuine FT transfer and source-capped liquidation plus withdrawal of unspent supply',async()=>{
 const runner=await readFile('scripts/stage146-real-funded-workspaces-runner.mjs','utf8');
 const impl=await readFile('scripts/stage146-real-workspaces-partner-lender.mjs','utf8');
 const native=await readFile('scripts/stage49-sandbox-wrap-funding.mjs','utf8');
 assert.match(runner,/1003n\*10n\*\*24n/);
 assert.match(runner,/1000n\*10n\*\*24n/);
 assert.match(runner,/STAGE150_LARGE_MARKET_RESERVE_OR_HEALTH_INSUFFICIENT/);
 assert.match(impl,/amount:chosenBorrow/);
 assert.match(impl,/stage150BorrowedFtLargeAmountVerified=true/);
 assert.match(impl,/if\(large.enabled\)await guard\('STAGE150_WITHDRAW_UNUSED_LARGE_SUPPLIED_LINEAR'/);
 assert.match(impl,/actions:\[\{Withdraw:\{token_id:'linear-protocol.near'\}\}\]/);
 assert.match(impl,/stage150RemainingRheaSupplyReclaimed=true/);
 assert.match(impl,/ACTUAL_FT_REPAYMENT_TO_EXTERNAL_PARTNER_ACCOUNT/);
 assert.match(impl,/stage150BoundLargeDebtClosure/);
 assert.match(native,/MAX_GAS/);
 assert.doesNotMatch(impl,/ft_mint|broadcast_tx_commit|\.sendMoney\(/);
});
