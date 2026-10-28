#pragma once
#include <QTextDocument>
class SafeMarkdownDocument:public QTextDocument{
 Q_OBJECT
 int denied_=0;
protected:QVariant loadResource(int,const QUrl&)override;
public:explicit SafeMarkdownDocument(QObject*parent=nullptr):QTextDocument(parent){}int deniedResources()const{return denied_;}
};
