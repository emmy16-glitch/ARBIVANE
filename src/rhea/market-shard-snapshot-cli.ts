import {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools} from './deployed-share-parity.ts';
const env=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process.env;
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)throw Error('READ_ONLY_MAINNET_REQUIRED');
 const c=env.RHEA_LENDING_CONTRACT??'',rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL);
 const acc=await rpc.viewAccount(c),height=Number(acc.blockHeight);
 const [count,assets]=await Promise.all([rpc.view<unknown>(c,'get_num_accounts',{},height),rpc.view<unknown>(c,'get_assets_paged',{},height)]);
 if(count.blockHeight!==String(height)||assets.blockHeight!==String(height)||!Number.isSafeInteger(count.value)||typeof count.value!=='number'||count.value<1||count.value>250_000)throw Error('INVALID_MARKET_SNAPSHOT');
 const positive=[...parseParityPools(assets.value).values()].some(p=>p.borrowed.shares>0n||p.borrowed.balance>0n);
 console.log(JSON.stringify({mode:'NEAR_SHARD_SNAPSHOT',blockHeight:String(height),lendingCodeHash:acc.codeHash,totalAccounts:count.value,borrowedPoolBalancePositive:positive,executionEnabled:false}));
})().catch(err=>{console.error(JSON.stringify({status:'SHARD_PREFLIGHT_ERROR',reason:err instanceof Error?err.message:'UNKNOWN'}));(globalThis as typeof globalThis & {process:{exitCode:number}}).process.exitCode=2;});
