#include <QtTest>
#include <QFile>
#include <QJsonDocument>
#include "protocol.hpp"
#include "protocol-v3.hpp"
#include "protocol-v4.hpp"
#include "IpcBridge.h"
#include <sys/socket.h>
#include <unistd.h>
class ProtocolTest:public QObject {
 Q_OBJECT
private slots:
 void v4WireParity(){QString path=QString::fromUtf8(FIXTURE_PATH);path.replace("wire-v3.json","wire-v4.json");path.replace("wire-v2.json","wire-v4.json");QFile file(path);QVERIFY(file.open(QIODevice::ReadOnly));const auto fixtures=QJsonDocument::fromJson(file.readAll()).array();QVERIFY(fixtures.size()>=40);for(const auto&item:fixtures){const auto f=item.toObject();QJsonObject result;const bool actual=TildeProtocolV4::decode(QByteArray::fromBase64(f.value("base64").toString().toLatin1()),result,f.value("direction")=="request");QVERIFY2(actual==f.value("valid").toBool(),qPrintable(f.value("name").toString()));}}
 void fixtures(){QFile file(FIXTURE_PATH);QVERIFY(file.open(QIODevice::ReadOnly));auto fixtures=QJsonDocument::fromJson(file.readAll()).array();QVERIFY(fixtures.size()>30);
  for(const auto &item:fixtures){auto fixture=item.toObject();auto bytes=QByteArray::fromBase64(fixture.value("base64").toString().toLatin1());QJsonObject result;
   QCOMPARE(TildeProtocolV3::decode(bytes,result,fixture.value("direction")=="request"),fixture.value("valid").toBool());}
 }
 void stagedV3Fixtures(){
  QString path=QString::fromUtf8(FIXTURE_PATH);path.replace("wire-v2.json","wire-v3.json");
  QFile file(path);QVERIFY(file.open(QIODevice::ReadOnly));const auto fixtures=QJsonDocument::fromJson(file.readAll()).array();QVERIFY(fixtures.size()>=174);
  for(const auto &item:fixtures){const auto f=item.toObject();const auto bytes=QByteArray::fromBase64(f.value("base64").toString().toLatin1());QJsonObject result;
   const bool accepted=TildeProtocolV3::decode(bytes,result,f.value("direction")=="request");
   QVERIFY2(accepted==f.value("valid").toBool(),qPrintable(f.value("name").toString()));
  }
 }
 void actualPeerUid(){int fds[2];QVERIFY(socketpair(AF_UNIX,SOCK_STREAM,0,fds)==0);QVERIFY(IpcBridge::peerAllowed(fds[0],geteuid()));QVERIFY(!IpcBridge::peerAllowed(fds[0],geteuid()+1));close(fds[0]);close(fds[1]);}
};
QTEST_GUILESS_MAIN(ProtocolTest)
#include "tst_protocol.moc"
