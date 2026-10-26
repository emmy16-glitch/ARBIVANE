#!/usr/bin/env node
/** Stage137: OFFLINE only. The supplied header and light-client head root must
 * be authenticated by a separately verified chain-of-trust implementation.
 * This CLI does not fetch, sign, broadcast or spend on mainnet.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {stage137CheckOutcomeProof} from './stage137-near-outcome-merkle.mjs';
import {stage138MainnetSpendingAdmission} from './stage138-mainnet-spending-admission.mjs';
async function run(){
 const [mode,file,out]=process.argv.slice(2);
 if(!['proof','mainnet-policy-preview'].includes(mode)||!file||!out)
  throw Error('STAGE137_USAGE_NODE_SCRIPT_PROOF_OR_POLICY_INPUT_JSON_OUTPUT_JSON');
 if(file===out)throw Error('STAGE137_REFUSE_REPLACING_EVIDENCE_INPUT');
 const input=JSON.parse(await readFile(file,'utf8'));
 const result=mode==='proof'?stage137CheckOutcomeProof(input):
  stage138MainnetSpendingAdmission(input);
 await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode:result.mode,
  verifiedCanonicalMainnetInclusion:result.verifiedCanonicalMainnetInclusion??false,
  mayBroadcastMainnet:result.mayBroadcastMainnet??false,
  issueCount:result.issues?.length??0,
 }));
}
run().catch(e=>{console.error(/^STAGE13[78]_/.test(e.message)?e.message:'STAGE137_INPUT_REJECTED');process.exitCode=1;});
