import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stage146AttemptRealPartnerFundedLocalRhea}
 from '../scripts/stage146-real-workspaces-partner-lender.mjs';

const originalKeys=[
 'NEAR_WORKSPACES_NETWORK','STAGE146_ALLOW_LOCAL_NEAR_LOAN','EXECUTION_ENABLED',
 'NEAR_PRIVATE_KEY','MAINNET_PRIVATE_KEY','NEAR_ACCOUNT_ID'
];
function environment(overrides,run){
 const before=Object.fromEntries(originalKeys.map(k=>[k,process.env[k]]));
 for(const k of originalKeys)delete process.env[k];
 Object.assign(process.env,overrides);
 return Promise.resolve().then(run).finally(()=>{
  for(const k of originalKeys){
   if(before[k]===undefined)delete process.env[k];
   else process.env[k]=before[k];
  }
 });
}
const pinned={
 chain:'NEAR_SANDBOX',maySignMainnet:false,mayBroadcastMainnet:false,
 lendingContract:'contract.main.burrow.near',borrowerAccountId:'borrower.test.near',
 actions:[
  {Borrow:{token_id:'linear-protocol.near',amount:'10000'}},
  {Liquidate:{account_id:'borrower.test.near',
   in_assets:[{token_id:'linear-protocol.near',max_amount:'10000'}],
   out_assets:[{token_id:'linear-protocol.near',amount:'11000'}]}},
  {Repay:{token_id:'linear-protocol.near'}},
  {Withdraw:{token_id:'linear-protocol.near',max_amount:'1000'}}
 ]
};
const ctx=()=>({
 root:{createSubAccount:async()=>{throw Error('should never be called');}},
 partner:{accountId:'sandbox-partner.test.near',callRaw:async()=>{throw Error('unexpected finance call');}},
 worker:{provider:{txStatus:async()=>{}}},
 plan:structuredClone(pinned),
 contracts:{get:k=>({accountId:k})}
});
test('Stage146 cannot execute unless explicitly limited to local sandbox',async()=>{
 await environment({},async()=>{
  await assert.rejects(stage146AttemptRealPartnerFundedLocalRhea(ctx()),
   /STAGE146_LOCAL_SIGNER_ONLY_EXPLICIT_GATE_REQUIRED/);
 });
 await environment({NEAR_WORKSPACES_NETWORK:'sandbox',
  STAGE146_ALLOW_LOCAL_NEAR_LOAN:'true',EXECUTION_ENABLED:'false',
  NEAR_PRIVATE_KEY:'owner-secret-not-real'},async()=>{
  await assert.rejects(stage146AttemptRealPartnerFundedLocalRhea(ctx()),
   /STAGE146_LOCAL_SIGNER_ONLY_EXPLICIT_GATE_REQUIRED/);
 });
});
test('Stage146 refuses any route that is not source-verified same-token LiNEAR liquidation',async()=>{
 await environment({NEAR_WORKSPACES_NETWORK:'sandbox',
  STAGE146_ALLOW_LOCAL_NEAR_LOAN:'true',EXECUTION_ENABLED:'false'},async()=>{
   for(const mutate of [
    x=>x.actions[0].Borrow.token_id='wrap.near',
    x=>x.actions.at(-1).Withdraw.token_id='wrap.near',
    x=>x.actions[1].Liquidate.account_id='other.test.near',
    x=>x.actions.pop(),
   ]){
    const arg=ctx();mutate(arg.plan);
    await assert.rejects(stage146AttemptRealPartnerFundedLocalRhea(arg),
     /STAGE146_ONLY_AUTHENTIC_SAME_TOKEN_LINEAR_RHEA_ROUTE/);
   }
  });
});
test('Stage146 implements real local FT transfer, supply, liquidation, repay, debt checks rather than paper ledger',async()=>{
 const runner=await readFile(new URL('../scripts/stage146-real-funded-workspaces-runner.mjs',import.meta.url),'utf8');
 const impl=await readFile(new URL('../scripts/stage146-real-workspaces-partner-lender.mjs',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage146-genuine-partner-sandbox.yml',import.meta.url),'utf8');
 for(const name of [
  "ft_transfer","ft_transfer_call","execute_with_pyth",
  "borrowedShareTotal", "observedPartnerToLiquidatorTransferAtomic",
  "observedLiquidatorToPartnerRepaymentAtomic"
 ])assert.ok(impl.includes(name));
 assert.match(impl,/realizedNetEconomicProfitVerified:false/);
 assert.match(impl,/actualFlashLoan:false/);
 assert.match(runner,/stage146AttemptRealPartnerFundedLocalRhea/);
 assert.match(runner,/STAGE146_ALLOW_LOCAL_NEAR_LOAN/);
 assert.match(workflow,/run-id: '40317139342'/);
 assert.match(workflow,/near-workspaces@5.0.0/);
 assert.match(workflow,/stage146-actual-partner-evidence.json/);
 assert.match(workflow,/actualFlashLoan == false/);
 assert.doesNotMatch(impl,/\.sendMoney\(/);
});
