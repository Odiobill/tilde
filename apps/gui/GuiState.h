#pragma once
#include <QString>
#include <QStringList>
#include <QHash>
#include <QJsonObject>
class GuiState{
 struct Cached{QString text,revision;qint64 bytes;};
 QJsonObject pendingGrant_,geometry_;
 QString path_,selection_,create_,error_;QByteArray original_;bool loaded_=false,existed_=false;QHash<QString,Cached> drafts_;QStringList lru_;qint64 bytes_=0;
 bool readBody(const QString&,QString&,QString&);
 bool readDraft(const QString&,QString&,QString&);void remember(const QString&,const QString&,const QString&);bool ensureLoaded();
public:
 explicit GuiState(QString path):path_(std::move(path)){}
 static bool validId(const QString&);
 bool load();bool save();QString draft(const QString&);QString draftRevision(const QString&);bool setDraft(const QString&,const QString&);
 QString selection()const{return selection_;}bool setSelection(const QString&);
 QString pendingCreate()const{return create_;}bool setPendingCreate(const QString&);bool clearPendingCreate(){return setPendingCreate({});}
 QJsonObject pendingGrant()const{return pendingGrant_;}bool setPendingGrant(const QJsonObject&);
 QString startupDraft();bool setStartupDraft(const QString&);
 QJsonObject geometry()const{return geometry_;}bool setGeometry(const QJsonObject&);
 QString error()const{return error_;}qint64 cachedBytes()const{return bytes_;}
};
