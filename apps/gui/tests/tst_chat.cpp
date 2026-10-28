#include <QtTest>
#include <QFile>
#include <QJsonObject>
#include "IpcBridge.h"
#include "Outbox.h"
#include "GuiState.h"
#include <QDir>
#include "Driver.h"
#include "WirePeer.h"
class ChatTest:public QObject {
 Q_OBJECT
private slots:
 void m4StorageState(){
  const auto root=qEnvironmentVariable("TILDE_M4_POWER_STATE_DIR");if(root.isEmpty())return;
  const auto mode=qEnvironmentVariable("TILDE_M4_POWER_MODE"),cid=qEnvironmentVariable("TILDE_M4_POWER_CONVERSATION"),revision=qEnvironmentVariable("TILDE_M4_POWER_SELECTION");
  QVERIFY(QDir::isAbsolutePath(root));QVERIFY(GuiState::validId(cid));QVERIFY(mode=="prepare"||mode=="recover");
  GuiState state(root+"/gui-state.json");Outbox outbox(root+"/gui-outbox.json");QVERIFY(state.load());QVERIFY(outbox.load());
  const QJsonObject request{{"conversationId",cid},{"requestId","m4-power-outbox"},{"text","pending synthetic power input"},{"selectionRevision",revision}};
  if(mode=="prepare"){QVERIFY(state.setSelection(cid));QVERIFY(state.setDraft(cid,"retained synthetic power draft"));QVERIFY(outbox.save(request,state.draftRevision(cid)));}
  QCOMPARE(state.selection(),cid);QCOMPARE(state.draft(cid),QString("retained synthetic power draft"));QCOMPARE(outbox.pending(),request);QCOMPARE(outbox.draftRevision(),state.draftRevision(cid));
  qInfo().noquote()<<"M4_GUI_STORAGE_FACT"<<QJsonDocument(QJsonObject{{"selection",state.selection()},{"draft",state.draft(cid)},{"draftRevision",state.draftRevision(cid)},{"outbox",outbox.pending()},{"outboxDraftRevision",outbox.draftRevision()}}).toJson(QJsonDocument::Compact);
 }
 void durableOutbox(){QTemporaryDir dir;QString path=dir.filePath("pending.json");QJsonObject pending{{"conversationId","1"},{"requestId","same-request"},{"text","submitted text"},{"selectionRevision","revision"}};Outbox first(path);QVERIFY(first.save(pending));Outbox reopened(path);QVERIFY(reopened.load());QCOMPARE(reopened.pending(),pending);struct stat s{};QVERIFY(lstat(path.toUtf8().constData(),&s)==0);QCOMPARE(s.st_mode&0777,0600U);QVERIFY(reopened.clear());QVERIFY(!QFile::exists(path));}
 void secretsAndInvalidOutbox(){QTemporaryDir dir;auto path=dir.filePath("pending.json");Outbox outbox(path);QVERIFY(!outbox.save({{"key","synthetic"}}));QVERIFY(!QFile::exists(path));}
 void streamedRealDaemon(){Driver driver;QVERIFY(driver.start());IpcBridge bridge(driver.home.filePath("outbox.json"));bridge.connectToAgent(driver.socket);QTRY_COMPARE_WITH_TIMEOUT(bridge.connectionState(),QString("ready"),5000);QTRY_VERIFY(bridge.credentialStored());QTRY_VERIFY(!bridge.busy());QVERIFY(bridge.submit("hello from Qt"));bool partial=false;QElapsedTimer timer;timer.start();while(timer.elapsed()<5000&&bridge.busy()){if(!bridge.partial().isEmpty())partial=true;QTest::qWait(10);}QVERIFY(partial);QCOMPARE(bridge.chat()->rowCount(),2);QVERIFY(!bridge.busy());}
 void disconnectedKeepsInput(){QTemporaryDir dir;IpcBridge bridge(dir.filePath("outbox.json"));QVERIFY(!bridge.submit("preserve draft"));QVERIFY(!QFile::exists(dir.filePath("outbox.json")));}
 void staleRevisionRestoresDraft(){Driver driver;QVERIFY(driver.start());const QString path=driver.home.filePath("outbox.json");Outbox outbox(path);QVERIFY(outbox.save({{"conversationId","1"},{"requestId","stale-request"},{"text","restore this"},{"selectionRevision","old-revision"}}));IpcBridge bridge(path);QSignalSpy restored(&bridge,&IpcBridge::restoreDraft);bridge.connectToAgent(driver.socket);QTRY_COMPARE_WITH_TIMEOUT(restored.size(),1,5000);QCOMPARE(restored.first().first().toString(),QString("restore this"));QCOMPARE(bridge.chat()->rowCount(),0);QVERIFY(!QFile::exists(path));}
 void stableModelIds(){ChatModel model;QJsonObject one{{"id","1"},{"role","user"},{"text","one"},{"truncated",false}},two{{"id","2"},{"role","assistant"},{"text","two"},{"truncated",false}};QVERIFY(model.apply({one,two}));QPersistentModelIndex old(model.index(0));QVERIFY(model.apply({one,two}));QCOMPARE(model.rowCount(),2);QVERIFY(old.isValid());QCOMPARE(old.data(ChatModel::Id).toString(),QString("1"));QVERIFY(!model.apply({one,one}));}
 void ackLossSurvivesGuiReopen(){WirePeer wire;wire.dropAck=true;const auto file=wire.home.filePath("outbox.json");{IpcBridge bridge(file);bridge.connectToAgent(wire.home.filePath("socket"));QTRY_COMPARE(bridge.connectionState(),QString("ready"));QTRY_VERIFY(!bridge.busy());QVERIFY(bridge.submit("retain identity"));QTRY_COMPARE(wire.submissions.size(),1);QVERIFY(QFile::exists(file));}
  IpcBridge reopened(file);reopened.connectToAgent(wire.home.filePath("socket"));QTRY_COMPARE(wire.submissions.size(),2);QTRY_VERIFY(!QFile::exists(file));QCOMPARE(wire.submissions[0].value("requestId"),wire.submissions[1].value("requestId"));QCOMPARE(reopened.chat()->rowCount(),2);
 }
 void gapsEpochAndOldSubscriptions(){WirePeer wire;IpcBridge bridge(wire.home.filePath("outbox.json"));bridge.connectToAgent(wire.home.filePath("socket"));QTRY_COMPARE(wire.subscriptions,1);const auto old=wire.subscription;wire.update(old,"2");QTRY_COMPARE(wire.subscriptions,2);wire.entries.append(QJsonObject{{"id","one"},{"role","user"},{"text","one"},{"truncated",false}});wire.update(old,"1");QTest::qWait(20);QCOMPARE(bridge.chat()->rowCount(),0);wire.update(wire.subscription,"1");QTRY_COMPARE(bridge.chat()->rowCount(),1);wire.epoch="next-epoch";wire.update(wire.subscription,"2");QTRY_COMPARE(wire.subscriptions,3);QCOMPARE(bridge.chat()->rowCount(),1);}
 void credentialInputNeverEntersOutbox(){WirePeer wire;auto path=wire.home.filePath("outbox.json");IpcBridge bridge(path);bridge.connectToAgent(wire.home.filePath("socket"));QTRY_COMPARE(bridge.connectionState(),QString("ready"));bridge.saveApiKey("synthetic-key");QTest::qWait(20);QVERIFY(!QFile::exists(path));}

