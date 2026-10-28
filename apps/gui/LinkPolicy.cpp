#include "LinkPolicy.h"
bool LinkPolicy::allowed(const QUrl&url){
 if(!url.isValid()||url.isRelative()||(url.scheme()!="http"&&url.scheme()!="https")||url.host().isEmpty()||url.authority(QUrl::FullyEncoded).contains('@'))return false;
 const auto text=QUrl::fromPercentEncoding(url.toEncoded());
 for(const auto c:text)if(c.category()==QChar::Other_Control||c.category()==QChar::Other_Format)return false;
 return true;
}
