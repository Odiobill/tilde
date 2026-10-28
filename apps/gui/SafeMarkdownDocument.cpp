#include "SafeMarkdownDocument.h"
#include <QImage>
QVariant SafeMarkdownDocument::loadResource(int type,const QUrl&){
 ++denied_;
 // A valid value is required: an invalid QVariant invokes document/global
 // resource providers. Never delegate to QTextDocument's parent/file loader.
 if(type==QTextDocument::ImageResource){QImage inert(1,1,QImage::Format_ARGB32_Premultiplied);inert.fill(Qt::transparent);return inert;}
 return QByteArray("");
}
