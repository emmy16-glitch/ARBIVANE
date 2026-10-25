#!/usr/bin/env node
/** Validate one actual runner result from persisted files; NEVER convert a
 * missing, incomplete or unknown execution outcome into market continuation.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {classifyStage56SandboxAttempt} from './stage56-sandbox-attempt-evidence.mjs';
async function load(path){return JSON.parse(await readFile(path,'utf8'));}
try {
 const [exitArg,resultPath,phasePath,receiptPath,settlementPath]=process.argv.slice(2);
 if(!/^(0|2)$/.test(exitArg)||!resultPath||!phasePath||!receiptPath||!settlementPath||
  process.env.EXECUTION_ENABLED!=='false'||process.env.NEAR_NETWORK!=='mainnet'||
  process.env.NEAR_PRIVATE_KEY||process.env.MAINNET_PRIVATE_KEY)
  throw Error('STAGE56_NONTRADING_EVIDENCE_GATE_REQUIRED');
 const exitCode=Number(exitArg);
 const [report,phase]=await Promise.all([load(resultPath),load(phasePath)]);
 const [receipt,settlement]=exitCode===0?
  await Promise.all([load(receiptPath),load(settlementPath)]):[null,null];
 const witness=classifyStage56SandboxAttempt({exitCode,report,phase,receipt,settlement});
 await writeFile('stage56-sandbox-attempt-evidence.json',
  JSON.stringify(witness,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(witness,null,2));
}catch{
 console.error('STAGE56_UNVERIFIED_SANDBOX_ATTEMPT_BLOCKED_MARKET_CONTINUATION');
 process.exitCode=2;
}
