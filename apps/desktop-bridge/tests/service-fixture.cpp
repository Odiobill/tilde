#include <QCoreApplication>
#include <QDBusConnection>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QSocketNotifier>
#include <QFile>
#include <QSet>
#include <unistd.h>
class ServiceFixture:public QObject{
 Q_OBJECT
 Q_CLASSINFO("D-Bus Interface","org.freedesktop.Notifications")
 uint next_=40;QSet<uint> owned_;
public:static void frame(const QJsonObject&o){const auto b=QJsonDocument(o).toJson(QJsonDocument::Compact)+"\n";if(b.size()>4096){QCoreApplication::exit(2);return;}::write(STDOUT_FILENO,b.data(),b.size());}
 void open(uint id){if(owned_.contains(id))emit ActionInvoked(id,"open");}
public slots:
 QStringList GetCapabilities(){return{"actions"};}
 uint Notify(const QString&app,uint replaces,const QString&,const QString&title,const QString&body,const QStringList&actions,const QVariantMap&,int){const auto id=++next_;owned_.insert(id);frame({{"event","notice"},{"id",int(id)},{"app",app},{"replaces",int(replaces)},{"title",title},{"body",body},{"actions",QJsonArray::fromStringList(actions)}});return id;}
 void CloseNotification(uint id){const bool owned=owned_.remove(id);frame({{"event","closed"},{"id",int(id)},{"owned",owned}});emit NotificationClosed(id,3);}
signals:void ActionInvoked(uint,const QString&);void NotificationClosed(uint,uint);
};
int main(int argc,char**argv){QCoreApplication app(argc,argv);if(app.arguments()!=QStringList{app.applicationFilePath(),"--fixture"}||qEnvironmentVariable("TILDE_PRIVATE_NOTICE_FIXTURE")!="1")return 2;auto bus=QDBusConnection::sessionBus();ServiceFixture service;if(!bus.registerObject("/org/freedesktop/Notifications",&service,QDBusConnection::ExportAllSlots|QDBusConnection::ExportAllSignals)||!bus.registerService("org.freedesktop.Notifications"))return 3;QByteArray incoming;QSocketNotifier input(STDIN_FILENO,QSocketNotifier::Read);QObject::connect(&input,&QSocketNotifier::activated,&app,[&]{char b[1024];const auto n=::read(STDIN_FILENO,b,sizeof(b));if(n<=0){app.quit();return;}incoming.append(b,n);if(incoming.size()>4096){app.exit(2);return;}while(incoming.contains('\n')){const auto at=incoming.indexOf('\n');const auto p=QJsonDocument::fromJson(incoming.left(at)).object();incoming.remove(0,at+1);if(p.value("action")=="open"&&p.size()==2)service.open(p.value("id").toInt());else{app.exit(2);return;}}});ServiceFixture::frame({{"event","ready"}});const auto result=app.exec();bus.unregisterService("org.freedesktop.Notifications");bus.unregisterObject("/org/freedesktop/Notifications");return result;}
#include "service-fixture.moc"
