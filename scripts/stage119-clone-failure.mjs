import {NearRpcHttpError} from '../src/rhea/rpc.ts';
export function cloneFailure(error,env=process.env){
 const redact=value=>{
  let s=String(value??'');
  for(const [key,v] of Object.entries(env))
   if(/SECRET|TOKEN|KEY|PASSWORD|URL/.test(key)&&typeof v==='string'&&v.length>6)
    s=s.replaceAll(v,'[REDACTED]');
  return s.replace(/https?:\/\/[^\s"']+/g,'[RPC_URL]').slice(0,1500);
 };
 const message=error instanceof Error?error.message:'';
 let code=/^(STAGE[0-9]{1,3}|SANDBOX|LOCAL_SANDBOX|NEAR_WORKSPACES)_[A-Z0-9_]{1,115}$/.test(message)?message:
  error instanceof NearRpcHttpError?'STAGE119_CLONE_SOURCE_HTTP_'+message.match(/\d{3}/)?.[0]:
  /rate limits exceeded|too many requests|"code"\s*:\s*-429\b/i.test(message)?
   'STAGE119_CLONE_SOURCE_SDK_RPC_RATE_LIMIT':
  /AbortError|TimeoutError/.test(error?.name??'')?'STAGE119_CLONE_SOURCE_TIMEOUT':
  /fetch failed|ECONNRESET|ETIMEDOUT|network request failed/i.test(message)?'STAGE119_CLONE_SOURCE_NETWORK_FAILED':
  error instanceof TypeError?'STAGE119_CLONE_RUNTIME_TYPE_ERROR':'STAGE119_CLONE_SDK_OR_RUNTIME_FAILED';
 return {code,errorName:redact(error?.name??'UNKNOWN'),message:redact(message),
  cause:error?.cause?{name:redact(error.cause.name),code:redact(error.cause.code),
   message:redact(error.cause.message)}:null};
}
