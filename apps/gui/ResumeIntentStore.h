#pragma once
#include <QString>
#include <QJsonObject>
class ResumeIntentStore{QString path_;QJsonObject pending_;public:explicit ResumeIntentStore(QString path):path_(std::move(path)){}bool load();QJsonObject pending()const{return pending_;}bool save(const QJsonObject&);bool clear();};
