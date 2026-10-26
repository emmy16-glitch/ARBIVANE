// Linux-only disposable Sandbox wall clock. No allocator, dlsym, locks, file
// timestamps or process-wide OS clock changes. Jemalloc may call this before
// ELF constructors, so initialization must remain allocation-free and atomic.
#define _GNU_SOURCE
#include <stdint.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <time.h>
#include <sys/time.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <fcntl.h>

static _Atomic uint64_t origin_ns;
static _Atomic uint64_t execution_ns;
static int reconstructing(void) {
 const char *path=getenv("ARBIVANE_REPLAY_PHASE_FILE");
 if(!path || !*path)return 0;
 // No stdio/allocator/dlsym in jemalloc's initialization path. A missing or
 // unreadable control defaults to normal speed, never a freshness bypass.
 int fd=(int)syscall(SYS_openat,AT_FDCWD,path,O_RDONLY|O_CLOEXEC,0);
 if(fd<0)return 0;
 char phase='1';
 long count=syscall(SYS_read,fd,&phase,1);
 syscall(SYS_close,fd);
 return count==1 && phase=='0';
}
static uint64_t ns(const struct timespec *t) {
 return (uint64_t)t->tv_sec*1000000000ULL+(uint64_t)t->tv_nsec;
}
int clock_gettime(clockid_t id, struct timespec *out) {
 if(id!=CLOCK_REALTIME && id!=CLOCK_REALTIME_COARSE)
  return (int)syscall(SYS_clock_gettime,id,out);
 const char *s=getenv("ARBIVANE_REPLAY_START_NS");
 if(!s || !*s)return (int)syscall(SYS_clock_gettime,id,out);
 uint64_t anchor=0;
 for(unsigned i=0;s[i];i++) {
  if(i>=19 || s[i]<'0' || s[i]>'9')return (int)syscall(SYS_clock_gettime,id,out);
  anchor=anchor*10+(uint64_t)(s[i]-'0');
 }
 struct timespec mono;
 if(syscall(SYS_clock_gettime,CLOCK_MONOTONIC,&mono))return -1;
 uint64_t now=ns(&mono),expected=0;
 atomic_compare_exchange_strong(&origin_ns,&expected,now);
 uint64_t origin=atomic_load(&origin_ns);
 int staging=reconstructing();
 uint64_t transition=atomic_load(&execution_ns);
 if(!staging && !transition){
  expected=0;
  atomic_compare_exchange_strong(&execution_ns,&expected,now);
  transition=atomic_load(&execution_ns);
 }
 // Reconstruction is not elapsed market time. The chain still advances
 // monotonically at 1/100 speed while authentic state is copied. Once the
 // execution phase starts it can never return to reconstruction or rewind.
 uint64_t elapsed;
 if(transition)elapsed=(transition>=origin?(transition-origin)/100:0)+
  (now>=transition?now-transition:0);
 else elapsed=(now>=origin?now-origin:0)/100;
 uint64_t result=anchor+elapsed;
 out->tv_sec=(time_t)(result/1000000000ULL);
 out->tv_nsec=(long)(result%1000000000ULL);
 return 0;
}
int gettimeofday(struct timeval *out, void *zone) {
 (void)zone;
 struct timespec t;
 if(clock_gettime(CLOCK_REALTIME,&t))return -1;
 out->tv_sec=t.tv_sec;out->tv_usec=t.tv_nsec/1000;
 return 0;
}
time_t time(time_t *out) {
 struct timespec t;
 if(clock_gettime(CLOCK_REALTIME,&t))return (time_t)-1;
 if(out)*out=t.tv_sec;
 return t.tv_sec;
}
