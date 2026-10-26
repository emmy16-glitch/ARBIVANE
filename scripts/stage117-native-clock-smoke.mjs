import * as pkg from 'near-workspaces';
import {sourceClock,initHistoricalSandbox,attestReplayClock} from './stage115-historical-sandbox-clock.mjs';
let worker;
try {
 // Authentic execution block from the downloaded Stage114 source proposal.
 const source=sourceClock({height:221659693,
  hash:'9ZKKQv6bobLiBnqCYh7o3YFPaVn6xNtaa86u1a7VWSCn',
  timestamp_nanosec:'1793001267416586578'},221659693);
 const replay=await initHistoricalSandbox(pkg,source);
 worker=replay.worker;
 await worker.rootAccount.createSubAccount('clock-smoke',{initialBalance:10n**24n});
 const witness=attestReplayClock(source,(await worker.provider.block({finality:'final'})).header);
 console.log(JSON.stringify({mode:'STAGE117_NATIVE_CLOCK_SMOKE_NOT_LIQUIDATION',...witness}));
} catch(error) {
 console.error(error instanceof Error?error.message:'STAGE117_NATIVE_CLOCK_FAILED');
 process.exitCode=1;
} finally {
 if(worker)await worker.tearDown().catch(()=>{});
 process.stdout.write('',()=>process.exit(process.exitCode??0));
}
