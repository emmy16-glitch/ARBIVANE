import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Stage129 replays full authentic Rhea Borrow Liquidate Repay Withdraw atomically',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const builder=await readFile(new URL('../src/rhea/stage37-sandbox-liquidation.ts',import.meta.url),'utf8');
 const settlement=await readFile(new URL('../src/rhea/stage41-sandbox-settlement.ts',import.meta.url),'utf8');
 assert.match(runner,/actor\.callRaw\(lending,plan\.method,\{actions:plan\.actions\}/);
 assert.doesNotMatch(runner,/actions:plan\.actions\.slice\(1\)/);
 assert.doesNotMatch(runner,/prefundStage124RheaSupply\(/);
 assert.doesNotMatch(runner,/prefinancing:supplyPrefund/);
 assert.match(builder,/in_assets:\[\{token_id:e\.repay\.tokenId,max_amount:repay\}\]/);
 assert.match(builder,/Withdraw:\{token_id:e\.seize\.tokenId,max_amount:/);
 assert.match(settlement,/actorDebtBefore>0n&&!financed/);
 assert.match(settlement,/actorDebtAfter>0n\?'BLOCKED_ACTOR_HAS_LIABILITY'/);
 assert.match(runner,/attestStage48FinalizedSandboxReplay\(/);
 assert.match(runner,/attestStage41SandboxSettlement\(/);
 assert.match(runner,/sandboxBorrower/);
});
