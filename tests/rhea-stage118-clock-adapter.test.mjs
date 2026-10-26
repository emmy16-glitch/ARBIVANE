import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const exec=promisify(execFile);
test('native adapter advances wall time normally while leaving monotonic time on the kernel clock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'stage118-probe-'));
 try {
  const library=join(dir,'clock.so'),probe=join(dir,'probe.c'),binary=join(dir,'probe');
  await exec('cc',['-std=c11','-O2','-Wall','-Wextra','-Werror','-shared','-fPIC',
   resolve('scripts/stage118-replay-clock.c'),'-o',library]);
  await writeFile(probe,`#define _GNU_SOURCE
#include <time.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <stdio.h>
static long long ns(struct timespec t){return t.tv_sec*1000000000LL+t.tv_nsec;}
int main(void){
 struct timespec a,b,m,k,pause={0,100000000};
 clock_gettime(CLOCK_REALTIME,&a);
 clock_gettime(CLOCK_MONOTONIC,&m);
 syscall(SYS_clock_gettime,CLOCK_MONOTONIC,&k);
 nanosleep(&pause,0);
 clock_gettime(CLOCK_REALTIME,&b);
 printf("%lld %lld %lld\\n",ns(a),ns(b)-ns(a),ns(k)-ns(m));
 return 0;
}`);
  await exec('cc',[probe,'-o',binary]);
  const {stdout}=await exec(binary,[],{env:{...process.env,LD_PRELOAD:library,
   ARBIVANE_REPLAY_START_NS:'1793001268000000000'},timeout:10000});
  const [start,elapsed,monoDrift]=stdout.trim().split(' ').map(BigInt);
  assert.equal(start,1793001268000000000n);
  assert.ok(elapsed>=100000000n&&elapsed<3000000000n);
  assert.ok(monoDrift>=0n&&monoDrift<10000000n);
 } finally {await rm(dir,{recursive:true,force:true});}
});
