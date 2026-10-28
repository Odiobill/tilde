#include "NativeTypes.h"
#include "MarkdownController.h"
#include "Theme.h"
#include <time.h>
#include <QQmlEngine>
#include <QJSEngine>
double ActiveClock::now()const{timespec value{};if(clock_gettime(CLOCK_MONOTONIC,&value)!=0)return 0;return double(value.tv_sec)*1000+value.tv_nsec/1000000;}
void registerNativeTypes(){static const bool registered=[](){qmlRegisterSingletonType<ActiveClock>("Tilde.Native",1,0,"ActiveClock",[](QQmlEngine*,QJSEngine*)->QObject*{return new ActiveClock;});qmlRegisterType<MarkdownController>("Tilde.Native",1,0,"MarkdownController");qmlRegisterSingletonType<Theme>("Tilde.Native",1,0,"Theme",[](QQmlEngine*,QJSEngine*)->QObject*{return new Theme;});return true;}();Q_UNUSED(registered);}
