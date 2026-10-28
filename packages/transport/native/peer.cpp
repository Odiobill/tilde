#include "peer.h"
#include <unistd.h>
#include <sys/socket.h>
namespace tilde {
OwnedFd::~OwnedFd(){close();}
void OwnedFd::close(){if(value_>=0){int fd=value_;value_=-1;::close(fd);}}
bool authenticate(OwnedFd &fd,uid_t allowed,Peer &peer){
 struct ucred credentials{};socklen_t length=sizeof(credentials);
 if(fd.get()<0||getsockopt(fd.get(),SOL_SOCKET,SO_PEERCRED,&credentials,&length)!=0||length!=sizeof(credentials)||credentials.uid!=allowed){fd.close();return false;}
 peer={credentials.uid,credentials.pid,credentials.gid};return true;
}
}
