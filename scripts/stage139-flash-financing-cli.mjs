import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stage139AuditHistoricalCollateral,stage139ReviewFlashLiquidity} from './stage139-flash-liquidity-admission.mjs';
const dump=async file=>JSON.parse(await readFile(file,'utf8'));
export async function stage139AuditOriginalStage93Bundle(inputDirectory,outputDirectory){
 if(resolve(inputDirectory)===resolve(outputDirectory))
  throw Error('STAGE139_REFUSE_REPLACING_ORIGINAL_EVIDENCE');
 const [funding,settlement,proposal]=await Promise.all([
  dump(join(inputDirectory,'stage49-sandbox-funding.json')),
  dump(join(inputDirectory,'stage41-sandbox-balance-settlement.json')),
  dump(join(inputDirectory,'stage38-positive-stage35-evidence.json'))]);
 const proof=stage139AuditHistoricalCollateral(funding,settlement,proposal);
 await mkdir(outputDirectory,{recursive:true});
 await writeFile(join(outputDirectory,'stage139-original-capital-classification.json'),
  JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
 return proof;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const [mode,src,out]=process.argv.slice(2);
 (async()=>{
  if(!src||!out||!['original-stage93','flash-research'].includes(mode))
   throw Error('STAGE139_USAGE_ORIGINAL_STAGE93_OR_FLASH_RESEARCH_INPUT_OUTPUT');
  if(mode==='original-stage93'){
   const proof=await stage139AuditOriginalStage93Bundle(src,out);
   console.log(JSON.stringify({mode:proof.mode,financingClass:proof.financingClass,
    collateralYocto:proof.observedDepositedNativeSandboxYocto,
    flashLoanDemonstrated:proof.noCollateralFlashLoanDemonstrated}));
  }else{
   if(resolve(src)===resolve(out))throw Error('STAGE139_REFUSE_REPLACING_INPUT');
   const review=stage139ReviewFlashLiquidity(await dump(src));
   await writeFile(out,JSON.stringify(review,null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({status:review.status,blockers:review.blockers.length,
    maySignMainnet:review.maySignMainnet}));
  }
 })().catch(e=>{console.error(/^STAGE139_/.test(e.message)?e.message:'STAGE139_INPUT_REJECTED');process.exitCode=1});
}
