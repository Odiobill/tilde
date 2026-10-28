#include "SingleInstance.h"
#include "IpcBridge.h"
#include "Paths.h"
#include <QLocalSocket>
#include <QJsonDocument>
#include "GuiState.h"
#include <QCryptographicHash>
#include <QFileInfo>
#include <QTimer>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <unistd.h>
#include <cstring>
namespace {
bool socketSafe(const QString &path,struct stat &s){return lstat(path.toUtf8().constData(),&s)==0&&S_ISSOCK(s.st_mode)&&s.st_uid==geteuid()&&(s.st_mode&0077)==0;}
}
SingleInstance::~SingleInstance(){server_.close();if(owner_>=0)::close(owner_);}
bool SingleInstance::validActivation(const QJsonObject&a){const auto intent=a.value("intent").toString();return a.value("v")==1&&(intent=="show"||intent=="settings"||intent=="conversation")&&a.size()==(intent=="conversation"?3:2)&&(intent!="conversation"||GuiState::validId(a.value("conversationId").toString()))&&QJsonDocument(a).toJson(QJsonDocument::Compact).size()<=4096;}
int SingleInstance::forward(const QString &path,const QJsonObject &payload){
 if(!validActivation(payload))return 3;
 if(!PrivatePaths::directory(QFileInfo(path).absolutePath()))return 3;
 struct stat s{};if(lstat(path.toUtf8().constData(),&s)<0)return errno==ENOENT?-1:3;
 if(!socketSafe(path,s))return 3;
 QLocalSocket peer;peer.connectToServer(path);if(!peer.waitForConnected(200))return peer.error()==QLocalSocket::ConnectionRefusedError?-1:3;
 if(!IpcBridge::peerAllowed(peer.socketDescriptor(),geteuid()))return 3;
 peer.write(QJsonDocument(payload).toJson(QJsonDocument::Compact)+"\n");if(!peer.waitForBytesWritten(1000))return 3;if(!peer.waitForReadyRead(2000))return 3;return peer.readAll()=="activated\n"?0:3;
}
bool SingleInstance::start(const QString &path){
 if(!PrivatePaths::directory(QFileInfo(path).absolutePath(),true))return false;
 owner_=socket(AF_UNIX,SOCK_STREAM|SOCK_CLOEXEC,0);if(owner_<0)return false;
 const auto name=QByteArray("tilde-gui-")+QCryptographicHash::hash(QFileInfo(path).absoluteFilePath().toUtf8(),QCryptographicHash::Sha256).toHex();sockaddr_un address{};address.sun_family=AF_UNIX;std::memcpy(address.sun_path+1,name.data(),size_t(name.size()));
 if(bind(owner_,reinterpret_cast<sockaddr*>(&address),socklen_t(offsetof(sockaddr_un,sun_path)+1+name.size()))<0)return false;
 struct stat old{};if(lstat(path.toUtf8().constData(),&old)==0){if(!socketSafe(path,old))return false;QLocalSocket probe;probe.connectToServer(path);if(probe.waitForConnected(200)||probe.error()!=QLocalSocket::ConnectionRefusedError)return false;struct stat now{};if(!socketSafe(path,now)||now.st_ino!=old.st_ino||now.st_dev!=old.st_dev)return false;if(unlink(path.toUtf8().constData())<0)return false;}
 else if(errno!=ENOENT)return false;
 server_.setSocketOptions(QLocalServer::UserAccessOption);if(!server_.listen(path))return false;path_=path;
 connect(&server_,&QLocalServer::newConnection,this,[this]{while(auto *peer=server_.nextPendingConnection()){
  if(!IpcBridge::peerAllowed(peer->socketDescriptor(),geteuid())){peer->abort();peer->deleteLater();continue;}
  auto *timer=new QTimer(peer);timer->setSingleShot(true);timer->start(1000);connect(timer,&QTimer::timeout,peer,[peer]{peer->abort();});
  connect(peer,&QLocalSocket::readyRead,this,[this,peer,timer]{if(peer->bytesAvailable()>4097){peer->abort();return;}if(!peer->canReadLine())return;auto command=peer->readLine();timer->stop();QJsonParseError error;const auto doc=QJsonDocument::fromJson(command,&error);if(error.error==QJsonParseError::NoError&&doc.isObject()&&validActivation(doc.object())){emit activated(doc.object());emit activate();peer->write("activated\n");peer->flush();}peer->disconnectFromServer();});
  connect(peer,&QLocalSocket::disconnected,peer,&QObject::deleteLater);
 }});return true;
}
