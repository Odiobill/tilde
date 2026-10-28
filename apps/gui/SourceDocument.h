#pragma once
#include <QObject>
#include <QJsonObject>
#include <QTemporaryFile>
#include <QCryptographicHash>
#include <QHash>
#include <QList>
#include <memory>
class SourceDocument:public QObject{
 Q_OBJECT
 Q_PROPERTY(bool complete READ complete NOTIFY changed)
 Q_PROPERTY(int pageCount READ pageCount NOTIFY changed)
 Q_PROPERTY(qint64 byteCount READ byteCount NOTIFY changed)
 Q_PROPERTY(QString error READ error NOTIFY changed)
 QString directory_,cid_,entry_,error_;int message_=0;qint64 offset_=0,cacheBytes_=0;bool complete_=false;std::unique_ptr<QTemporaryFile>file_;QList<qint64>offsets_,lengths_;QHash<int,QByteArray>pages_;QList<int>lru_;QByteArray identity_;QJsonObject manifest_;QCryptographicHash hash_{QCryptographicHash::Sha256};
 QByteArray identity()const;bool fail(const QString&);
public:
 explicit SourceDocument(QString directory={},QObject*parent=nullptr):QObject(parent),directory_(std::move(directory)){}
 void setDirectory(const QString&d){invalidate();directory_=d;}bool begin(const QString&,const QString&,int);bool accept(const QJsonObject&);void invalidate();
 bool beginPayload(const QJsonObject&);bool acceptPayload(const QJsonObject&);QJsonObject payloadManifest()const{return manifest_;}
 bool complete()const{return complete_;}int pageCount()const{return complete_?offsets_.size():0;}qint64 byteCount()const{return offset_;}QString error()const{return error_;}qint64 nextOffset()const{return offset_;}qint64 cachedBytes()const{return cacheBytes_;}QString conversationId()const{return cid_;}QString entryId()const{return entry_;}int messageIndex()const{return message_;}
 Q_INVOKABLE QString pageAt(int);Q_INVOKABLE bool copy();
signals:void changed();void copied();
};
