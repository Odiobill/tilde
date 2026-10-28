#include "V4FixtureSettings.h"
#pragma once
#include <QLocalServer>
#include <QLocalSocket>
#include <QJsonDocument>
#include <QJsonArray>
#include <QTemporaryDir>
#include <QPointer>
#include <QDateTime>
#include <QElapsedTimer>
#include <QCryptographicHash>
struct WirePeer {
 bool fixtureStored=true;QJsonObject fixtureAuth;
 QTemporaryDir home;QLocalServer server;QPointer<QLocalSocket> peer;QString epoch="epoch",subscription;int subscriptions=0;bool dropAck=false,holdSubmit=false,deduplicated=true;QString heldId;QJsonArray entries,operations;QJsonObject details;QList<QJsonObject> submissions,decisions;bool holdDetails=false,dropDecisionAck=false,enforceRate=false;QElapsedTimer rateClock;int received=0,rateRejections=0;QByteArray requestBytes;
 QJsonObject settings()const{return {{"version",1},{"providerId","opencode-go"},{"modelId","deepseek-v4.1-flash"},{"authFile",home.filePath("auth.json")},{"store","separate"},{"selectionRevision","revision"}};}
 QJsonObject prefs()const{return{{"version",1},{"theme","system"},{"trayEnabled",true},{"hideOnClose",false},{"notifyCompletion",false},{"notifyAttention",false},{"revision","ui-revision"}};}
 QJsonObject limits()const{return{{"revision","limits-revision"},{"retentionSource","default"},{"effectiveModel",QJsonObject{{"providerId","opencode-go"},{"modelId","deepseek-v4.1-flash"},{"outputTokens",8192}}},{"settings",QJsonObject{{"version",1},{"providerRequests",64},{"toolOperations",256},{"providerTimeoutMs",180000},{"outputTokens",8192},{"modelOutputOverrides",QJsonArray{}},{"shellTimeoutMs",3600000},{"inputBytes",65536},{"fileReadBytes",1048576},{"fileWriteBytes",1048576},{"retainedOutputBytes",1048576},{"modelOutputBytes",65536},{"retentionDays",30},{"retentionBytes",536870912}}}};}
 QJsonObject work()const{QJsonObject w{{"revision","1"},{"status",operations.isEmpty()?"ready":"waiting_for_approval"},{"attention",operations},{"catalogStatus","ready"},{"desktopStatus","disabled"}};if(!operations.isEmpty()){w["activeConversationId"]="1";w["activeRunId"]="2";}return w;}
 QJsonObject catalog()const{return {{"revision","1"},{"refreshing",false},{"conversations",QJsonArray{QJsonObject{{"id","1"},{"title","Root"},{"metadataRevision","1"}}}}};}
 QJsonObject chatView()const{QJsonArray rows;int i=1;for(const auto&v:entries){auto row=v.toObject();row["kind"]="message";row["entryId"]=QString::number(i++);row["messageIndex"]=0;rows.append(row);}return {{"conversationId","1"},{"rows",rows},{"state","idle"}};}
 QJsonObject view()const{QJsonArray activity;for(const auto&v:operations){auto op=v.toObject();op["conversationId"]="1";op["runId"]="2";op["toolTaskId"]="3";op["callId"]="call";op["payload"]="retained";activity.append(op);}return {{"chat",chatView()},{"activity",QJsonObject{{"conversationId","1"},{"revision","0"},{"operations",activity}}},{"work",work()}};}
 WirePeer(){rateClock.start();server.setSocketOptions(QLocalServer::UserAccessOption);server.listen(home.filePath("socket"));QObject::connect(&server,&QLocalServer::newConnection,&server,[this]{peer=server.nextPendingConnection();auto *connection=peer.data();QObject::connect(connection,&QLocalSocket::disconnected,connection,&QObject::deleteLater);QObject::connect(connection,&QLocalSocket::readyRead,&server,[this,connection]{while(connection->canReadLine()){const auto r=QJsonDocument::fromJson(connection->readLine()).object();if(rateClock.elapsed()>=1000){rateClock.restart();received=0;}if(enforceRate&&++received>128){rateRejections++;connection->abort();return;}const auto method=r.value("method").toString();QJsonObject result;
  if(method=="system.hello")result={{"protocolVersion",4},{"clientId","fixture-client"},{"capabilities",QJsonObject{{"tools",true},{"codeMode",false},{"history",true},{"markdown",true},{"tray",true},{"notifications",true}}},{"rootConversationId","1"},{"ui",prefs()},{"limits",limits()},{"work",work()},{"settings",v4Settings(settings(),true)}};
  else if(method=="settings.get")result=v4Settings(settings(),fixtureStored);
  else if(method=="limits.get")result=limits();
  else if(method=="ui.settings.get")result=prefs();
  else if(method=="providers.list")result={{"revision","providers"},{"providers",QJsonArray{QJsonObject{{"connectionId","builtin:opencode-go"},{"definitionRevision",QString(64,'a')},{"providerId","opencode-go"},{"kind","builtin"},{"name","OpenCode Go"},{"disabled",false},{"methods",v4Status(settings(),fixtureStored).value("methods")}}}}};
  else if(method=="providers.get")result=v4Definition(settings());
  else if(method=="credentials.status"||method=="credentials.remove")result=v4Status(settings(),fixtureStored);
  else if(method=="auth.start"){fixtureAuth={{"sessionId","fixture-session"},{"operationId",r.value("params").toObject().value("operationId")},{"ownerId","fixture-client"},{"target",r.value("params").toObject().value("target")},{"seq","1"},{"state","waiting"},{"expiresInMs",900000},{"prompt",QJsonObject{{"id","fixture-prompt"},{"type","secret"},{"message","Enter fixture key"}}}};result=fixtureAuth;}
  else if(method=="auth.respond"){fixtureStored=true;fixtureAuth["state"]="succeeded";fixtureAuth["seq"]="2";fixtureAuth.remove("prompt");result=fixtureAuth;}
  else if(method=="auth.cancel"){fixtureAuth["state"]="cancelled";fixtureAuth["seq"]="3";fixtureAuth.remove("prompt");result=fixtureAuth;}
  else if(method=="auth.status")result=fixtureAuth;
  else if(method=="models.list")result={{"revision","models"},{"models",QJsonArray{v4Model()}}};
  else if(method=="conversations.subscribe")result={{"epoch",epoch},{"subscriptionId","catalog"},{"seq","0"},{"page",catalog()},{"work",work()}};
  else if(method=="tools.policy")result={{"roots",QJsonArray{"/work"}},{"policyRevision","policy"},{"retentionDays",30},{"requestLimit",64},{"toolLimit",256},{"unrestrictedShell",true}};
  else if(method=="approvals.manifest"){if(holdDetails)return;requestBytes=QJsonDocument(details.value("request").toObject()).toJson(QJsonDocument::Compact);const auto&raw=requestBytes;result={{"conversationId","1"},{"operationId",details.value("operationId")},{"fingerprint",details.value("fingerprint")},{"payloadId","payload"},{"sha256",QString::fromLatin1(QCryptographicHash::hash(raw,QCryptographicHash::Sha256).toHex())},{"bytes",raw.size()},{"chunkBytes",32768},{"risk",details.value("risk")},{"expiresAt",details.value("expiresAt")}};}
  else if(method=="approvals.chunk"){const auto&raw=requestBytes;const auto offset=r.value("params").toObject().value("offset").toInteger();auto end=qMin(qint64(raw.size()),offset+32768);while(end<raw.size()&&(quint8(raw[end])&0xc0)==0x80)--end;result={{"payloadId","payload"},{"offset",offset},{"text",QString::fromUtf8(raw.mid(offset,end-offset))}};if(end<raw.size())result["nextOffset"]=end;}

  else if(method=="activity.usage")result={{"usage",QJsonValue::Null}};
  else if(method=="activity.get"){auto op=operations.first().toObject();op["conversationId"]="1";result={{"conversationId","1"},{"operationId",op.value("id")},{"fingerprint",op.value("fingerprint")},{"payload","retained"},{"requestText",QString::fromUtf8(QJsonDocument(details.value("request").toObject()).toJson(QJsonDocument::Compact))},{"requestTruncated",false},{"output",""},{"outputTruncated",false},{"operation",op}};}
  else if(method=="approvals.get"){if(holdDetails)return;result=details;}
  else if(method=="approvals.decide"){const auto params=r.value("params").toObject();decisions.append(params);if(dropDecisionAck){dropDecisionAck=false;connection->abort();return;}result={{"decisionId",params.value("decisionId")},{"operation",[this]{auto op=operations.first().toObject();op["conversationId"]="1";return op;}()}};}
  else if(method=="conversation.get")result=view();
  else if(method=="conversation.subscribe"){subscription="sub-"+QString::number(++subscriptions);result={{"epoch",epoch},{"subscriptionId",subscription},{"seq","0"},{"view",view()},{"settings",v4Settings(settings(),true)}};}
  else if(method=="conversation.submit"){const auto params=r.value("params").toObject();submissions.append(params);if(holdSubmit){heldId=r.value("id").toString();return;}if(entries.isEmpty()){entries.append(QJsonObject{{"id","user1"},{"role","user"},{"text",params.value("text")},{"truncated",false}});entries.append(QJsonObject{{"id","assistant1"},{"role","assistant"},{"text","durable final"},{"truncated",false}});}if(dropAck){dropAck=false;connection->abort();return;}result={{"submissionId","original"},{"deduplicated",deduplicated}};}
  else if(method=="credentials.store")result={{"providerId","opencode-go"},{"credentialStored",true},{"store","separate"}};
  send({{"v",4},{"id",r.value("id")},{"epoch",epoch},{"ok",true},{"result",result}});
 }});});}
 ~WirePeer(){if(peer){peer->disconnect(&server);peer->abort();}server.close();}
 void send(const QJsonObject &frame){if(peer)peer->write(QJsonDocument(frame).toJson(QJsonDocument::Compact)+"\n");}
 void update(const QString &sub,const QString &seq){send({{"v",4},{"event","conversation.updated"},{"epoch",epoch},{"subscriptionId",sub},{"seq",seq},{"view",view()}});}
};
