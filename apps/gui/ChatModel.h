#pragma once
#include <QAbstractListModel>
#include <QJsonArray>
#include <QJsonObject>
class ChatModel:public QAbstractListModel {
 Q_OBJECT
 QJsonArray entries_;
public:
 enum Role {Id=Qt::UserRole+1,Speaker,Text,Truncated,Kind,SourceEntry,MessageIndex,Generation,StopReason,OperationId,Fingerprint,ModelName};
 using QAbstractListModel::QAbstractListModel;
 int rowCount(const QModelIndex &parent={})const override{return parent.isValid()?0:entries_.size();}
 QVariant data(const QModelIndex &index,int role)const override;
 QHash<int,QByteArray> roleNames()const override;
 Q_INVOKABLE QString idAt(int row)const{return row>=0&&row<entries_.size()?entries_[row].toObject().value("id").toString():QString();}
 Q_INVOKABLE int indexOfId(const QString&id)const{for(int i=0;i<entries_.size();++i)if(entries_[i].toObject().value("id")==id)return i;return -1;}
 bool apply(const QJsonArray &entries);
};
