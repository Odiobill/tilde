#include <QCoreApplication>
#include <QApplication>
#include "TrayController.h"
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QTextStream>
#include "IpcBridge.h"
#include "SingleInstance.h"
#include "Paths.h"
#include "NativeTypes.h"
#include "AccessibilityPreferences.h"
#include <vector>
#include <unistd.h>
namespace {
QString option(const QStringList &args,const QString &key,const QString &fallback){auto i=args.indexOf(key);return i>=0&&i+1<args.size()?args[i+1]:fallback;}
QJsonObject activationPayload(const QStringList&args){if(args.contains("--settings"))return {{"v",1},{"intent","settings"}};if(args.contains("--open-conversation"))return {{"v",1},{"intent","conversation"},{"conversationId",option(args,"--open-conversation",{})}};return {{"v",1},{"intent","show"}};}
QString runtime(){auto path=qEnvironmentVariable("XDG_RUNTIME_DIR");return QDir::isAbsolutePath(path)?path+"/tilde":QString();}
QString outbox(){auto state=qEnvironmentVariable("XDG_STATE_HOME");if(state.isEmpty())state=QDir::homePath()+"/.local/state";return QDir::isAbsolutePath(state)?state+"/tilde/gui-outbox.json":QString();}
}
int main(int argc,char **argv){
 bool gui=false;for(int i=1;i<argc;i++)if(QByteArray(argv[i])=="--gui-instance")gui=true;
 if(!gui){QCoreApplication app(argc,argv);const auto args=app.arguments();const auto socket=option(args,"--socket",runtime().isEmpty()?QString():runtime()+"/agent.sock");const auto activation=option(args,"--activation",socket.isEmpty()?QString():socket+".gui");if(activation.isEmpty())return 2;
  const auto forwarded=SingleInstance::forward(activation,activationPayload(args));if(forwarded>=0)return forwarded;
  std::vector<QByteArray> words;for(int i=0;i<argc;i++)words.emplace_back(argv[i]);words.emplace_back("--gui-instance");std::vector<char*> pointers;for(auto &word:words)pointers.push_back(word.data());pointers.push_back(nullptr);auto executable=QCoreApplication::applicationFilePath().toUtf8();execv(executable.constData(),pointers.data());return 5;
 }
 QApplication app(argc,argv);app.setApplicationName("Tilde");app.setOrganizationName("Tilde");app.setApplicationVersion("0.1.0");app.setDesktopFileName("tilde-gui");const auto args=app.arguments();const auto socket=option(args,"--socket",runtime().isEmpty()?QString():runtime()+"/agent.sock");const auto pending=option(args,"--outbox",outbox());const auto activation=option(args,"--activation",socket.isEmpty()?QString():socket+".gui");
 if(socket.isEmpty()||pending.isEmpty()||!PrivatePaths::directory(QFileInfo(socket).absolutePath(),true)||!PrivatePaths::directory(QFileInfo(pending).absolutePath(),true))return 2;
 SingleInstance instance;if(!instance.start(activation))return 4;
 registerNativeTypes();AccessibilityPreferences accessibility(QFileInfo(pending).absolutePath()+"/ui-accessibility.json");IpcBridge bridge(pending);TrayController tray;QQmlApplicationEngine engine;engine.rootContext()->setContextProperty("trayController",&tray);engine.rootContext()->setContextProperty("accessibilityPreferences",&accessibility);engine.rootContext()->setContextProperty("bridge",&bridge);engine.load(QUrl("qrc:/qt/qml/Tilde/Main.qml"));if(engine.rootObjects().isEmpty())return 5;
 auto *window=qobject_cast<QQuickWindow*>(engine.rootObjects().first());if(!window)return 5;
 QObject::connect(&instance,&SingleInstance::activated,&bridge,[&bridge,window](const QJsonObject&a){bridge.activate(a);QMetaObject::invokeMethod(window,"activateFromLauncher");});bridge.activate(activationPayload(args));bridge.connectToAgent(socket);QMetaObject::invokeMethod(window,"activateFromLauncher");QTextStream(stdout)<<"{\"event\":\"window_ready\",\"version\":1}"<<Qt::endl;return app.exec();
}
