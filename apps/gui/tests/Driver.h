#pragma once
#include <QProcess>
#include <QProcessEnvironment>
#include <QTemporaryDir>
#include <QFile>
#include <QJsonDocument>
#include <QElapsedTimer>
#include <QThread>
#include <sys/stat.h>
class Driver {
public:
 QTemporaryDir home;QProcess process;QString socket;
 bool start(bool missing=false,bool tools=false){chmod(home.path().toUtf8().constData(),0700);QStringList args{DAEMON_DRIVER,"--fixture",home.path()};if(missing)args<<"--missing-auth";if(tools)args<<"--tools";QProcessEnvironment env;env.insert("PATH","/usr/local/bin:/usr/bin:/bin");env.insert("HOME",home.path());env.insert("TMPDIR",home.path());env.insert("XDG_CONFIG_HOME",home.filePath(".config"));env.insert("XDG_STATE_HOME",home.filePath(".local/state"));env.insert("XDG_CACHE_HOME",home.filePath(".cache"));env.insert("XDG_RUNTIME_DIR",home.filePath("run"));process.setProcessEnvironment(env);process.start(NODE_PATH,args);QElapsedTimer timer;timer.start();QByteArray output;
  while(timer.elapsed()<5000){process.waitForReadyRead(50);output+=process.readAllStandardOutput();if(output.contains('\n')){auto ready=QJsonDocument::fromJson(output.split('\n').first()).object();socket=ready.value("socketPath").toString();return ready.value("event")=="ready"&&!socket.isEmpty();}if(process.state()==QProcess::NotRunning)return false;}
  return false;
 }
 ~Driver(){if(process.state()!=QProcess::NotRunning){process.terminate();if(!process.waitForFinished(3000)){process.kill();process.waitForFinished(3000);}}}
};
