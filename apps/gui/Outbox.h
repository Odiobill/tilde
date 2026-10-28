#pragma once
#include <QString>
#include <QJsonObject>
class Outbox {
 QString path_,draftRevision_;QJsonObject pending_;QByteArray original_;bool legacy_=false;
 bool write(const QJsonObject&,const QString&);
public:
 explicit Outbox(QString path):path_(std::move(path)){}
 bool migrateLegacy(const QString&rootId);bool load();bool save(const QJsonObject &request,const QString&draftRevision={});bool clear();
 QJsonObject pending()const{return pending_;}QString draftRevision()const{return draftRevision_;}bool legacy()const{return legacy_;}
};
