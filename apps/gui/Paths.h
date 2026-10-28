#pragma once
#include <QString>
#include <QFileInfo>
#include <QDir>
#include <sys/stat.h>
#include <unistd.h>
#include <cerrno>
#include <fcntl.h>
#include <vector>
namespace PrivatePaths {
// File fsync before rename does not persist the renamed entry or newly-created
// directory ancestry. Keep every opened ancestor anchored and refuse symlinks.
inline bool persistDirectory(const QString &path){
 if(!QDir::isAbsolutePath(path)||path.contains(QChar(0)))return false;
 int root=::open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(root<0)return false;
 std::vector<int> opened{root};bool ok=true;
 for(const auto&part:QDir::cleanPath(path).split('/',Qt::SkipEmptyParts)){
  int next=::openat(opened.back(),part.toUtf8().constData(),O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
  if(next<0){ok=false;break;}opened.push_back(next);struct stat s{};
  if(::fstat(next,&s)<0||!S_ISDIR(s.st_mode)||(s.st_uid!=0&&s.st_uid!=geteuid())){ok=false;break;}
 }
 if(ok)for(auto it=opened.rbegin();it!=opened.rend();++it)if(::fsync(*it)<0){ok=false;break;}
 for(int fd:opened)::close(fd);return ok;
}
inline bool directory(const QString &path,bool create=false,bool leaf=true){
 if(!QDir::isAbsolutePath(path)||path.contains(QChar(0)))return false;
 auto clean=QDir::cleanPath(path);auto parent=QFileInfo(clean).absolutePath();
 if(parent!=clean&&!directory(parent,create,false))return false;
 struct stat s{};if(lstat(clean.toUtf8().constData(),&s)<0){if(errno!=ENOENT)return false;if(!create)return true;if(mkdir(clean.toUtf8().constData(),0700)<0&&errno!=EEXIST)return false;if(lstat(clean.toUtf8().constData(),&s)<0||!persistDirectory(parent))return false;}
 if(!S_ISDIR(s.st_mode)||(s.st_uid!=geteuid()&&s.st_uid!=0))return false;
 return !leaf||(s.st_uid==geteuid()&&(s.st_mode&0777)==0700);
}
inline bool file(const QString &path){
 if(!QDir::isAbsolutePath(path)||path.contains(QChar(0))||!directory(QFileInfo(path).absolutePath(),false))return false;
 struct stat s{};if(lstat(path.toUtf8().constData(),&s)<0)return errno==ENOENT;
 return S_ISREG(s.st_mode)&&s.st_uid==geteuid()&&(s.st_mode&0077)==0;
}
}
