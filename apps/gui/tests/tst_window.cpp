#include <QtTest>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QQuickItem>
#include <QJsonArray>
#include <QRegularExpression>
#include "IpcBridge.h"
#include "NativeTypes.h"
#include "SingleInstance.h"
#include "Driver.h"
#include "WirePeer.h"

static bool referenceFloating(QQuickWindow *window){
 if(!qEnvironmentVariableIsSet("TILDE_TEST_FLOAT_REFERENCE"))return true;
 if(!QTest::qWaitForWindowExposed(window)){qWarning("REF_NOT_EXPOSED");return false;}
 const auto title=QString("Tilde M1 reference %1").arg(QCoreApplication::applicationPid());window->setTitle(title);
 QElapsedTimer elapsed;elapsed.start();
 while(elapsed.elapsed()<1500){
  QProcess query;query.start("hyprctl",{"-j","clients"});if(!query.waitForFinished(2000)||query.exitCode()!=0){qWarning()<<"REF_QUERY_FAILED"<<query.errorString()<<query.exitCode()<<query.readAllStandardError().left(512);return false;}
  for(const auto &value:QJsonDocument::fromJson(query.readAllStandardOutput()).array()){
   const auto client=value.toObject();if(client.value("pid").toInteger()!=QCoreApplication::applicationPid()||client.value("title").toString()!=title)continue;
   if(client.value("floating").toBool())return true;
   QProcess floating;const auto address=client.value("address").toString();if(!QRegularExpression("^0x[0-9a-fA-F]+$").match(address).hasMatch())return false;floating.start("hyprctl",{"eval",QString("hl.dispatch(hl.dsp.window.float({action=\"on\",window=\"address:%1\"}))").arg(address)});if(!floating.waitForFinished(2000)||floating.exitCode()!=0){qWarning()<<"REF_FLOAT_FAILED"<<floating.errorString()<<floating.exitCode()<<floating.readAllStandardError().left(512)<<floating.readAllStandardOutput().left(512);return false;}
  }
  QTest::qWait(20);
 }
 return false;
}
class WindowTest:public QObject {
 Q_OBJECT
private slots:
 void initTestCase(){registerNativeTypes();qInfo().noquote()<<"M4_FACT"<<QJsonDocument(QJsonObject{{"backend",QGuiApplication::platformName()},{"qtVersion",qVersion()}}).toJson(QJsonDocument::Compact);}
 void enterAndShiftEnter(){Driver driver;QVERIFY(driver.start());IpcBridge bridge(driver.home.filePath("outbox.json"));bridge.connectToAgent(driver.socket);QTRY_COMPARE(bridge.connectionState(),QString("ready"));QTRY_VERIFY(!bridge.busy());QQmlApplicationEngine engine;engine.rootContext()->setContextProperty("bridge",&bridge);engine.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!engine.rootObjects().isEmpty());auto w=qobject_cast<QQuickWindow*>(engine.rootObjects().first());QVERIFY(w);auto composer=w->findChild<QQuickItem*>("composer");QVERIFY(composer);composer->forceActiveFocus();composer->setProperty("text","first line");QTest::keyClick(w,Qt::Key_Return,Qt::ShiftModifier);QVERIFY(composer->property("text").toString().contains('\n'));QSignalSpy submitted(&bridge,&IpcBridge::submitted);QTest::keyClick(w,Qt::Key_Return);QTRY_COMPARE(submitted.size(),1);QCOMPARE(composer->property("text").toString(),QString());}
 void activationPreservesPresentation(){QTemporaryDir dir;SingleInstance instance;QVERIFY(instance.start(dir.filePath("activation.sock")));IpcBridge bridge(dir.filePath("outbox.json"));QQmlApplicationEngine engine;engine.rootContext()->setContextProperty("bridge",&bridge);engine.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!engine.rootObjects().isEmpty());auto w=qobject_cast<QQuickWindow*>(engine.rootObjects().first());QVERIFY(w);auto composer=w->findChild<QQuickItem*>("composer");QVERIFY(composer);QObject::connect(&instance,&SingleInstance::activate,w,[w]{QMetaObject::invokeMethod(w,"activateFromLauncher");});QVERIFY(referenceFloating(w));w->resize(790,610);QTest::qWait(50);const auto expectedSize=w->size();composer->setProperty("text","keep draft");QVERIFY(QMetaObject::invokeMethod(w,"activateFromLauncher"));QTRY_VERIFY(composer->hasActiveFocus());QCOMPARE(w->size(),expectedSize);QCOMPARE(composer->property("text").toString(),QString("keep draft"));
  auto env=QProcessEnvironment::systemEnvironment();env.insert("QT_QPA_PLATFORM","wayland");env.insert("WAYLAND_DISPLAY","unavailable-tilde-display");QProcess second;second.setProcessEnvironment(env);second.start(GUI_PATH,{"--activation",dir.filePath("activation.sock")});QVERIFY(second.waitForStarted());QTRY_VERIFY_WITH_TIMEOUT(second.state()==QProcess::NotRunning,3000);QCOMPARE(second.exitCode(),0);qInfo().noquote()<<"M4_FACT {\"activationAck\":true}";QCOMPARE(w->size(),expectedSize);QVERIFY(w->isVisible());qInfo().noquote()<<"M4_FACT"<<QJsonDocument(QJsonObject{{"exposed",w->isExposed()},{"draftPreserved",composer->property("text").toString()=="keep draft"},{"geometryPreserved",w->size()==expectedSize}}).toJson(QJsonDocument::Compact);
  w->showMaximized();QTRY_COMPARE(w->visibility(),QWindow::Maximized);QMetaObject::invokeMethod(w,"activateFromLauncher");QCOMPARE(w->visibility(),QWindow::Maximized);w->showMinimized();QMetaObject::invokeMethod(w,"activateFromLauncher");QTRY_COMPARE(w->visibility(),QWindow::Maximized);QTRY_VERIFY(w->isActive());qInfo().noquote()<<"M4_FACT {\"focused\":true}";QTRY_VERIFY(composer->hasActiveFocus());w->showFullScreen();QMetaObject::invokeMethod(w,"activateFromLauncher");QCOMPARE(w->visibility(),QWindow::FullScreen);
 }
 void busyDisconnectedAndSetupKeepDraft(){QTemporaryDir dir;IpcBridge bridge(dir.filePath("outbox.json"));QQmlApplicationEngine engine;engine.rootContext()->setContextProperty("bridge",&bridge);engine.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!engine.rootObjects().isEmpty());auto w=qobject_cast<QQuickWindow*>(engine.rootObjects().first());auto composer=w->findChild<QQuickItem*>("composer");QVERIFY(composer);composer->setProperty("text","keep offline draft");composer->forceActiveFocus();QTest::keyClick(w,Qt::Key_Return);QCOMPARE(composer->property("text").toString(),QString("keep offline draft"));
  composer->setProperty("text",QString("long draft line\n").repeated(100));composer->setProperty("cursorPosition",composer->property("text").toString().size());w->resize(540,420);QTest::qWait(30);auto viewport=w->findChild<QQuickItem*>("composerViewport");QVERIFY(viewport);QVERIFY(viewport->height()>=64&&viewport->height()<=140);QVERIFY(viewport->y()+viewport->height()<w->height());
 }

 void setupCloseNeverSubmitsPassword(){Driver driver;QVERIFY(driver.start());IpcBridge bridge(driver.home.filePath("outbox.json"));bridge.connectToAgent(driver.socket);QTRY_COMPARE(bridge.connectionState(),QString("ready"));QQmlApplicationEngine engine;engine.rootContext()->setContextProperty("bridge",&bridge);engine.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!engine.rootObjects().isEmpty());auto w=qobject_cast<QQuickWindow*>(engine.rootObjects().first());QVERIFY(QMetaObject::invokeMethod(w,"openSettings",Q_ARG(QVariant,QString("models-and-providers"))));auto setup=w->findChild<QObject*>("settingsView");QVERIFY(setup);bridge.settingsController()->startAuth(bridge.settingsController()->target(),"api_key");QQuickItem*key=nullptr;QTRY_VERIFY((key=w->findChild<QQuickItem*>("authPromptResponse"))&&key->property("visible").toBool());key->setProperty("text","private-fixture-password");key->forceActiveFocus();QSignalSpy submitted(&bridge,&IpcBridge::submitted);QTest::keyClick(w,Qt::Key_Escape);QTRY_VERIFY(!w->property("settingsOpen").toBool());QVERIFY(bridge.settingsController()->authSession().isEmpty());QCOMPARE(submitted.size(),0);QCOMPARE(bridge.chat()->rowCount(),0);}

 void finalReviewParkedRunEnablesCancel(){WirePeer wire;IpcBridge bridge(wire.home.filePath("outbox.json"));bridge.connectToAgent(wire.home.filePath("socket"));QTRY_COMPARE(wire.subscriptions,1);QQmlApplicationEngine engine;engine.rootContext()->setContextProperty("bridge",&bridge);engine.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!engine.rootObjects().isEmpty());auto blocked=wire.view();auto chat=blocked.value("chat").toObject();chat["state"]="blocked";chat["errorCode"]="RESTART_LIMIT";blocked["chat"]=chat;auto work=wire.work();work["status"]="blocked";work["activeConversationId"]="1";work["activeRunId"]="2";blocked["work"]=work;wire.send({{"v",4},{"event","conversation.updated"},{"epoch",wire.epoch},{"subscriptionId",wire.subscription},{"seq","1"},{"view",blocked}});QTRY_COMPARE(bridge.error(),QString("RESTART_LIMIT"));bool enabled=false;for(auto *object:engine.rootObjects().first()->findChildren<QObject*>())if(object->property("text")=="Cancel")enabled=object->property("enabled").toBool();QVERIFY(enabled);}
 void finalReviewRejectionKeepsNewerDraft(){WirePeer wire;wire.holdSubmit=true;IpcBridge bridge(wire.home.filePath("outbox.json"));bridge.connectToAgent(wire.home.filePath("socket"));QTRY_COMPARE(wire.subscriptions,1);QQmlApplicationEngine engine;engine.rootContext()->setContextProperty("bridge",&bridge);engine.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!engine.rootObjects().isEmpty());auto w=qobject_cast<QQuickWindow*>(engine.rootObjects().first());auto composer=w->findChild<QQuickItem*>("composer");QVERIFY(composer);composer->setProperty("text","original submitted draft");QMetaObject::invokeMethod(w,"sendDraft");composer->setProperty("text","newer unsent draft");QTRY_VERIFY(!wire.heldId.isEmpty());wire.send({{"v",4},{"id",wire.heldId},{"epoch",wire.epoch},{"ok",false},{"error",QJsonObject{{"code","SETTINGS_CHANGED"},{"message","Review the current model."}}}});QTRY_VERIFY(composer->property("text").toString().contains("original submitted draft"));QVERIFY(composer->property("text").toString().contains("newer unsent draft"));QCOMPARE(bridge.chat()->rowCount(),0);}

};
QTEST_MAIN(WindowTest)
#include "tst_window.moc"
