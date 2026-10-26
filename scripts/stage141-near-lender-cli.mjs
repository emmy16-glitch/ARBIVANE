#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import {stage141Survey} from './stage141-near-lender-qualification.mjs';
const filename=process.argv[2]??'stage141-native-loan-qualification.json';
if(!/^[A-Za-z0-9_.-]{1,100}\.json$/.test(filename)){
 console.error('STAGE141_INVALID_OUTPUT_FILENAME');process.exit(2);
}
try{
 const report=await stage141Survey({rpcUrl:process.env.NEAR_RPC_URL??'https://rpc.mainnet.near.org'});
 const authenticated=report.candidates.filter(x=>x.deployedWasmHashVerified).length;
 // Do not create a reassuring artifact if everything failed to verify.
 if(authenticated<2)throw Error('STAGE141_INSUFFICIENT_AUTHENTIC_ONCHAIN_CODE_ATTESTATIONS');
 await writeFile(filename,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({
  status:report.fundingStatus,authenticated,
  tokenMetadataVerified:report.loanTokenMetadataVerified,
  candidates:report.candidates.map(x=>({
   accountId:x.accountId,status:x.status,codeHash:x.verifiedDeployedCodeHash,
   flashNames:x.observedFlashNamedExports,
   heldLinearAtomic:x.observedContractHeldLinearAtomic,
   borrowable:x.observedBalanceIsBorrowableLiquidity
  })),
  maySignMainnet:report.maySignMainnet
 },null,2));
}catch(e){
 console.error(/^STAGE141_/.test(e?.message)?e.message:'STAGE141_LIVE_DISCOVERY_FAILED');
 process.exitCode=1;
}
