import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const exec=promisify(execFile);
test('Stage147 historical-local multi-tx clock is slower only after source reconstruction, never rewinds',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'arbivane-147-clock-'));
 try{
  const shared=join(dir,'clock.so'),probe=join(dir,'probe.c'),binary=join(dir,'probe');
  await exec('cc',['-std=c11','-O2','-Wall','-Wextra','-Werror','-shared','-fPIC',
   resolve('scripts/stage118-replay-clock.c'),'-o',shared]);
  await writeFile(probe,`#define _GNU_SOURCE
#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdlib.h>
#include <stdio.h>
static long long ns(struct timespec x){return x.tv_sec*1000000000LL+x.tv_nsec;}
static long long clock_ns(void){struct timespec t;clock_gettime(CLOCK_REALTIME,&t);return ns(t);}
static void pause_200ms(void){struct timespec p={0,200000000};nanosleep(&p,0);}
static void change(char x){const char *p=getenv("ARBIVANE_REPLAY_PHASE_FILE");int fd=open(p,O_WRONLY);write(fd,&x,1);close(fd);}
int main(void){
 long long a=clock_ns();pause_200ms();long long b=clock_ns();
 change('2');long long c=clock_ns();pause_200ms();long long d=clock_ns();
 change('0');pause_200ms();long long e=clock_ns();
 printf("%lld %lld %lld %lld %lld\\n",a,b,c,d,e);
 return 0;
}`);
  await exec('cc',[probe,'-o',binary]);
  const phase=join(dir,'phase');await writeFile(phase,'0');
  const {stdout}=await exec(binary,[],{env:{...process.env,
   LD_PRELOAD:shared,
   ARBIVANE_REPLAY_START_NS:'1793015012000000000',
   ARBIVANE_REPLAY_PHASE_FILE:phase},timeout:15000});
  const [a,b,c,d,e]=stdout.trim().split(/\s+/).map(BigInt);
  assert.equal(a,1793015012000000000n);
  assert.ok(b>a&&b-a>=1000000n&&b-a<30000000n,
   'Reconstruction should advance at 1/100 real speed');
  assert.ok(c>=b&&d>c&&d-c>=5000000n&&d-c<50000000n,
   'Special sandbox-only stage should run at 1/20 real speed');
  assert.ok(e>d&&e-d>=180000000n,
   'After transition the clock must not rewind when phase is changed back');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Stage147 is explicitly isolated to original Sandbox runner and recorded as non-mainnet timing evidence',async()=>{
 const [historical,runner,workflow]=await Promise.all([
  readFile('scripts/stage115-historical-sandbox-clock.mjs','utf8'),
  readFile('scripts/stage146-real-funded-workspaces-runner.mjs','utf8'),
  readFile('.github/workflows/rhea-stage146-genuine-partner-sandbox.yml','utf8')
 ]);
 assert.match(historical,/STAGE147_REALTIME_OR_MAINNET_TIME_COMPRESSION_FORBIDDEN/);
 assert.match(historical,/env\.STAGE146_ALLOW_LOCAL_NEAR_LOAN/);
 assert.match(historical,/env\.STAGE147_LOCAL_CLOCK_COMPRESSION/);
 assert.match(historical,/timingPerformanceOnRealMainnetNotProven/);
 assert.match(runner,/localPartnerTimeCompression:e\.STAGE147_LOCAL_CLOCK_COMPRESSION/);
 assert.match(workflow,/STAGE147_LOCAL_CLOCK_COMPRESSION: 'true'/);
 assert.match(workflow,/NEAR_WORKSPACES_NETWORK: sandbox/);
 assert.match(workflow,/EXECUTION_ENABLED: 'false'/);
});