 void corruptOutboxIsNeverOverwritten(){QTemporaryDir dir;auto path=dir.filePath("outbox.json");QFile file(path);QVERIFY(file.open(QIODevice::WriteOnly));file.write("{corrupt");file.close();file.setPermissions(QFileDevice::ReadOwner|QFileDevice::WriteOwner);Outbox box(path);QVERIFY(!box.load());QVERIFY(!box.save({{"requestId","new"},{"text","new"},{"selectionRevision","revision"}}));QVERIFY(file.open(QIODevice::ReadOnly));QCOMPARE(file.readAll(),QByteArray("{corrupt"));}

 void exactUnicodeInputByteBound(){Driver driver;QVERIFY(driver.start());IpcBridge bridge(driver.home.filePath("outbox.json"));bridge.connectToAgent(driver.socket);QTRY_COMPARE(bridge.connectionState(),QString("ready"));QTRY_VERIFY(!bridge.busy());const auto boundary=QString(QChar(0x00e9)).repeated(32768);QVERIFY(!bridge.submit(boundary+"a"));QVERIFY(bridge.submit(boundary));QTRY_COMPARE_WITH_TIMEOUT(bridge.chat()->rowCount(),2,5000);QCOMPARE(bridge.chat()->data(bridge.chat()->index(0),ChatModel::Text).toString(),boundary.left(16384));QVERIFY(bridge.chat()->data(bridge.chat()->index(0),ChatModel::Truncated).toBool());}

