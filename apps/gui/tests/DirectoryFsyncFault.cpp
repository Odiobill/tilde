// Test-only: fail durability of directories under one owned temporary fixture.
#include <cstdlib>
#include <cstring>
#include <cerrno>
#include <cstdio>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>
extern "C" int fsync(int fd){
 const auto root=std::getenv("TILDE_TEST_FSYNC_ROOT");struct stat st{};
 if(root&&*root&&::fstat(fd,&st)==0&&(S_ISDIR(st.st_mode)||(std::getenv("TILDE_TEST_FSYNC_FILE")&&S_ISREG(st.st_mode)))){
  char link[64],path[4096];std::snprintf(link,sizeof link,"/proc/self/fd/%d",fd);const auto n=::readlink(link,path,sizeof path-1);
  if(n>=0){path[n]=0;const auto size=std::strlen(root);if(std::strncmp(path,root,size)==0&&(path[size]==0||path[size]=='/')){errno=EIO;return -1;}}
 }
 return int(::syscall(SYS_fsync,fd));
}
