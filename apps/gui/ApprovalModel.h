#pragma once
#include <QAbstractListModel>
#include <QJsonObject>
#include <QJsonArray>
#include <QTimer>
#include "ApprovalDocument.h"
class ApprovalModel:public QAbstractListModel{
 Q_OBJECT
 Q_PROPERTY(int count READ count NOTIFY changed)
 Q_PROPERTY(QString status READ status NOTIFY changed)
 Q_PROPERTY(QString selectedId READ selectedId NOTIFY changed)
 Q_PROPERTY(QString fingerprint READ fingerprint NOTIFY changed)
 Q_PROPERTY(QString detailsText READ detailsText NOTIFY detailsChanged)
 Q_PROPERTY(QString deadlineLabel READ deadlineLabel NOTIFY detailsChanged)
 Q_PROPERTY(QString risk READ risk NOTIFY changed)
 Q_PROPERTY(qint64 expiresAt READ expiresAt NOTIFY changed)
 Q_PROPERTY(bool canDecide READ canDecide NOTIFY changed)
 Q_PROPERTY(bool decisionPending READ decisionPending NOTIFY changed)
 Q_PROPERTY(ApprovalDocument* document READ document CONSTANT)
 QJsonArray rows_;QString status_="disabled",scope_,selected_,fingerprint_,details_,risk_,deadline_;qint64 expires_=0;bool pending_=false,blocked_=false;QTimer expiry_;ApprovalDocument document_;
 void clearDetails();QJsonObject selected()const;
public:
 enum Role{OperationId=Qt::UserRole+1,ToolName,Risk,Status,Summary,Output,Truncated,Targets,Fingerprint,Expires};
 explicit ApprovalModel(QObject*parent=nullptr);
 int rowCount(const QModelIndex&parent={})const override{return parent.isValid()?0:rows_.size();}
 QVariant data(const QModelIndex&,int)const override;QHash<int,QByteArray> roleNames()const override;
 int count()const{return rows_.size();}QString status()const{return status_;}QString selectedId()const{return selected_;}QString fingerprint()const{return fingerprint_;}QString detailsText()const{return details_;}QString deadlineLabel()const{return deadline_;}QString risk()const{return risk_;}
 qint64 expiresAt()const{return expires_;}bool canDecide()const;bool decisionPending()const{return pending_;}ApprovalDocument*document(){return &document_;}
 void setCacheDirectory(const QString&directory){document_.setDirectory(directory);}void setScope(const QString&);void setBlocked(bool);void invalidateReview();
 void apply(const QJsonObject&);bool select(const QString&,const QString&);void setDetails(const QJsonObject&);bool setManifest(const QJsonObject&);bool acceptChunk(const QJsonObject&);void setDecisionPending(bool);
 Q_INVOKABLE void setDetailsDisplayed(bool);
signals:void changed();void detailsChanged();
};
