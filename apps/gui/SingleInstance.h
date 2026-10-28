#pragma once
#include <QObject>
#include <QLocalServer>
#include <QJsonObject>
class SingleInstance:public QObject {
 Q_OBJECT
 QLocalServer server_;int owner_=-1;QString path_;
public:
 using QObject::QObject;
 ~SingleInstance()override;
 static bool validActivation(const QJsonObject&);
 static int forward(const QString &path,const QJsonObject &payload={{"v",1},{"intent","show"}});
 bool start(const QString &path);
signals:void activated(const QJsonObject&);void activate();
};
