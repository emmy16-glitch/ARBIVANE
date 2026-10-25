/** Stage47 — bounded, verifiable Stage42 borrower-window continuation.
 * All input is a completed read-only reconciliation report. A continuation
 * dispatch runs the same existing read-only mainnet + local Sandbox-only flow.
 * Stage59 extends finite continuation across verified full windows, including
 * after authentic source-positive Sandbox attempts recorded by Stage56.
 */
const MAX_FOLLOWUPS=23; // at most 24 verified 320-borrower windows per root run
const integer=(n,min,max)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
export function planStage47Continuation(report,{expectedBaseCursor,followupsRemaining}){
 if(!report||report.mode!=='RHEA_STAGE42_VERIFIED_BORROWER_WINDOW'||
  report.chain!=='NEAR_MAINNET'||
  !['WINDOW_RECONCILED_NO_BLOCKED_READS','WINDOW_RECONCILED_WITH_BLOCKED_READS'].includes(report.status)||
  report.everyHistoricalFindingVisited!==true||
  report.allCurrentHealthVerified!==false||
  report.liquidationEligibilityVerified!==false||
  report.positiveNetProfitVerified!==false||report.executionEnabled!==false||
  report.maySignMainnet!==false||report.mayBroadcastMainnet!==false||
  report.shardsReconciled!==4||report.accountsVisited!==320||
  !integer(report.baseCursor,0,10000000)||
  !integer(report.endCursor,0,10000000)||report.endCursor!==report.baseCursor+320||
  !integer(report.historicalSourceDebtAccounts,320,10000000)||
  report.endCursor>report.historicalSourceDebtAccounts||
  !integer(expectedBaseCursor,0,10000000)||
  report.baseCursor!==expectedBaseCursor||
  !integer(followupsRemaining,0,MAX_FOLLOWUPS)||
  !integer(report.paperAtRisk,0,320)||!integer(report.paperHealthy,0,320)||
  !integer(report.noDebtNow,0,320)||!integer(report.blockedInitialReads,0,320)||
  report.paperAtRisk+report.paperHealthy+report.noDebtNow+report.blockedInitialReads!==320||
  !integer(report.failedRiskRefreshes,0,320)||
  !integer(report.sourceReferencePlansForSandboxOnly,0,320)||
  !Array.isArray(report.blockers))
  throw Error('STAGE47_UNTRUSTED_OR_INCOMPLETE_RECONCILED_WINDOW');
 const next=report.endCursor;
 // Do not stop the remaining authentic borrower registry merely because an
 // earlier window had a source-positive plan. Stage42's discover job already
 // attempted the locally gated Stage56 Sandbox path and must have succeeded
 // or produced accepted failure evidence before reconciliation can run.
 // The finite window budget remains mandatory to bound total RPC work.
 const sourcePlansObserved=report.sourceReferencePlansForSandboxOnly>0;
 let reason='CONTINUE_VERIFIED_NEXT_HISTORICAL_WINDOW';
 if(next+320>report.historicalSourceDebtAccounts)
  reason='LESS_THAN_ONE_FULL_WINDOW_REMAINS';
 else if(followupsRemaining===0)
  reason='AUTOMATIC_CONTINUATION_BUDGET_EXHAUSTED';
 else if(sourcePlansObserved)
  reason='CONTINUE_AFTER_SOURCE_PLAN_SANDBOX_EVIDENCE';
 const dispatch=reason==='CONTINUE_VERIFIED_NEXT_HISTORICAL_WINDOW'||
  reason==='CONTINUE_AFTER_SOURCE_PLAN_SANDBOX_EVIDENCE';
 return {
  mode:'ARBIVANE_STAGE47_VERIFIED_MARKET_CONTINUATION',
  sourceChain:'NEAR_MAINNET_READ_ONLY',
  previousCursor:report.baseCursor,
  verifiedEndCursor:next,
  historicalDebtAccounts:report.historicalSourceDebtAccounts,
  blockedInitialReads:report.blockedInitialReads,
  blockedRiskRefreshes:report.failedRiskRefreshes,
  sourcePlansForSandboxOnly:report.sourceReferencePlansForSandboxOnly,
  continuesAfterSourcePlanEvidence:sourcePlansObserved,
  nextWindowFitsHistoricalRegistry:next+320<=report.historicalSourceDebtAccounts,
  remainingHistoricalFindings:report.historicalSourceDebtAccounts-next,
  fullWindowsRemaining:Math.floor((report.historicalSourceDebtAccounts-next)/320),
  tailFindingsBeyondFullWindows:(report.historicalSourceDebtAccounts-next)%320,
  dispatch,
  nextCursor:dispatch?next:null,
  followupsRemaining:dispatch?followupsRemaining-1:0,
  reason,
  mainnetExecutionEnabled:false,
  maySignMainnet:false,
  mayBroadcastMainnet:false,
  liquidationsExecutedByThisPlanner:0,
  positiveNetProfitVerified:false,
 };
}
