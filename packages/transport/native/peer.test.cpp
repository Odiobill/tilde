#include "peer.h"
#include <sys/socket.h>
#include <unistd.h>
#include <fcntl.h>
#include <iostream>
#include <stdexcept>
void require(bool okay,const char *name){if(!okay)throw std::runtime_error(name);}
int main(){
 try {
  int pair[2];require(socketpair(AF_UNIX,SOCK_STREAM,0,pair)==0,"socketpair");
  tilde::OwnedFd first(pair[0]),second(pair[1]);tilde::Peer peer{};
  require(tilde::authenticate(first,geteuid(),peer),"same UID accepted");require(peer.pid==getpid()&&peer.uid==geteuid(),"actual credentials delivered");
  require(!tilde::authenticate(second,geteuid()+1,peer),"other UID rejected");require(second.get()==-1,"rejected fd closed");
  int other=open("/dev/null",O_RDONLY);require(other>=0,"unrelated descriptor opened");second.close();require(fcntl(other,F_GETFD)>=0,"idempotent close preserves reused fd");
  tilde::OwnedFd invalid(open("/dev/null",O_RDONLY));require(!tilde::authenticate(invalid,geteuid(),peer),"getsockopt failure rejected");require(invalid.get()==-1,"failure descriptor closed");
  require(fcntl(other,F_GETFD)>=0,"getsockopt failure preserves unrelated descriptor");close(other);
  first.close();first.close();require(first.get()==-1,"accepted fd idempotently closed");
  std::cout<<"7 peer credential/ownership assertions pass\n";
 }catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
}
