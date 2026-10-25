/** Resolve the next Stage43 retry window from the actual saved Stage42 aggregate.
 * Never infer a workflow_run's borrower range from a hardcoded default.
 * Stage43 independently recomputes this aggregate from all four source shards.
 */
import {planStage47Continuation} from './stage47-next-market-window.mjs';

const UINT=/^(0|[1-9][0-9]*)$/;
export function resolveStage43WindowCursor(report,manualCursor=null){
 if(manualCursor!==null &&
  (typeof manualCursor!=='string'||!UINT.test(manualCursor)||
   !Number.isSafeInteger(Number(manualCursor))))
  throw Error('STAGE47_BAD_MANUAL_STAGE43_CURSOR');
 const expected=report?.baseCursor;
 // Reuse the Stage47's complete-window invariant checks. Remaining followups
 // are deliberately set to zero: this helper never dispatches another scan.
 planStage47Continuation(report,{expectedBaseCursor:expected,followupsRemaining:0});
 if(manualCursor!==null&&Number(manualCursor)!==expected)
  throw Error('STAGE47_STAGE43_CURSOR_DISAGREES_WITH_AUTHENTIC_AGGREGATE');
 if(expected<12||expected+320>report.historicalSourceDebtAccounts)
  throw Error('STAGE47_STAGE43_CURSOR_OUT_OF_SOURCE_BOUNDS');
 return expected;
}
