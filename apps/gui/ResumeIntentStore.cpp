#include "ResumeIntentStore.h"
#include "Paths.h"
#include "protocol-v4.hpp"
#include <QFile>
#include <QSaveFile>
#include <QJsonDocument>
namespace{bool safe(const QString&p){struct stat s{};return PrivatePaths::file(p)&&(lstat(p.toUtf8().constData(),&s)<0?errno==ENOENT:s.st_nlink==1);}bool valid(const QJsonObject&i){return TildeProtocolV4::validateRequest(QJsonObject{{"v",4},{"id","resume"},{"method","conversation.resume"},{"params",QJsonObject{{"intent",i}}}});}}
bool ResumeIntentStore::load(){if(!safe(path_))return false;QFile f(path_);if(!f.exists()){pending_={};return true;}if(!f.open(QIODevice::ReadOnly)||f.size()>4096)return false;QJsonParseError e;const auto d=QJsonDocument::fromJson(f.readAll(),&e);if(e.error!=QJsonParseError::NoError||!d.isObject()||!valid(d.object()))return false;pending_=d.object();return true;}
bool ResumeIntentStore::save(const QJsonObject&i){if(!valid(i)||!load()||(!pending_.isEmpty()&&pending_!=i)||!PrivatePaths::directory(QFileInfo(path_).absolutePath(),true))return false;const auto bytes=QJsonDocument(i).toJson(QJsonDocument::Compact);QSaveFile f(path_);f.setDirectWriteFallback(false);if(!safe(path_)||!f.open(QIODevice::WriteOnly)||!f.setPermissions(QFileDevice::ReadOwner|QFileDevice::WriteOwner)||f.write(bytes)!=bytes.size()||!safe(path_)||!f.flush()||::fsync(f.handle())<0||!f.commit()||!PrivatePaths::persistDirectory(QFileInfo(path_).absolutePath()))return false;pending_=i;return true;}
bool ResumeIntentStore::clear(){const auto expected=pending_;if(!load()||pending_!=expected)return false;if(QFile::exists(path_)&&!QFile::remove(path_))return false;if(!PrivatePaths::persistDirectory(QFileInfo(path_).absolutePath()))return false;pending_={};return true;}
