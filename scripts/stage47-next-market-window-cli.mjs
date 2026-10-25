import {readFile,writeFile} from 'node:fs/promises';
import {planStage47Continuation} from './stage47-next-market-window.mjs';

function unsigned(raw,key){
 if(typeof raw!=='string'||!/^(0|[1-9][0-9]*)$/.test(raw))throw Error('STAGE47_INVALID_'+key);
 const v=Number(raw);
 if(!Number.isSafeInteger(v))throw Error('STAGE47_INVALID_'+key);
 return v;
}
async function main(){
 const e=process.env;
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||
  e.MAINNET_PRIVATE_KEY||e.NEAR_PRIVATE_KEY||e.NEAR_ACCOUNT_ID)
  throw Error('STAGE47_READ_ONLY_NO_SIGNER_REQUIRED');
 if(process.argv.length!==3)throw Error('STAGE47_EXPECTS_ONE_RECONCILIATION_FILE');
 const report=JSON.parse(await readFile(process.argv[2],'utf8'));
 const result=planStage47Continuation(report,{
  expectedBaseCursor:unsigned(e.STAGE47_EXPECTED_BASE_CURSOR,'BASE_CURSOR'),
  followupsRemaining:unsigned(e.STAGE47_FOLLOWUPS_REMAINING,'FOLLOWUPS'),
 });
 await writeFile('stage47-next-window.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(result));
}
main().catch(err=>{
 console.error(err instanceof Error?err.message:'STAGE47_UNCLASSIFIED_FAILURE');
 process.exitCode=2;
});