 void finalReviewTerminalViewClearsAdmissionWithoutRunning(){WirePeer wire;wire.holdSubmit=true;const auto file=wire.home.filePath("outbox.json");IpcBridge bridge(file);bridge.connectToAgent(wire.home.filePath("socket"));QTRY_COMPARE(wire.subscriptions,1);QVERIFY(bridge.submit("fast complete"));QTRY_VERIFY(!wire.heldId.isEmpty());wire.update(wire.subscription,"1");QTest::qWait(20);QVERIFY(bridge.busy());wire.entries={QJsonObject{{"id","u"},{"role","user"},{"text","fast complete"},{"truncated",false}},QJsonObject{{"id","a"},{"role","assistant"},{"text","complete"},{"truncated",false}}};wire.send({{"v",4},{"id",wire.heldId},{"epoch",wire.epoch},{"ok",true},{"result",QJsonObject{{"submissionId","original"},{"deduplicated",false}}}});wire.update(wire.subscription,"2");QTRY_COMPARE(bridge.chat()->rowCount(),2);QTRY_VERIFY(!bridge.busy());QVERIFY(!QFile::exists(file));}
 void finalReviewSettingsChangedRefreshesWithoutResubmit(){
  Driver driver;QVERIFY(driver.start());
  for(const auto&name:{"first","second"}){QVERIFY(QDir().mkdir(driver.home.filePath(name)));QVERIFY(QFile::setPermissions(driver.home.filePath(name),QFileDevice::ReadOwner|QFileDevice::WriteOwner|QFileDevice::ExeOwner));}
  IpcBridge first(driver.home.filePath("first/outbox.json")),second(driver.home.filePath("second/outbox.json"));first.connectToAgent(driver.socket);second.connectToAgent(driver.socket);
  QTRY_COMPARE(first.connectionState(),QString("ready"));QTRY_COMPARE(second.connectionState(),QString("ready"));
  // A stale-client test needs completed startup reads before the other client writes.
  QTRY_VERIFY(!first.busy());QTRY_VERIFY(!second.busy());QTRY_VERIFY(first.pendingRequestMetadata().isEmpty());QTRY_VERIFY(second.pendingRequestMetadata().isEmpty());
  QCOMPARE(first.settings().value("modelId").toString(),QString("deepseek-v4.1-flash"));const auto originalRevision=first.settings().value("selectionRevision");
  second.selectModel("glm-5.2");QTRY_COMPARE(second.settings().value("modelId").toString(),QString("glm-5.2"));
  QCOMPARE(first.settings().value("selectionRevision"),originalRevision);QCOMPARE(first.settings().value("modelId").toString(),QString("deepseek-v4.1-flash"));
  QSignalSpy restored(&first,&IpcBridge::restoreDraft);QVERIFY(first.submit("retain for review"));
  QTRY_VERIFY2(restored.size()==1,qPrintable(QString("model=%1 rows=%2 error=%3 pending=%4").arg(first.settings().value("modelId").toString()).arg(first.chat()->rowCount()).arg(first.error()).arg(QString::fromUtf8(QJsonDocument(first.pendingRequestMetadata()).toJson(QJsonDocument::Compact)))));
  QCOMPARE(restored.first().first().toString(),QString("retain for review"));QVERIFY(!QFile::exists(driver.home.filePath("first/outbox.json")));
  QTRY_COMPARE(first.settings().value("modelId").toString(),QString("glm-5.2"));QTest::qWait(50);QCOMPARE(first.chat()->rowCount(),0);
  first.selectModel("deepseek-v4.1-flash");QTRY_COMPARE(first.settings().value("modelId").toString(),QString("deepseek-v4.1-flash"));QTRY_VERIFY(!first.busy());QVERIFY(first.submit("explicit new Send"));QTRY_COMPARE_WITH_TIMEOUT(first.chat()->rowCount(),2,5000);
 }


 void finalReviewCredentialErrorRemainsVisibleWithCatalog(){Driver driver;QVERIFY(driver.start(true));const auto fileName=driver.home.filePath(".pi/agent/auth.json");QVERIFY(QDir().mkpath(QFileInfo(fileName).absolutePath()));QFile file(fileName);QVERIFY(file.open(QIODevice::WriteOnly));file.write("{corrupt");file.close();QVERIFY(file.setPermissions(QFileDevice::ReadOwner|QFileDevice::WriteOwner));IpcBridge bridge(driver.home.filePath("outbox.json"));bridge.connectToAgent(driver.socket);QTRY_COMPARE(bridge.connectionState(),QString("ready"));QTRY_VERIFY(!bridge.models().isEmpty());QCOMPARE(bridge.error(),QString("INVALID_CREDENTIAL_JSON"));QVERIFY(!bridge.credentialStored());}

};
QTEST_GUILESS_MAIN(ChatTest)
#include "tst_chat.moc"
