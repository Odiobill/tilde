#include "ChatModel.h"
#include <QJsonObject>
#include <QSet>
QVariant ChatModel::data(const QModelIndex&i,int role)const{
 if(!i.isValid()||i.row()<0||i.row()>=entries_.size())return {};const auto row=entries_[i.row()].toObject();
 switch(role){case Id:return row.value("id").toString();case Speaker:return row.value("role").toString();case Text:return row.value("text").toString();case Truncated:return row.value("truncated").toBool();case Kind:return row.value("kind").toString("message");case SourceEntry:return row.value("entryId").toString();case MessageIndex:return row.value("messageIndex").toInt();case Generation:return row.value("generationTaskId").toString();case StopReason:return row.value("stopReason").toString();case OperationId:return row.value("operationId").toString();case Fingerprint:return row.value("fingerprint").toString();case ModelName:return row.value("model").toObject().value("modelId").toString();default:return {};}
}
QHash<int,QByteArray> ChatModel::roleNames()const{return{{Id,"entryId"},{Speaker,"speaker"},{Text,"body"},{Truncated,"truncated"},{Kind,"rowKind"},{SourceEntry,"sourceEntryId"},{MessageIndex,"messageIndex"},{Generation,"generationTaskId"},{StopReason,"stopReason"},{OperationId,"operationId"},{Fingerprint,"fingerprint"},{ModelName,"provenanceModel"}};}
bool ChatModel::apply(const QJsonArray&entries){
 QSet<QString>ids;for(const auto&v:entries){const auto id=v.toObject().value("id").toString();if(id.isEmpty()||ids.contains(id))return false;ids.insert(id);}
 // The public GenerationTask provenance joins a displayed partial to its real
 // committed row. Preserve the model index; never guess a future entry ID.
 for(int i=0;i<entries_.size();++i){const auto old=entries_[i].toObject();const auto generation=old.value("generationTaskId").toString();if(old.value("kind")!="partial"||generation.isEmpty())continue;QJsonObject committed;bool stillPartial=false;for(const auto&v:entries){const auto row=v.toObject();if(row.value("generationTaskId")!=generation)continue;if(row.value("kind")=="partial")stillPartial=true;else if(row.value("kind")=="message"&&row.value("role")=="assistant")committed=row;}if(!stillPartial&&!committed.isEmpty()){entries_[i]=committed;emit dataChanged(index(i),index(i));}}
 for(int i=entries_.size()-1;i>=0;--i)if(!ids.contains(entries_[i].toObject().value("id").toString())){beginRemoveRows({},i,i);entries_.removeAt(i);endRemoveRows();}
 for(int i=0;i<entries.size();++i){const auto id=entries[i].toObject().value("id").toString();if(i<entries_.size()&&entries_[i].toObject().value("id").toString()==id){if(entries_[i]!=entries[i]){entries_[i]=entries[i];emit dataChanged(index(i),index(i));}}else{beginInsertRows({},i,i);entries_.insert(i,entries[i]);endInsertRows();}}
 if(entries_.size()>entries.size()){beginRemoveRows({},entries.size(),entries_.size()-1);while(entries_.size()>entries.size())entries_.removeLast();endRemoveRows();}return true;
}
