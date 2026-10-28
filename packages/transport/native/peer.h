#pragma once
#include <sys/types.h>
namespace tilde {
struct Peer { uid_t uid; pid_t pid; gid_t gid; };
class OwnedFd {
 int value_;
public:
 explicit OwnedFd(int value=-1):value_(value){}
 ~OwnedFd();
 OwnedFd(const OwnedFd&)=delete;
 OwnedFd& operator=(const OwnedFd&)=delete;
 int get()const{return value_;}
 void close();
};
bool authenticate(OwnedFd &fd,uid_t allowed,Peer &peer);
}
