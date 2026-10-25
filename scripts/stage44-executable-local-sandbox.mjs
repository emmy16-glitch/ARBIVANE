#!/usr/bin/env node
/** Execute a real disposable local NEAR Sandbox WASM contract call and prove
 * before/after state plus finalized receipts. NO mainnet transaction or wallet.
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {attestStage44LocalContractExecution} from '../src/rhea/stage44-sandbox-contract-witness.ts';
const e=process.env;
let worker;
let transactionDiagnostic=null;
const output=e.STAGE44_REPORT_PATH??'stage44-local-sandbox-execution.json';
const MESSAGE='ARBIVANE_STAGE44_SANDBOX_STATE_CHANGED';
async function save(v){
 const temp=output+'.tmp';
 await writeFile(temp,JSON.stringify(v,null,2)+'\n',{encoding:'utf8',mode:0o600});
 await rename(temp,output);
}
async function main(){
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_WORKSPACES_NETWORK!=='sandbox'||
  e.STAGE44_ALLOW_LOCAL_MUTATION!=='true'||
  e.MAINNET_PRIVATE_KEY||e.NEAR_PRIVATE_KEY||e.NEAR_ACCOUNT_ID||
  e.STAGE44_CONTRACT_FILE!=='stage44-upstream-status-message.wasm')
  throw Error('STAGE44_ISOLATED_SANDBOX_ONLY');
 const bytes=await readFile(e.STAGE44_CONTRACT_FILE);
 if(bytes.length<1000||bytes.length>2000000||
  !bytes.subarray(0,4).equals(Buffer.from([0,97,115,109])))
  throw Error('STAGE44_INVALID_PINNED_WASM');
 const {Worker}=await import('near-workspaces');
 worker=await Worker.init({network:'sandbox'});
 const root=worker.rootAccount;
 if(!root||typeof root.devDeploy!=='function')throw Error('STAGE44_NO_LOCAL_ROOT');
 const contract=await root.devDeploy(e.STAGE44_CONTRACT_FILE,{
  initialBalance:3n*10n**24n,
 });
 const actor=await root.createSubAccount('arbivane-actor',{
  initialBalance:3n*10n**24n,
 });
 if(!contract?.accountId||!actor?.accountId)throw Error('STAGE44_NO_DISPOSABLE_ACTOR');
 // Observe unmodified storage first. Do not substitute a mocked local variable.
 const before=await contract.view('get_status',{account_id:actor.accountId});
 const raw=await actor.callRaw(contract,'set_status',{message:MESSAGE},{
  gas:100000000000000n,attachedDeposit:0n,
 });
 const after=await contract.view('get_status',{account_id:actor.accountId});
 // An optimistic execution response alone is not NEAR finality. Explicitly
 // advance the *local* Sandbox chain, then read persistent contract state again
 // at a later finalized block. This never sends anything to mainnet.
 const finalizedBefore=await worker.provider.block({finality:'final'});
 // NEAR Workspaces' own Sandbox fast-forward test uses 10,000 blocks
 // to advance the observed finalized height; eight blocks did not.
 await worker.provider.fastForward(10000);
 const finalizedAfter=await worker.provider.block({finality:'final'});
 const afterFastForward=await contract.view('get_status',{account_id:actor.accountId});
 const beforeHeight=finalizedBefore?.header?.height;
 const afterHeight=finalizedAfter?.header?.height;
 const result=raw?.result??raw;
 const status=result?.status;
 transactionDiagnostic={
  beforeWasNull:before===null,afterMatched:after===MESSAGE,
  persistsAtLaterFinalizedBlock:afterFastForward===MESSAGE,
  finalizedBlockBefore:beforeHeight??null,finalizedBlockAfter:afterHeight??null,
  finalExecutionStatus:typeof result?.final_execution_status==='string'?
   result.final_execution_status:null,
  statusType:typeof status,
  statusKeys:status&&typeof status==='object'?Object.keys(status).slice(0,5):[],
  wrapperSucceeded:raw?.succeeded===true,
  receiptCount:Array.isArray(result?.receipts_outcome)?result.receipts_outcome.length:null,
 };
 const report=attestStage44LocalContractExecution({
  transaction:raw,actorAccountId:actor.accountId,contractAccountId:contract.accountId,
  before,after,afterFastForward,
  finalizedBlockBefore:beforeHeight,finalizedBlockAfter:afterHeight,
  expectedMessage:MESSAGE,
 });
 await save(report);
 console.log(JSON.stringify(report,null,2));
}
try{await main();}
catch(error){
 const report={
  mode:'ARBIVANE_STAGE44_EXECUTABLE_LOCAL_SANDBOX_WITNESS',
  chain:'NEAR_SANDBOX',status:'BLOCKED_NO_VERIFIED_LOCAL_STATE_CHANGE',
  localContractExecutionVerified:false,realRheaLiquidationAttempted:false,
  profitVerified:false,executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  reason:error instanceof Error&&/^STAGE44_/.test(error.message)?error.message:
   'SANDBOX_RUNTIME_OR_CONTRACT_EXECUTION_FAILED',
  transactionDiagnostic,
 };
 await save(report).catch(()=>{});
 console.log(JSON.stringify(report,null,2));
 process.exitCode=2;
}
finally{if(worker)await worker.tearDown().catch(()=>{});}
