import {NearReadOnlyRpc} from './rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import {inspectActivePythValuation} from './execution-pyth-valuation.ts';
import {sizeStage35SourceLiquidation} from './stage35-atomic-reference-sizing.ts';
import {classifyStage33Failure} from './stage33-diagnostics.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
(async()=>{
 const e=proc.env;
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||!e.NEAR_RPC_URL||
  e.RHEA_BORROWER_ACCOUNT_ID!=='godlike.near')throw Error('STAGE35_PINNED_MAINNET_READ_ONLY_REQUIRED');
 const rpc=new ResilientNearReadOnlyRpc(new NearReadOnlyRpc(e.NEAR_RPC_URL),{
  maxRetries:2,initialDelayMs:350,maxDelayMs:5000,maxCachedPinnedViews:256,
 });
 const contract=e.RHEA_LENDING_CONTRACT??'';
 const tip=await rpc.viewAccount(contract);
 if(tip.codeHash!==(e.RHEA_EXPECTED_LENDING_CODE_HASH??'')||
  !/^[1-9][0-9]{0,15}$/.test(tip.blockHeight))
  throw Error('STAGE35_UNVERIFIED_LENDING_CODE');
 const height=Number(tip.blockHeight);
 const [report,assets]=await Promise.all([
  inspectActivePythValuation(rpc,{
   lendingContract:contract,pythOracle:e.RHEA_ORACLE_CONTRACT??'',
   borrowerAccountId:'godlike.near',expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
   expectedPythOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
   pinnedBlockHeight:height,nowMs:Date.now(),
   maxConfidenceBps:150,sanityMaxUsd:'10000000',maxConcurrency:3,
  }),
  rpc.view<unknown>(contract,'get_assets_paged',{},height),
 ]);
 if(report.blockHeight!==tip.blockHeight||assets.blockHeight!==tip.blockHeight)
  throw Error('STAGE35_CROSS_BLOCK_DATA');
 const out=sizeStage35SourceLiquidation(report,assets.value,{
  borrowerAccountId:'godlike.near',maxRepayBps:100,
  minimumPaperGrossUsdE27:'1000000000000000000000000',
 });
 console.log(JSON.stringify({...out,rpcStatistics:rpc.getStats()},null,2));
})().catch(err=>{
 console.log(JSON.stringify({mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
  chain:'NEAR_MAINNET',status:'BLOCKED_READONLY_OBSERVATION_ERROR',
  borrowerAccountId:'godlike.near',
  reasonCode:classifyStage33Failure(err),
  contractRouteParityVerified:false,rawTokenDenominationsVerified:false,
  sandboxStateReplaySucceeded:false,gasAndSwapNetProfitVerified:false,
  walletCapitalVerified:false,mainnetWalletApproved:false,
  executionEnabled:false,maySign:false,mayBroadcast:false},null,2));
});
