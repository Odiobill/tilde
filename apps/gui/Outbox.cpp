#include "Outbox.h"
#include "GuiState.h"
#include "Paths.h"
#include "protocol-v2.hpp"
#include "protocol-v3.hpp"
#include "protocol-v4.hpp"
#include <QFile>
#include <QSaveFile>
#include <QJsonDocument>
#include <QStringDecoder>
namespace {
constexpr qint64 bound=1048576;
bool valid(const QJsonObject &r){return TildeProtocolV4::validateRequest(QJsonObject{{"v",4},{"id","outbox"},{"method","conversation.submit"},{"params",r}});}
bool legacyValid(const QJsonObject&r){return TildeProtocolV2::validateRequest(QJsonObject{{"v",2},{"id","outbox"},{"method","conversation.submit"},{"params",r}});}
bool safe(const QString&path){if(!PrivatePaths::file(path))return false;struct stat s{};return lstat(path.toUtf8().constData(),&s)<0?errno==ENOENT:s.st_nlink==1;}
bool bytes(const QString&path,QByteArray&data){if(!safe(path))return false;QFile file(path);if(!file.exists()){data.clear();return true;}if(!file.open(QIODevice::ReadOnly)||file.size()>bound)return false;data=file.readAll();if(file.error()!=QFileDevice::NoError)return false;QStringDecoder d(QStringDecoder::Utf8);d.decode(data);return !d.hasError();}
bool atomic(const QString&path,const QByteArray&data){if(data.size()>bound||!safe(path)||!PrivatePaths::directory(QFileInfo(path).absolutePath(),true))return false;QSaveFile file(path);file.setDirectWriteFallback(false);return file.open(QIODevice::WriteOnly)&&file.setPermissions(QFileDevice::ReadOwner|QFileDevice::WriteOwner)&&file.write(data)==data.size()&&file.flush()&&::fsync(file.handle())==0&&file.commit()&&PrivatePaths::persistDirectory(QFileInfo(path).absolutePath());}
}
bool Outbox::load(){QByteArray data;if(!bytes(path_,data))return false;if(!QFile::exists(path_)){pending_={};draftRevision_.clear();legacy_=false;original_.clear();return true;}QJsonParseError e;const auto d=QJsonDocument::fromJson(data,&e);if(e.error!=QJsonParseError::NoError||!d.isObject())return false;const auto o=d.object();QJsonObject request;QString revision;bool legacy=false;
 if((o.value("version").toInt()==3||o.value("version").toInt()==4)&&o.value("request").isObject()){if(o.keys()!=QStringList({"draftRevision","request","version"})||!o.value("draftRevision").isString()||o.value("draftRevision").toString().toUtf8().size()>128)return false;request=o.value("request").toObject();revision=o.value("draftRevision").toString();if(!valid(request))return false;}else if(valid(o))request=o;else if(legacyValid(o)){request=o;legacy=true;}else return false;
 pending_=request;draftRevision_=revision;legacy_=legacy;original_=data;return true;
}
bool Outbox::write(const QJsonObject&request,const QString&revision){if(!valid(request)||revision.toUtf8().size()>128)return false;const auto data=QJsonDocument(QJsonObject{{"version",4},{"request",request},{"draftRevision",revision}}).toJson(QJsonDocument::Compact);QByteArray current;if(!bytes(path_,current)||current!=original_)return false;if(!atomic(path_,data))return false;pending_=request;draftRevision_=revision;legacy_=false;original_=data;return true;}
bool Outbox::save(const QJsonObject&request,const QString&revision){if(QFile::exists(path_)){if(!load()||pending_!=request||draftRevision_!=revision)return false;return !legacy_;}original_.clear();return write(request,revision);}
bool Outbox::migrateLegacy(const QString&rootId){if(!GuiState::validId(rootId)||!load())return false;if(!legacy_)return true;const auto before=path_+".legacy-v2.json";if(QFile::exists(before)){QByteArray saved;if(!bytes(before,saved)||saved!=original_)return false;}else if(!atomic(before,original_))return false;auto request=pending_;request["conversationId"]=rootId;return write(request,{});}
bool Outbox::clear(){QByteArray current;if(!bytes(path_,current)||current!=original_)return false;if(QFile::exists(path_)&&!QFile::remove(path_))return false;if(!PrivatePaths::persistDirectory(QFileInfo(path_).absolutePath()))return false;pending_={};draftRevision_.clear();original_.clear();legacy_=false;return true;}
