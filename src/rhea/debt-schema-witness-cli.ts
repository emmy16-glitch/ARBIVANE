import {NearReadOnlyRpc} from './rpc.ts';
import {inspectRheaBorrowerWitness} from './debt-schema-witness.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
(async()=>{
 const e=proc.env;
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||!e.NEAR_RPC_URL)throw Error('READ_ONLY_MAINNET_REQUIRED');
 const report=await inspectRheaBorrowerWitness(new NearReadOnlyRpc(e.NEAR_RPC_URL),{
  lendingContract:e.RHEA_LENDING_CONTRACT??'',sampleCount:Number(e.RHEA_WITNESS_ACCOUNTS??'24'),pageSize:4,pinnedBlockHeight:e.RHEA_WITNESS_PINNED_BLOCK?Number(e.RHEA_WITNESS_PINNED_BLOCK):undefined,
 });
 console.log(JSON.stringify(report,null,2));if(report.status!=='SAMPLE_COMPATIBLE_UNAPPROVED')proc.exitCode=2;
})().catch(err=>{console.error(JSON.stringify({mode:'RHEA_INDEPENDENT_BORROWER_SCHEMA_WITNESS',status:'PROBE_ERROR',reason:err instanceof Error?err.message:'UNKNOWN',executionEnabled:false}));proc.exitCode=2;});
