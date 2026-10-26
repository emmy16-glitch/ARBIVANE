#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import {stage140InspectNativeAccounts,STAGE140_WATCH_ACCOUNTS} from './stage140-native-flash-provider-discovery.mjs';
const output=process.argv[2]??'stage140-native-provider-discovery.json';
if(!/^[a-zA-Z0-9_.-]{1,90}\.json$/.test(output)){
 console.error('STAGE140_INVALID_OUTPUT_NAME');process.exit(2);
}
try{
 const report=await stage140InspectNativeAccounts({
  rpcUrl:process.env.NEAR_RPC_URL||'https://rpc.mainnet.near.org',
  accounts:STAGE140_WATCH_ACCOUNTS
 });
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({
  status:report.hasVerifiedUncollateralizedLiNEARProvider?'VERIFIED':'NO_VERIFIED_NEAR_FLASH_PROVIDER',
  watchedAccounts:report.results.map(x=>({accountId:x.accountId,
   status:x.status,flashMethodNames:x.exportedFlashCandidates,
   codeHash:x.verifiedDeployedCodeHash})),
  mainnetSigning:report.maySignMainnet
 },null,2));
}catch(e){console.error(/^STAGE140_/.test(e?.message)?e.message:'STAGE140_READONLY_DISCOVERY_FAILED');process.exitCode=1;}
