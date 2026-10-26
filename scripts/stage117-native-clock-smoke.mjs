import * as pkg from 'near-workspaces';
import {sourceClock,initHistoricalSandbox,attestReplayClock} from './stage115-historical-sandbox-clock.mjs';
import {cloneStage89WrappedNear} from './stage89-targeted-wnear-clone.mjs';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
let worker;
try {
 // Authentic execution block from the downloaded Stage114 source proposal.
 const source=sourceClock({height:221669384,
  hash:'iQfaKaeeJs5UQCK4wcZHjbDfBVJKDoKHrH582gXBbTP',
  timestamp_nanosec:'1793006809814046000'},221669384);
 const replay=await initHistoricalSandbox(pkg,source);
 worker=replay.worker;
 await worker.rootAccount.createSubAccount('clock-smoke',{initialBalance:10n**24n});
 const witness=attestReplayClock(source,(await worker.provider.block({finality:'final'})).header);
 console.log(JSON.stringify({mode:'STAGE117_NATIVE_CLOCK_SMOKE_NOT_LIQUIDATION',...witness}));
 if(process.env.STAGE119_WNEAR_NATIVE_REGRESSION==='true'){
  const endpoint='https://archival-rpc.mainnet.fastnear.com';
  const wrapped=await cloneStage89WrappedNear({root:worker.rootAccount,
   rpc:new NearReadOnlyRpc(endpoint),endpoint,blockHeight:source.sourceBlockHeight,
   lendingAccountId:'contract.main.burrow.near',
   borrowerAccountId:'9345b3ac35a96e9c9efc6effa5ed50e92ff59a5b31e7b4f2d6f19400c3232899'});
  console.log(JSON.stringify({mode:'STAGE119_NATIVE_WNEAR_IMPORT_NOT_LIQUIDATION',...wrapped.evidence}));
 }
 const resumed=await replay.startReplayClock();
 await worker.rootAccount.createSubAccount('resumed-clock',{initialBalance:10n**24n});
 console.log(JSON.stringify({mode:'STAGE120_FORWARD_ONLY_EXECUTION_CLOCK',...resumed}));
} catch(error) {
 // This regression uses fixed public RPCs and no wallet credentials. Redact
 // URLs and any injected credential values before retaining the exception.
 let message=error instanceof Error?error.message:'STAGE117_NATIVE_CLOCK_FAILED';
 for(const [key,value] of Object.entries(process.env))
  if(/SECRET|TOKEN|KEY|PASSWORD|URL/.test(key)&&value&&value.length>6)
   message=message.replaceAll(value,'[REDACTED]');
 console.error(JSON.stringify({mode:'STAGE119_NATIVE_IMPORT_FAILURE',
  errorName:error instanceof Error?error.name:'UNKNOWN',
  message:message.replace(/https?:\/\/[^\s"']+/g,'[RPC_URL]').slice(0,1500)}));
 process.exitCode=1;
} finally {
 if(worker)await worker.tearDown().catch(()=>{});
 process.stdout.write('',()=>process.exit(process.exitCode??0));
}
