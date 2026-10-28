#include "SourceDocument.h"
#include "Paths.h"
#include "GuiState.h"
#include "protocol-v3.hpp"
#include <QGuiApplication>
#include <QClipboard>
#include <QJsonDocument>
#include <sys/stat.h>
QByteArray SourceDocument::identity()const{
 if(!file_||!file_->isOpen())return {};struct stat s{};
 if(fstat(file_->handle(),&s)||!S_ISREG(s.st_mode)||s.st_uid!=geteuid()||(s.st_mode&0777)!=0600||s.st_nlink!=1||s.st_size!=offset_)return {};
 return QByteArray::number(s.st_dev)+':'+QByteArray::number(s.st_ino)+':'+QByteArray::number(s.st_size)+':'+QByteArray::number(s.st_mtim.tv_sec)+':'+QByteArray::number(s.st_mtim.tv_nsec)+':'+QByteArray::number(s.st_ctim.tv_sec)+':'+QByteArray::number(s.st_ctim.tv_nsec);
}
void SourceDocument::invalidate(){file_.reset();cid_.clear();entry_.clear();message_=0;offset_=0;cacheBytes_=0;complete_=false;offsets_.clear();lengths_.clear();pages_.clear();lru_.clear();identity_.clear();manifest_={};hash_.reset();error_.clear();emit changed();}
bool SourceDocument::fail(const QString&e){invalidate();error_=e;emit changed();return false;}
bool SourceDocument::begin(const QString&cid,const QString&entry,int message){
 invalidate();if(!GuiState::validId(cid)||!GuiState::validId(entry)||message<0||!PrivatePaths::directory(directory_,true))return fail("Retained source is unavailable.");
 file_=std::make_unique<QTemporaryFile>(directory_+"/source-XXXXXX");if(!file_->open()||!file_->setPermissions(QFileDevice::ReadOwner|QFileDevice::WriteOwner)||file_->fileName().isEmpty())return fail("The private source cache is unavailable.");cid_=cid;entry_=entry;message_=message;emit changed();return true;
}
bool SourceDocument::accept(const QJsonObject&c){
 const auto text=c.value("text").toString();const auto bytes=text.toUtf8();const auto next=offset_+bytes.size();
 if(!file_||complete_||c.value("conversationId")!=cid_||c.value("entryId")!=entry_||c.value("messageIndex").toInteger(-1)!=message_||c.value("offset").toInteger(-1)!=offset_||!c.value("text").isString()||c.value("truncated")!=false||QString::fromUtf8(bytes)!=text||bytes.size()>32768||next>67108864||!manifest_.isEmpty()&&next>manifest_.value("bytes").toInteger()||c.contains("nextOffset")&&(bytes.isEmpty()||c.value("nextOffset").toInteger(-1)!=next))return fail("The retained source response is incomplete or changed.");
 if(!file_->seek(offset_)||file_->write(bytes)!=bytes.size())return fail("Could not write the private source cache.");offsets_.append(offset_);lengths_.append(bytes.size());if(!manifest_.isEmpty())hash_.addData(bytes);offset_=next;
 if(!c.contains("nextOffset")){if(!manifest_.isEmpty()&&(offset_!=manifest_.value("bytes").toInteger()||QString::fromLatin1(hash_.result().toHex())!=manifest_.value("sha256").toString()))return fail("The complete payload hash does not match its manifest.");if(!file_->flush())return fail("Could not finish the private source cache.");identity_=identity();if(identity_.isEmpty())return fail("The private source cache changed.");complete_=true;}emit changed();return true;
}
QString SourceDocument::pageAt(int index){
 if(!complete_||index<0||index>=offsets_.size())return {};if(identity()!=identity_) {fail("The private source cache changed.");return {};}
 QByteArray bytes;if(pages_.contains(index))bytes=pages_.value(index);else{if(!file_->seek(offsets_[index])){fail("Could not read retained source.");return {};}bytes=file_->read(lengths_[index]);if(bytes.size()!=lengths_[index]||file_->error()!=QFileDevice::NoError||identity()!=identity_){fail("Could not read retained source.");return {};}pages_[index]=bytes;cacheBytes_+=bytes.size();}
 lru_.removeAll(index);lru_.append(index);while(cacheBytes_>1048576||lru_.size()>32){const auto oldest=lru_.takeFirst();cacheBytes_-=pages_.take(oldest).size();}return QString::fromUtf8(bytes);
}
bool SourceDocument::copy(){
 if(!complete_||identity()!=identity_)return fail("The complete retained source is unavailable.");
 if(!file_->seek(0))return fail("Could not read retained source.");const auto bytes=file_->read(offset_);if(bytes.size()!=offset_||file_->error()!=QFileDevice::NoError||identity()!=identity_)return fail("Could not copy a complete unchanged source.");
 if(auto*clipboard=QGuiApplication::clipboard()){clipboard->setText(QString::fromUtf8(bytes));emit copied();return true;}return false;
}

bool SourceDocument::beginPayload(const QJsonObject&m){invalidate();if(!TildeProtocolV3::validatePayloadManifest(m)||!GuiState::validId(m.value("conversationId").toString())||m.value("subjectId").toString().isEmpty()||m.value("payloadId").toString().isEmpty()||(m.value("kind")!="request"&&m.value("kind")!="output")||m.value("bytes").toInteger(-1)<0||m.value("bytes").toInteger()>67108864||!PrivatePaths::directory(directory_,true))return fail("The retained payload manifest is unavailable.");file_=std::make_unique<QTemporaryFile>(directory_+"/payload-XXXXXX");if(!file_->open()||!file_->setPermissions(QFileDevice::ReadOwner|QFileDevice::WriteOwner)||file_->fileName().isEmpty())return fail("The private payload cache is unavailable.");manifest_=m;cid_=m.value("conversationId").toString();entry_=m.value("subjectId").toString();message_=0;emit changed();return true;}
bool SourceDocument::acceptPayload(const QJsonObject&c){if(manifest_.isEmpty()||c.value("payloadId")!=manifest_.value("payloadId")||!TildeProtocolV3::validateServerFrame(QJsonObject{{"v",3},{"id","chunk"},{"epoch","cache"},{"ok",true},{"result",c}}))return fail("The retained payload response changed.");QJsonObject source{{"conversationId",cid_},{"entryId",entry_},{"messageIndex",0},{"offset",c.value("offset")},{"text",c.value("text")},{"truncated",false}};if(c.contains("nextOffset"))source["nextOffset"]=c.value("nextOffset");return accept(source);}
