#pragma once
#include <QObject>
#include <QJsonObject>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusServiceWatcher>
#include <QQueue>
#include <QHash>
class NotificationBridge:public QObject{
 Q_OBJECT
 struct Active{QString event,revision;};
 QDBusConnection bus_;QDBusServiceWatcher watcher_;QString owner_,revision_="0";quint64 generation_=0,serial_=0;bool started_=false,closed_=false,available_=false,actions_=false,busy_=false;
 QQueue<QJsonObject> queue_;QJsonObject current_;QHash<uint,Active> active_;
 void setOwner(const QString&);void announce();void pump();void result(const QString&,const QString&,const QString&);void closeAt(const QString&,uint);
private slots:
 void action(uint,const QString&,const QDBusMessage&);void notificationClosed(uint,uint,const QDBusMessage&);
public:
 explicit NotificationBridge(QDBusConnection,QObject*parent=nullptr);~NotificationBridge()override{close();}
 static bool validInput(const QJsonObject&);static bool validOutput(const QJsonObject&);
 bool acceptLine(const QByteArray&);void start();void close();
signals:void frame(const QJsonObject&);
};
