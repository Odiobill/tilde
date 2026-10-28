#include <QtTest>
#include <QAccessible>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickItem>
#include <QQuickWindow>
#include <cmath>
#include "IpcBridge.h"
#include "NativeTypes.h"
#include "Theme.h"
#include "AccessibilityPreferences.h"
#include "M3Peer.h"
#include "WirePeer.h"
#include <QFile>
#include <QScopeGuard>
#include <QScreen>
#include <sys/stat.h>
#include <unistd.h>
class AccessibilityTest:public QObject {
 Q_OBJECT
 static QQuickItem*find(QQuickItem*root,const QString&name){if(root->objectName()==name)return root;for(auto*c:root->childItems())if(auto*r=find(c,name))return r;return nullptr;}
 static double luminance(QColor c){auto linear=[](double x){return x<=0.04045?x/12.92:std::pow((x+0.055)/1.055,2.4);};return .2126*linear(c.redF())+.7152*linear(c.greenF())+.0722*linear(c.blueF());}
 static double contrast(QColor a,QColor b){auto x=luminance(a),y=luminance(b);return(std::max(x,y)+.05)/(std::min(x,y)+.05);}
private slots:
 void initTestCase(){registerNativeTypes();QAccessible::setActive(true);qInfo().noquote()<<"M4_A11Y_FACT"<<QJsonDocument(QJsonObject{{"backend",QGuiApplication::platformName()},{"qtVersion",qVersion()},{"devicePixelRatio",QGuiApplication::primaryScreen()->devicePixelRatio()}}).toJson(QJsonDocument::Compact);}
 void keyboardTraversesPrimaryFlowsWithoutWork(){
  M3Peer peer;IpcBridge bridge(peer.home.filePath("outbox.json"));bridge.connectToAgent(peer.home.filePath("socket"));QTRY_COMPARE(bridge.connectionState(),QString("ready"));
  QQmlApplicationEngine e;e.rootContext()->setContextProperty("bridge",&bridge);e.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!e.rootObjects().isEmpty());auto*w=qobject_cast<QQuickWindow*>(e.rootObjects().first());QVERIFY(w);QVERIFY(QTest::qWaitForWindowExposed(w));auto*composer=find(w->contentItem(),"composer");QVERIFY(composer);
  auto*accessible=QAccessible::queryAccessibleInterface(composer);QVERIFY(accessible);QCOMPARE(accessible->role(),QAccessible::EditableText);QCOMPARE(accessible->text(QAccessible::Name),QString("Message to Tilde"));
  composer->setProperty("text","unsent accessibility draft");composer->forceActiveFocus();QTest::keyClick(w,Qt::Key_Tab);QVERIFY(!composer->hasActiveFocus());QVERIFY(w->activeFocusItem());QTest::keyClick(w,Qt::Key_Backtab);QVERIFY(composer->hasActiveFocus());
  QMetaObject::invokeMethod(w,"openSettings",Q_ARG(QVariant,QString("appearance")));QTRY_VERIFY(w->property("settingsOpen").toBool());QTest::keyClick(w,Qt::Key_Escape);QTRY_VERIFY(!w->property("settingsOpen").toBool());QCOMPARE(composer->property("text").toString(),QString("unsent accessibility draft"));QCOMPARE(peer.submissions.size(),0);QCOMPARE(peer.decisions.size(),0);
 }
 void secretFieldsArePasswordAccessible(){
  M3Peer peer;IpcBridge bridge(peer.home.filePath("outbox.json"));bridge.connectToAgent(peer.home.filePath("socket"));QTRY_COMPARE(bridge.connectionState(),QString("ready"));QQmlApplicationEngine e;e.rootContext()->setContextProperty("bridge",&bridge);e.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!e.rootObjects().isEmpty());auto*w=qobject_cast<QQuickWindow*>(e.rootObjects().first());QMetaObject::invokeMethod(w,"openSettings",Q_ARG(QVariant,QString("models-and-providers")));auto*c=bridge.settingsController();c->startAuth(c->target(),"api_key");QQuickItem*field=nullptr;QTRY_VERIFY((field=find(w->contentItem(),"authPromptResponse"))&&field->isVisible());field->setProperty("text","synthetic-accessibility-secret");
  auto*accessible=QAccessible::queryAccessibleInterface(field);QVERIFY(accessible);QVERIFY(accessible->state().passwordEdit);QVERIFY(accessible->text(QAccessible::Name).isEmpty()||accessible->text(QAccessible::Name)=="Provider secret");QVERIFY(accessible->text(QAccessible::Description).startsWith("Provider secret."));auto*label=find(w->contentItem(),"authResponseLabel");QVERIFY(label&&label->isVisible());auto*labelAccessible=QAccessible::queryAccessibleInterface(label);QVERIFY(labelAccessible);QCOMPARE(labelAccessible->text(QAccessible::Name),QString("Provider secret"));for(auto role:{QAccessible::Name,QAccessible::Description,QAccessible::Value})QVERIFY(!accessible->text(role).contains("synthetic-accessibility-secret"));QCOMPARE(peer.submissions.size(),0);QCOMPARE(peer.decisions.size(),0);
 }
 void themeContrastAndLargeTextStayUsable(){
  Theme theme;for(const auto&mode:{QString("light"),QString("dark")}){theme.setMode(mode);for(const auto&surface:{theme.background(),theme.panel(),theme.surface()}){QVERIFY2(contrast(theme.foreground(),surface)>=4.5,qPrintable(mode+" foreground"));QVERIFY2(contrast(theme.muted(),surface)>=4.5,qPrintable(mode+" muted"));QVERIFY2(contrast(theme.border(),surface)>=3.,qPrintable(mode+" essential border"));}QVERIFY(contrast(theme.accentText(),theme.accent())>=4.5);}
 }
 void motionPreferencePersistsWithoutDraftLoss(){
  Theme theme;QVERIFY(theme.metaObject()->indexOfProperty("reducedMotion")>=0);QVERIFY(theme.setProperty("reducedMotion",true));QVERIFY(theme.reducedMotion());
  M3Peer peer;const auto path=peer.home.filePath("ui-accessibility.json");AccessibilityPreferences prefs(path);QVERIFY(prefs.error().isEmpty());QVERIFY(!prefs.reducedMotion());
  IpcBridge bridge(peer.home.filePath("outbox.json"));bridge.connectToAgent(peer.home.filePath("socket"));QTRY_COMPARE(bridge.connectionState(),QString("ready"));QQmlApplicationEngine e;e.rootContext()->setContextProperty("bridge",&bridge);e.rootContext()->setContextProperty("accessibilityPreferences",&prefs);e.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!e.rootObjects().isEmpty());auto*w=qobject_cast<QQuickWindow*>(e.rootObjects().first());auto*composer=find(w->contentItem(),"composer");QVERIFY(composer);composer->setProperty("text","preserve unsent motion draft");bridge.settingsController()->markDirty("provider");
  prefs.setReducedMotion(true);QVERIFY2(prefs.error().isEmpty(),qPrintable(prefs.error()));QVERIFY(prefs.reducedMotion());AccessibilityPreferences reopened(path);QVERIFY(reopened.error().isEmpty());QVERIFY(reopened.reducedMotion());QCOMPARE(composer->property("text").toString(),QString("preserve unsent motion draft"));QVERIFY(bridge.settingsController()->dirty());
  struct stat st{};QVERIFY(::lstat(path.toUtf8().constData(),&st)==0);QCOMPARE(st.st_mode&0777,mode_t(0600));QCOMPARE(st.st_uid,geteuid());QCOMPARE(peer.submissions.size(),0);QCOMPARE(peer.decisions.size(),0);
 }
 void invalidPreferenceIsNotSilentlyRepaired(){
  QTemporaryDir dir;const auto path=dir.filePath("ui-accessibility.json");QFile file(path);QVERIFY(file.open(QIODevice::WriteOnly));file.write("{invalid}");file.close();QVERIFY(file.setPermissions(QFile::ReadOwner|QFile::WriteOwner));AccessibilityPreferences invalid(path);QCOMPARE(invalid.error(),QString("PREFERENCE_INVALID"));invalid.setReducedMotion(true);QVERIFY(file.open(QIODevice::ReadOnly));QCOMPARE(file.readAll(),QByteArray("{invalid}"));file.close();QVERIFY(file.remove());
  AccessibilityPreferences first(path),stale(path);first.setReducedMotion(true);QVERIFY(first.error().isEmpty());stale.setReducedMotion(true);QCOMPARE(stale.error(),QString("PREFERENCE_CONFLICT"));AccessibilityPreferences current(path);QVERIFY(current.reducedMotion());
 }
 void unsafePreferenceNeverFollowsLinksOrRepairsModes(){
  QTemporaryDir dir;const auto path=dir.filePath("ui-accessibility.json"),outside=dir.filePath("sentinel");QFile file(outside);QVERIFY(file.open(QIODevice::WriteOnly));file.write("sentinel");file.close();QVERIFY(::symlink(outside.toUtf8().constData(),path.toUtf8().constData())==0);AccessibilityPreferences link(path);QVERIFY(!link.error().isEmpty());link.setReducedMotion(true);QVERIFY(file.open(QIODevice::ReadOnly));QCOMPARE(file.readAll(),QByteArray("sentinel"));file.close();QVERIFY(QFile::remove(path));
  QFile bad(path);QVERIFY(bad.open(QIODevice::WriteOnly));bad.write("{\"version\":1,\"reducedMotion\":false}");bad.close();QVERIFY(bad.setPermissions(QFile::ReadOwner|QFile::WriteOwner|QFile::ReadOther));AccessibilityPreferences mode(path);QCOMPARE(mode.error(),QString("PREFERENCE_UNSAFE"));mode.setReducedMotion(true);QVERIFY(bad.permissions()&QFile::ReadOther);
 }
 void enlargedApplicationFontIsNotOverridden(){const auto original=QGuiApplication::font();auto restore=qScopeGuard([&]{QGuiApplication::setFont(original);});Theme theme;auto enlarged=original;enlarged.setPixelSize(30);QGuiApplication::setFont(enlarged);QVERIFY2(theme.bodySize()>=30,"System/application enlarged text must reach the GUI instead of being reset to15px");QVERIFY(theme.smallSize()>=24);}
 void canonicalApprovalRemainsFullyReadable_data(){QTest::addColumn<bool>("reduced");QTest::newRow("motion")<<false;QTest::newRow("reduced-motion")<<true;}
 void canonicalApprovalRemainsFullyReadable(){
  QFETCH(bool,reduced);
  WirePeer wire;AccessibilityPreferences prefs(wire.home.filePath("ui-accessibility.json"));prefs.setReducedMotion(reduced);const auto expires=QDateTime::currentMSecsSinceEpoch()+600000;QJsonObject op{{"id","op"},{"conversationId","1"},{"tool","shell_run"},{"fingerprint","fingerprint"},{"risk","unrestricted_shell"},{"status","awaiting_approval"},{"createdAt",1},{"attempt",0},{"summary","synthetic preview"},{"targets",QJsonArray{"/fixture"}},{"output",""},{"truncated",true},{"approvalExpiresAt",expires},{"approvalId","approval"}};
  wire.operations={op};wire.details={{"operationId","op"},{"fingerprint","fingerprint"},{"risk","unrestricted_shell"},{"expiresAt",expires},{"request",QJsonObject{{"tool","shell_run"},{"args",QJsonObject{{"script",QString(100000,'x')+"END_OF_EXACT_FIXTURE"},{"cwd","/fixture"}}}}}};
  IpcBridge bridge(wire.home.filePath("outbox.json"));bridge.connectToAgent(wire.home.filePath("socket"));QTRY_COMPARE(bridge.approvals()->rowCount(),1);QQmlApplicationEngine e;e.rootContext()->setContextProperty("bridge",&bridge);e.rootContext()->setContextProperty("accessibilityPreferences",&prefs);e.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!e.rootObjects().isEmpty());auto*w=qobject_cast<QQuickWindow*>(e.rootObjects().first());auto*dialog=w->findChild<QObject*>("approvalDialog");auto*view=w->findChild<QQuickItem*>("exactApprovalAction");QVERIFY(dialog&&view);bridge.loadApprovalDetails("op","fingerprint");QVERIFY(QMetaObject::invokeMethod(dialog,"open"));QTRY_VERIFY(bridge.approvals()->document()->complete());QTRY_VERIFY(dialog->property("visible").toBool());QTRY_VERIFY(dialog->property("opacity").toReal()>.99);
  auto*accessible=QAccessible::queryAccessibleInterface(view);QVERIFY(accessible);QCOMPARE(accessible->text(QAccessible::Name),QString("Complete action to review"));QCOMPARE(accessible->role(),QAccessible::List);view->forceActiveFocus();QTest::keyClick(w,Qt::Key_End);QTRY_COMPARE(view->property("currentIndex").toInt(),bridge.approvals()->document()->pageCount()-1);
  QByteArray read;for(int i=0;i<bridge.approvals()->document()->pageCount();i++){view->setProperty("currentIndex",i);QVERIFY(QMetaObject::invokeMethod(view,"positionViewAtIndex",Q_ARG(int,i),Q_ARG(int,0)));QQuickItem*page=nullptr;QTRY_VERIFY((page=view->property("currentItem").value<QQuickItem*>()));auto*text=QAccessible::queryAccessibleInterface(page);QVERIFY(text);QVERIFY(text->state().readOnly);QVERIFY(text->text(QAccessible::Name).startsWith("Action page "));read+=text->text(QAccessible::Value).toUtf8();}
  QCOMPARE(read,wire.requestBytes);QVERIFY(read.contains("END_OF_EXACT_FIXTURE"));QCOMPARE(wire.decisions.size(),0);QCOMPARE(wire.submissions.size(),0);
 }
 void minimumGeometryAndFocusWithEnlargedText_data(){QTest::addColumn<QString>("mode");QTest::addColumn<int>("pixels");for(const auto&mode:{"light","dark"})for(int size:{15,30})QTest::newRow(qPrintable(QString(mode)+"-"+QString::number(size)))<<QString(mode)<<size;}
 void minimumGeometryAndFocusWithEnlargedText(){
  QFETCH(QString,mode);QFETCH(int,pixels);const auto original=QGuiApplication::font();auto restore=qScopeGuard([&]{QGuiApplication::setFont(original);});auto font=original;font.setPixelSize(pixels);QGuiApplication::setFont(font);
  M3Peer peer;AccessibilityPreferences prefs(peer.home.filePath("ui-accessibility.json"));peer.acceptedUi=peer.prefs();peer.acceptedUi["theme"]=mode;IpcBridge bridge(peer.home.filePath("outbox.json"));bridge.connectToAgent(peer.home.filePath("socket"));QTRY_COMPARE(bridge.connectionState(),QString("ready"));QQmlApplicationEngine e;e.rootContext()->setContextProperty("bridge",&bridge);e.rootContext()->setContextProperty("accessibilityPreferences",&prefs);e.load(QUrl::fromLocalFile(QML_PATH));QVERIFY(!e.rootObjects().isEmpty());auto*w=qobject_cast<QQuickWindow*>(e.rootObjects().first());w->resize(520,400);QVERIFY(QTest::qWaitForWindowExposed(w));QTest::qWait(50);
  for(const auto&name:{"composer","sendMessage","cancelWork"}){auto*control=find(w->contentItem(),name);QVERIFY(control);const auto point=control->mapToScene(QPointF());QVERIFY2(point.x()>=-1&&point.y()>=-1&&point.x()+control->width()<=w->width()+1&&point.y()+control->height()<=w->height()+1,name);}
  auto*composer=find(w->contentItem(),"composer");composer->setProperty("text","Large synthetic unsent draft");composer->forceActiveFocus();QVERIFY(composer->hasActiveFocus());const auto capture=qEnvironmentVariable("TILDE_A11Y_CAPTURE_DIR");if(!capture.isEmpty())QVERIFY(w->grabWindow().save(capture+"/main-"+mode+"-"+QString::number(pixels)+".png"));
  QMetaObject::invokeMethod(w,"openSettings",Q_ARG(QVariant,QString("appearance")));QQuickItem*heading=nullptr;QTRY_VERIFY((heading=find(w->contentItem(),"heading-appearance")));QVERIFY(heading->property("font").value<QFont>().pixelSize()>=qRound(pixels*22./15.));QTest::qWait(50);auto*form=find(w->contentItem(),"settingsFlickable");QVERIFY(form);QVERIFY2(form->height()>=160,"Settings navigation must leave readable form space at minimum size with enlarged text");auto*column=heading->parentItem();QVERIFY(column);for(auto*child:column->childItems())if(child->isVisible()&&child->width()>0)QVERIFY2(child->x()+child->width()<=form->width()+1,qPrintable(QString("Settings child overflows at%1px font: %2 width%3 viewport%4").arg(pixels).arg(child->metaObject()->className()).arg(child->width()).arg(form->width())));if(!capture.isEmpty())QVERIFY(w->grabWindow().save(capture+"/settings-"+mode+"-"+QString::number(pixels)+".png"));QCOMPARE(peer.submissions.size(),0);QCOMPARE(peer.decisions.size(),0);
 }
};
QTEST_MAIN(AccessibilityTest)
#include "tst_accessibility.moc"
