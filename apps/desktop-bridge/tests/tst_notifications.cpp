#include <QtTest>
#include <QDBusConnection>
#include <QDBusContext>
#include <QDBusMessage>
#include <QDBusConnectionInterface>
#include <QJsonDocument>
#include <QJsonArray>
#include <QFile>
#include <QProcess>
#include <QElapsedTimer>
#include "NotificationBridge.h"
class FakeNotices:public QObject,protected QDBusContext{
 Q_OBJECT
 Q_CLASSINFO("D-Bus Interface","org.freedesktop.Notifications")
public:QList<QVariantList> calls;QList<uint> closed;QStringList capabilities{"actions"};int delay=0;uint next=40;
public slots:
 QStringList GetCapabilities(){return capabilities;}
 uint Notify(const QString&app,uint replaces,const QString&icon,const QString&title,const QString&body,const QStringList&actions,const QVariantMap&hints,int timeout){calls.append({app,replaces,icon,title,body,actions,hints,timeout});const uint id=++next;if(delay){setDelayedReply(true);const auto msg=message();const auto bus=connection();QTimer::singleShot(delay,this,[bus,msg,id]{bus.send(msg.createReply(QVariantList{id}));});return 0;}return id;}
 void CloseNotification(uint id){closed.append(id);}
signals:void ActionInvoked(uint id,const QString&action);void NotificationClosed(uint id,uint reason);
};
class NotificationTest:public QObject{
 Q_OBJECT
 QDBusConnection bus=QDBusConnection::sessionBus();
 QDBusConnection client=QDBusConnection::connectToBus(QString::fromLocal8Bit(qgetenv("DBUS_SESSION_BUS_ADDRESS")),"tilde-notification-client");
 bool registerService(FakeNotices&service){return bus.registerObject("/org/freedesktop/Notifications",&service,QDBusConnection::ExportAllSlots|QDBusConnection::ExportAllSignals)&&bus.registerService("org.freedesktop.Notifications");}
 void unregisterService(){bus.unregisterService("org.freedesktop.Notifications");bus.unregisterObject("/org/freedesktop/Notifications");}
 static bool ready(const QList<QJsonObject>&frames,bool available=true){for(const auto&f:frames)if(f.value("event")=="ready"&&f.value("available").toBool()==available)return true;return false;}
 static int count(const QList<QJsonObject>&frames,const QString&event){int n=0;for(const auto&f:frames)if(f.value("event")==event)++n;return n;}
 static QByteArray input(const QString&id,const QString&kind="completion"){return QJsonDocument(QJsonObject{{"v",1},{"id",id},{"kind",kind}}).toJson(QJsonDocument::Compact);}
private slots:
 void cleanup(){unregisterService();}
 void sharedProtocolFixtures(){QFile file(DESKTOP_FIXTURE_PATH);QVERIFY(file.open(QIODevice::ReadOnly));const auto f=QJsonDocument::fromJson(file.readAll()).object();for(const auto&v:f.value("validInputs").toArray())QVERIFY(NotificationBridge::validInput(v.toObject()));for(const auto&v:f.value("invalidInputs").toArray())QVERIFY(!NotificationBridge::validInput(v.toObject()));for(const auto&v:f.value("validOutputs").toArray())QVERIFY(NotificationBridge::validOutput(v.toObject()));for(const auto&v:f.value("invalidOutputs").toArray())QVERIFY(!NotificationBridge::validOutput(v.toObject()));}
 void fixedTemplatesContainNoContent(){FakeNotices service;QVERIFY(registerService(service));NotificationBridge helper(client);QList<QJsonObject> frames;connect(&helper,&NotificationBridge::frame,this,[&](auto f){frames.append(f);});helper.start();QTRY_VERIFY(ready(frames));for(const auto&kind:QStringList{"completion","approval","attention"})QVERIFY(helper.acceptLine(input(kind,kind)));QTRY_COMPARE(service.calls.size(),3);QTRY_COMPARE(count(frames,"result"),3);QCOMPARE(service.calls[0][3].toString(),QString("Tilde finished"));QCOMPARE(service.calls[1][3].toString(),QString("Tilde needs your approval"));QCOMPARE(service.calls[2][4].toString(),QString("Open Tilde to inspect the current status."));for(const auto&call:service.calls){QCOMPARE(call[0].toString(),QString("Tilde"));QCOMPARE(call[1].toUInt(),0u);QCOMPARE(call[5].toStringList(),QStringList({"open","Open Tilde"}));QVERIFY(!QJsonDocument(QJsonArray::fromVariantList(call)).toJson().contains("SYNTHETIC"));}helper.close();QTRY_COMPARE(service.closed.size(),3);}
 void notificationOwnerChangeInvalidatesActions(){FakeNotices service;QVERIFY(registerService(service));NotificationBridge helper(client);QList<QJsonObject> frames;connect(&helper,&NotificationBridge::frame,this,[&](auto f){frames.append(f);});helper.start();QTRY_VERIFY(ready(frames));QVERIFY(helper.acceptLine(input("old")));QTRY_COMPARE(count(frames,"result"),1);const auto oldRevision=frames.last().value("ownerRevision");QVERIFY(bus.unregisterService("org.freedesktop.Notifications"));QTRY_VERIFY(ready(frames,false));QVERIFY(bus.registerService("org.freedesktop.Notifications"));QTRY_VERIFY(frames.last().value("event")=="ready"&&frames.last().value("available").toBool()&&frames.last().value("ownerRevision")!=oldRevision);emit service.ActionInvoked(41,"open");QTest::qWait(30);QCOMPARE(count(frames,"open"),0);QVERIFY(helper.acceptLine(input("new")));QTRY_COMPARE(count(frames,"result"),2);emit service.ActionInvoked(42,"open");QTRY_COMPARE(count(frames,"open"),1);QCOMPARE(frames.last().value("id").toString(),QString("new"));emit service.ActionInvoked(42,"open");QTest::qWait(20);QCOMPARE(count(frames,"open"),1);helper.close();}
 void absentCapabilitiesExposeNoAction(){FakeNotices service;service.capabilities={};QVERIFY(registerService(service));NotificationBridge helper(client);QList<QJsonObject> frames;connect(&helper,&NotificationBridge::frame,this,[&](auto f){frames.append(f);});helper.start();QTRY_VERIFY(ready(frames));QVERIFY(helper.acceptLine(input("quiet")));QTRY_COMPARE(service.calls.size(),1);QVERIFY(service.calls[0][5].toStringList().isEmpty());emit service.ActionInvoked(41,"open");QTest::qWait(20);QCOMPARE(count(frames,"open"),0);helper.close();}
 void uncertainTimeoutIsNotRetried(){FakeNotices service;service.delay=2600;QVERIFY(registerService(service));NotificationBridge helper(client);QList<QJsonObject> frames;connect(&helper,&NotificationBridge::frame,this,[&](auto f){frames.append(f);});helper.start();QTRY_VERIFY(ready(frames));QElapsedTimer elapsed;elapsed.start();QVERIFY(helper.acceptLine(input("timeout")));QTRY_COMPARE_WITH_TIMEOUT(count(frames,"result"),1,2400);QVERIFY(elapsed.elapsed()>=1800);QVERIFY(elapsed.elapsed()<2400);QCOMPARE(frames.last().value("status").toString(),QString("failed"));QTest::qWait(700);QCOMPARE(service.calls.size(),1);helper.close();}
 void reviewM2KnownLateReplyIsClosedAtCapturedOwner(){for(bool closeHelper:{true,false}){FakeNotices service;service.delay=250;QVERIFY(registerService(service));NotificationBridge helper(client);QList<QJsonObject> frames;connect(&helper,&NotificationBridge::frame,this,[&](auto f){frames.append(f);});helper.start();QTRY_VERIFY(ready(frames));QVERIFY(helper.acceptLine(input("abandoned")));QTRY_COMPARE(service.calls.size(),1);if(closeHelper)helper.close();else{QVERIFY(bus.unregisterService("org.freedesktop.Notifications"));QTRY_VERIFY(ready(frames,false));}QTRY_COMPARE_WITH_TIMEOUT(service.closed.size(),1,1500);QCOMPARE(service.closed.first(),41u);QCOMPARE(service.calls.size(),1);QCOMPARE(count(frames,"open"),0);helper.close();unregisterService();}}
 void slowServiceDoesNotBlockCleanup(){FakeNotices service;service.delay=5000;QVERIFY(registerService(service));NotificationBridge helper(client);QList<QJsonObject> frames;connect(&helper,&NotificationBridge::frame,this,[&](auto f){frames.append(f);});helper.start();QTRY_VERIFY(ready(frames));QVERIFY(helper.acceptLine(input("slow")));QTRY_COMPARE(service.calls.size(),1);QElapsedTimer timer;timer.start();helper.close();QVERIFY(timer.elapsed()<200);}
 void boundedQueueHasOneNotifyInFlight(){FakeNotices service;service.delay=1000;QVERIFY(registerService(service));NotificationBridge helper(client);QList<QJsonObject> frames;connect(&helper,&NotificationBridge::frame,this,[&](auto f){frames.append(f);});helper.start();QTRY_VERIFY(ready(frames));for(int i=0;i<32;i++)QVERIFY(helper.acceptLine(input("event_"+QString::number(i))));QTest::qWait(50);QCOMPARE(service.calls.size(),1);QVERIFY(count(frames,"result")>=16);helper.close();}
 void helperMalformedFrameStopsSafely(){QProcess helper;helper.start(DESKTOP_HELPER_PATH,{});QVERIFY(helper.waitForStarted());helper.write("{\"v\":1,\"id\":\"opaque\",\"kind\":\"completion\",\"script\":\"SYNTHETIC_NEVER_EXECUTE\"}\n");QVERIFY(helper.waitForFinished(3000));QVERIFY(helper.exitCode()!=0);QVERIFY(!helper.readAllStandardOutput().contains("SYNTHETIC"));}
};
QTEST_GUILESS_MAIN(NotificationTest)
#include "tst_notifications.moc"
