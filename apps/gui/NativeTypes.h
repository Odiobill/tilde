#pragma once
void registerNativeTypes();

#include <QObject>
class ActiveClock:public QObject{
 Q_OBJECT
public:
 explicit ActiveClock(QObject*parent=nullptr):QObject(parent){}
 Q_INVOKABLE double now()const;
};
