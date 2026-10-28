#include <QCoreApplication>
#include <QSocketNotifier>
#include <QTimer>
#include <QJsonDocument>
#include <QFile>
#include <fcntl.h>
#include <unistd.h>
#include <cerrno>
#include "NotificationBridge.h"
int main(int argc,char**argv){QCoreApplication app(argc,argv);NotificationBridge bridge(QDBusConnection::sessionBus());QFile output;if(!output.open(stdout,QIODevice::WriteOnly))return 2;QObject::connect(&bridge,&NotificationBridge::frame,&app,[&](const QJsonObject&f){if(!NotificationBridge::validOutput(f)){app.exit(2);return;}const auto line=QJsonDocument(f).toJson(QJsonDocument::Compact)+"\n";if(output.write(line)!=line.size()||!output.flush())app.exit(2);});
 if(fcntl(STDIN_FILENO,F_SETFL,fcntl(STDIN_FILENO,F_GETFL)|O_NONBLOCK)<0)return 2;QByteArray incoming;QSocketNotifier input(STDIN_FILENO,QSocketNotifier::Read);bool closing=false;
 auto close=[&](int code){if(closing)return;closing=true;input.setEnabled(false);bridge.close();QTimer::singleShot(code?0:200,&app,[&,code]{app.exit(code);});};
 QObject::connect(&input,&QSocketNotifier::activated,&app,[&]{char buf[1024];for(;;){const auto n=::read(STDIN_FILENO,buf,sizeof(buf));if(n<0){if(errno!=EAGAIN&&errno!=EWOULDBLOCK&&errno!=EINTR)close(2);return;}if(!n){close(incoming.isEmpty()?0:2);return;}for(int i=0;i<n;++i){if(buf[i]=='\n'){if(!bridge.acceptLine(incoming)){close(2);return;}incoming.clear();}else{incoming.append(buf[i]);if(incoming.size()>4096){close(2);return;}}}}});bridge.start();return app.exec();}
