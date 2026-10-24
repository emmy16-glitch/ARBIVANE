import {readFile,writeFile} from 'node:fs/promises';
import {buildStage37SandboxPlan} from './stage37-sandbox-liquidation.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
(async()=>{
 const e=proc.env;
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||!e.STAGE37_SOURCE_FILE)
  throw Error('STAGE37_STAGE35_REFERENCE_ONLY');
 const input=JSON.parse(await readFile(e.STAGE37_SOURCE_FILE,'utf8'));
 try{
  const plan=buildStage37SandboxPlan(input);
  await writeFile('stage37-sandbox-plan.json',JSON.stringify(plan,null,2)+'\n',
   {encoding:'utf8',mode:0o600});
  console.log(JSON.stringify({mode:'ARBIVANE_STAGE37_SANDBOX_READINESS',
   status:'VALIDATED_REFERENCE_PLAN_FOR_SANDBOX_ATTEMPT_ONLY',
   borrowerAccountId:plan.borrowerAccountId,blockHeight:plan.mainnetSourceBlockHeight,
   mainnetTradeAllowed:false,fullStateImportVerified:false,transactionsExecuted:0,
   mayBroadcastMainnet:false,executionEnabled:false},null,2));
 }catch{
  console.log(JSON.stringify({mode:'ARBIVANE_STAGE37_SANDBOX_READINESS',
   status:'BLOCKED_NO_SAFE_SOURCE_PLAN',sourceStatus:typeof input?.status==='string'?input.status:'INVALID',
   mainnetTradeAllowed:false,fullStateImportVerified:false,transactionsExecuted:0,
   mayBroadcastMainnet:false,executionEnabled:false},null,2));
 }
})().catch(()=>{
 console.log(JSON.stringify({mode:'ARBIVANE_STAGE37_SANDBOX_READINESS',
  status:'BLOCKED_MISSING_VERIFIED_STAGE35_ARTIFACT',transactionsExecuted:0,
  mainnetTradeAllowed:false,mayBroadcastMainnet:false,executionEnabled:false},null,2));
 proc.exitCode=2;
});
