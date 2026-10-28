#include "AccessibilityPreferences.h"
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QUuid>
#include <QScopeGuard>
#include <sys/stat.h>
#include <sys/file.h>
#include <sys/syscall.h>
#include <linux/fs.h>
#include <fcntl.h>
#include <unistd.h>
#include <cerrno>
namespace {
struct Fd{int value=-1;explicit Fd(int value):value(value){}~Fd(){if(value>=0)::close(value);}Fd(const Fd&)=delete;};
int parentDirectory(const QString&path,struct stat&identity){
 if(!QDir::isAbsolutePath(path)||QDir::cleanPath(path)!=path||path.contains(QChar(0)))return -1;
 const auto parent=QFileInfo(path).absolutePath();int current=::open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(current<0)return -1;
 for(const auto&part:parent.split('/',Qt::SkipEmptyParts)){
  const auto bytes=part.toUtf8();int next=::openat(current,bytes.constData(),O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);::close(current);if(next<0)return -1;current=next;
  struct stat st{};if(::fstat(current,&st)<0||!S_ISDIR(st.st_mode)||(st.st_uid!=0&&st.st_uid!=geteuid())){::close(current);return -1;}
 }
 if(::fstat(current,&identity)<0||identity.st_uid!=geteuid()||(identity.st_mode&0777)!=0700){::close(current);return -1;}return current;
}
struct State{QByteArray raw;bool exists=false,value=false;};
QString readState(int directory,const QByteArray&name,State&state){
 Fd file(::openat(directory,name.constData(),O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC));
 if(file.value<0)return errno==ENOENT?QString():QString("PREFERENCE_UNSAFE");
 struct stat before{},after{},named{};
 if(::fstat(file.value,&before)<0||!S_ISREG(before.st_mode)||before.st_uid!=geteuid()||(before.st_mode&0777)!=0600||before.st_nlink!=1||before.st_size>4096)return "PREFERENCE_UNSAFE";
 char buffer[4097];for(;;){const auto n=::read(file.value,buffer,sizeof buffer);if(n<0){if(errno==EINTR)continue;return "PREFERENCE_READ_FAILED";}if(n==0)break;state.raw.append(buffer,int(n));if(state.raw.size()>4096)return "PREFERENCE_INVALID";}
 if(::fstat(file.value,&after)<0||::fstatat(directory,name.constData(),&named,AT_SYMLINK_NOFOLLOW)<0||named.st_dev!=before.st_dev||named.st_ino!=before.st_ino||after.st_size!=before.st_size||after.st_mtim.tv_sec!=before.st_mtim.tv_sec||after.st_mtim.tv_nsec!=before.st_mtim.tv_nsec||after.st_nlink!=1||after.st_uid!=geteuid()||(after.st_mode&0777)!=0600||!S_ISREG(named.st_mode))return "PREFERENCE_CONFLICT";
 QJsonParseError error;const auto doc=QJsonDocument::fromJson(state.raw,&error);if(error.error!=QJsonParseError::NoError||!doc.isObject())return "PREFERENCE_INVALID";
 const auto object=doc.object();if(object.size()!=2||object.value("version")!=1||!object.value("reducedMotion").isBool())return "PREFERENCE_INVALID";
 state.exists=true;state.value=object.value("reducedMotion").toBool();return {};
}
bool same(const State&a,bool existed,const QByteArray&raw){return a.exists==existed&&a.raw==raw;}
}
AccessibilityPreferences::AccessibilityPreferences(QString path,QObject*parent):QObject(parent),path_(std::move(path)){
 struct stat identity{};Fd directory(parentDirectory(path_,identity));if(directory.value<0){error_="PREFERENCE_UNSAFE";return;}device_=identity.st_dev;inode_=identity.st_ino;
 State state;error_=readState(directory.value,QFileInfo(path_).fileName().toUtf8(),state);if(!error_.isEmpty())return;accepted_=state.raw;existed_=state.exists;reduced_=state.value;
}
void AccessibilityPreferences::fail(const QString&code){if(error_!=code){error_=code;emit changed();}}
void AccessibilityPreferences::setReducedMotion(bool value){
 if(!error_.isEmpty()||value==reduced_)return;
 struct stat identity{};Fd directory(parentDirectory(path_,identity));if(directory.value<0||quint64(identity.st_dev)!=device_||quint64(identity.st_ino)!=inode_){fail("PREFERENCE_UNSAFE");return;}
 const auto name=QFileInfo(path_).fileName().toUtf8(),lockName=name+".lock";
 Fd lock(::openat(directory.value,lockName.constData(),O_RDWR|O_CREAT|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC,0600));struct stat lockStat{};
 if(lock.value<0||::fstat(lock.value,&lockStat)<0||!S_ISREG(lockStat.st_mode)||lockStat.st_uid!=geteuid()||(lockStat.st_mode&0777)!=0600||lockStat.st_nlink!=1){fail("PREFERENCE_UNSAFE");return;}
 if(::flock(lock.value,LOCK_EX|LOCK_NB)<0){fail("PREFERENCE_BUSY");return;}
 State current;auto error=readState(directory.value,name,current);if(!error.isEmpty()){fail(error);return;}if(!same(current,existed_,accepted_)){fail("PREFERENCE_CONFLICT");return;}
 const auto bytes=QJsonDocument(QJsonObject{{"version",1},{"reducedMotion",value}}).toJson(QJsonDocument::Compact)+"\n";
 const auto temporary=("."+QFileInfo(path_).fileName()+"-"+QUuid::createUuid().toString(QUuid::WithoutBraces)+".tmp").toUtf8();
 Fd stage(::openat(directory.value,temporary.constData(),O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600));if(stage.value<0){fail("PREFERENCE_SAVE_FAILED");return;}
 auto cleanup=qScopeGuard([&]{::unlinkat(directory.value,temporary.constData(),0);});
 qint64 offset=0;while(offset<bytes.size()){const auto n=::write(stage.value,bytes.constData()+offset,size_t(bytes.size()-offset));if(n<0&&errno==EINTR)continue;if(n<=0){fail("PREFERENCE_SAVE_FAILED");return;}offset+=n;}
 if(::fchmod(stage.value,0600)<0||::fsync(stage.value)<0){fail("PREFERENCE_SAVE_FAILED");return;}
 State latest;error=readState(directory.value,name,latest);if(!error.isEmpty()){fail(error);return;}if(!same(latest,existed_,accepted_)){fail("PREFERENCE_CONFLICT");return;}
 struct stat checked{};Fd namedParent(parentDirectory(path_,checked));if(namedParent.value<0||checked.st_dev!=identity.st_dev||checked.st_ino!=identity.st_ino){fail("PREFERENCE_UNSAFE");return;}
 const int renamed=existed_ ? ::renameat(directory.value,temporary.constData(),directory.value,name.constData()) : int(::syscall(SYS_renameat2,directory.value,temporary.constData(),directory.value,name.constData(),RENAME_NOREPLACE));
 if(renamed<0){fail(errno==EEXIST?"PREFERENCE_CONFLICT":"PREFERENCE_SAVE_FAILED");return;}
 if(::fsync(directory.value)<0){fail("PREFERENCE_SAVE_FAILED");return;}
 accepted_=bytes;existed_=true;reduced_=value;emit changed();
}
