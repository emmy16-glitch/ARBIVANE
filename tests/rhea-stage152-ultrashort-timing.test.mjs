import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const exec=promisify(execFile);

test('Stage152 compiled native clock moves monotonically at 0.001x in local phase three',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'stage152-clock-'));
 try{
  const shared=join(dir,'clock.so'),probe=join(dir,'probe.c'),exe=join(dir,'probe');
  await exec('cc',['-std=c11','-O2','-Wall','-Wextra','-Werror',
   '-shared','-fPIC',resolve('scripts/stage118-replay-clock.c'),'-o',shared]);
  await writeFile(probe,`#define _GNU_SOURCE
#include <time.h>
#include <stdio.h>
static long long ns(void){struct timespec t;clock_gettime(CLOCK_REALTIME,&t);return t.tv_sec*1000000000LL+t.tv_nsec;}
int main(void){long long a=ns();struct timespec dt={0,350000000};nanosleep(&dt,0);long long b=ns();printf("%lld %lld\\n",a,b);}
`);
  await exec('cc',[probe,'-o',exe]);
  const phase=join(dir,'phase');await writeFile(phase,'3');
  const {stdout}=await exec(exe,[],{env:{...process.env,LD_PRELOAD:shared,
   ARBIVANE_REPLAY_START_NS:'1793015012000000000',
   ARBIVANE_REPLAY_PHASE_FILE:phase},timeout:15000});
  const [a,b]=stdout.trim().split(' ').map(BigInt);
  assert.equal(a,1793015012000000000n);
  assert.ok(b>a&&b-a>=250000n&&b-a<=1500000n,
   'Expected about 0.35 ms virtual for 350 ms real, not real or Stage147 timing');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Stage152 cannot be turned on for mainnet or without all four explicit local gates',async()=>{
 const historical=await readFile('scripts/stage115-historical-sandbox-clock.mjs','utf8');
 const runner=await readFile('scripts/stage146-real-funded-workspaces-runner.mjs','utf8');
 const c=await readFile('scripts/stage118-replay-clock.c','utf8');
 const wf=await readFile('.github/workflows/rhea-stage152-100-ultrashort-sandbox.yml','utf8');
 for(const key of ['STAGE152_ULTRA_SHORT_LOCAL_CLOCK','STAGE150_LARGE_SANDBOX',
  'STAGE150_LARGE_SANDBOX_TOKENS','STAGE146_ALLOW_LOCAL_NEAR_LOAN',
  'NEAR_WORKSPACES_NETWORK','EXECUTION_ENABLED'])
   assert.ok(historical.includes(key),'Missing timing restriction '+key);
 assert.ok(historical.includes('STAGE152_ARTIFICIAL_LOCAL_CLOCK_NOT_AUTHORIZED'));
 assert.match(runner,/ultraShortLocalFinancingWindow:e.STAGE152_ULTRA_SHORT_LOCAL_CLOCK/);
 assert.match(runner,/syntheticTimeMayUnderstateBorrowInterest/);
 assert.match(c,/phase=='3'\?\(now-transition\)\/1000/);
 assert.match(wf,/STAGE152_ULTRA_SHORT_LOCAL_CLOCK: 'true'/);
 assert.match(wf,/STAGE150_LARGE_SANDBOX_TOKENS: '100'/);
 assert.match(wf,/realisticEconomicsAndMainnetViabilityVerified == false/);
 assert.match(wf,/mainnetExecutionEnabled == false/);
});
