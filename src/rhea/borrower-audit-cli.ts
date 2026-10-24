import {NearReadOnlyRpc} from './rpc.ts';
import {auditRheaBorrowers} from './borrower-audit.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet')throw Error('must explicitly run READ ONLY mainnet: EXECUTION_ENABLED=false');
if(!e.NEAR_RPC_URL||!e.RHEA_LENDING_CONTRACT||!e.RHEA_ORACLE_CONTRACT)throw Error('missing explicit read-only configuration');
const report=await auditRheaBorrowers(new NearReadOnlyRpc(e.NEAR_RPC_URL),{
 lendingContract:e.RHEA_LENDING_CONTRACT,oracleContract:e.RHEA_ORACLE_CONTRACT,
 expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
 expectedOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 maxAccounts:e.RHEA_AUDIT_MAX_ACCOUNTS?Number(e.RHEA_AUDIT_MAX_ACCOUNTS):25,
 pageSize:e.RHEA_AUDIT_PAGE_SIZE?Number(e.RHEA_AUDIT_PAGE_SIZE):10,
});
console.log(JSON.stringify(report,null,2));
// This is not a pass/fail trading gate. The result is always unapproved.
if(report.accountsWithMissingPriceDebt>0||report.accountsWithMissingPriceCollateral>0)proc.exitCode=2;
