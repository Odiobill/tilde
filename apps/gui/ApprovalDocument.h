#pragma once
#include <QObject>
#include <QJsonObject>
#include <QTemporaryFile>
#include <QCryptographicHash>
#include <QHash>
#include <QList>
#include <memory>
class ApprovalDocument:public QObject{
 Q_OBJECT
 Q_PROPERTY(int pageCount READ pageCount NOTIFY changed)
 Q_PROPERTY(qint64 byteCount READ byteCount NOTIFY changed)
 Q_PROPERTY(bool complete READ complete NOTIFY changed)
 Q_PROPERTY(bool verified READ verified NOTIFY changed)
 Q_PROPERTY(bool current READ current NOTIFY changed)
 Q_PROPERTY(bool displayed READ displayed NOTIFY changed)
 Q_PROPERTY(bool canApprove READ canApprove NOTIFY changed)
 QString directory_;QJsonObject manifest_;std::unique_ptr<QTemporaryFile> file_;QCryptographicHash hash_{QCryptographicHash::Sha256};qint64 offset_=0,size_=0,cacheBytes_=0;bool complete_=false,verified_=false,current_=false,displayed_=false;QHash<qint64,QByteArray> pages_;QList<qint64> lru_;
 QList<qint64> offsets_,lengths_;QByteArray identity_;QByteArray identity()const;
 bool fail();
public:
 explicit ApprovalDocument(QString directory,QObject*parent=nullptr):QObject(parent),directory_(std::move(directory)){}
 void setDirectory(QString directory){invalidate();directory_=std::move(directory);}
 bool begin(const QJsonObject&,const QString&);bool acceptChunk(const QJsonObject&);
 bool complete()const{return complete_;}bool verified()const{return verified_;}bool current()const{return current_;}bool displayed()const{return displayed_;}bool canApprove()const;
 void setDisplayed(bool);void setCurrent(bool);void invalidate();
 int pageCount()const{return complete_?offsets_.size():0;}qint64 byteCount()const{return size_;}Q_INVOKABLE QString pageAt(int);
 Q_INVOKABLE QString page(qint64,int=32768);qint64 cachedBytes()const{return cacheBytes_;}qint64 nextOffset()const{return offset_;}QJsonObject manifest()const{return manifest_;}
signals:void changed();
};
