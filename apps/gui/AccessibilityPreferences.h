#pragma once
#include <QObject>
#include <QByteArray>
class AccessibilityPreferences:public QObject {
 Q_OBJECT
 Q_PROPERTY(bool reducedMotion READ reducedMotion WRITE setReducedMotion NOTIFY changed)
 Q_PROPERTY(QString error READ error NOTIFY changed)
 QString path_,error_;QByteArray accepted_;bool existed_=false,reduced_=false;quint64 device_=0,inode_=0;
 void fail(const QString&code);
public:
 explicit AccessibilityPreferences(QString path,QObject*parent=nullptr);
 bool reducedMotion()const{return reduced_;}QString error()const{return error_;}
 void setReducedMotion(bool value);
signals:void changed();
};
