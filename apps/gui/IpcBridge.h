#pragma once
#include <QObject>
#include <QLocalSocket>
#include <QTimer>
#include <QElapsedTimer>
#include <QJsonObject>
#include <QJsonArray>
#include <QVariantMap>
#include <QVariantList>
#include <QSet>
#include "ChatModel.h"
#include "ApprovalModel.h"
#include "Outbox.h"
#include "GuiState.h"
#include "SourceDocument.h"
#include "SettingsController.h"
#include "ResumeIntentStore.h"
class IpcBridge:public QObject{
 Q_OBJECT
 Q_PROPERTY(SettingsController* settingsController READ settingsController CONSTANT)
 Q_PROPERTY(bool credentialReady READ credentialReady NOTIFY settingsChanged)
 Q_PROPERTY(QString connectionState READ connectionState NOTIFY changed)
 Q_PROPERTY(ChatModel* chat READ chat CONSTANT)
 Q_PROPERTY(ApprovalModel* approvals READ approvals CONSTANT)
 Q_PROPERTY(QString selectedConversationId READ selectedConversationId NOTIFY changed)
 Q_PROPERTY(QString draft READ draft NOTIFY draftChanged)
 Q_PROPERTY(QVariantList conversations READ conversations NOTIFY catalogChanged)
 Q_PROPERTY(QVariantList activity READ activity NOTIFY activityChanged)
 Q_PROPERTY(bool detailsLoading READ detailsLoading NOTIFY detailsChanged)
 Q_PROPERTY(QVariantMap activityDetails READ activityDetails NOTIFY detailsChanged)
 Q_PROPERTY(QVariantMap work READ work NOTIFY workChanged)
 Q_PROPERTY(QVariantMap usage READ usage NOTIFY usageChanged)
 Q_PROPERTY(QVariantMap uiSettings READ uiSettings NOTIFY settingsChanged)
 Q_PROPERTY(QVariantMap limits READ limits NOTIFY settingsChanged)
 Q_PROPERTY(QVariantMap toolPolicy READ toolPolicy NOTIFY settingsChanged)
 Q_PROPERTY(QVariantMap settings READ settings NOTIFY settingsChanged)
 Q_PROPERTY(QVariantList models READ models NOTIFY settingsChanged)
 Q_PROPERTY(QString partial READ partial NOTIFY changed)
 Q_PROPERTY(SourceDocument* sourceDocument READ sourceDocument CONSTANT)
 Q_PROPERTY(QString sourceText READ sourceText NOTIFY sourceChanged)
 Q_PROPERTY(bool canChangeModel READ canChangeModel NOTIFY changed)
 Q_PROPERTY(bool canCancel READ canCancel NOTIFY changed)
 Q_PROPERTY(bool resolvingSubmission READ resolvingSubmission NOTIFY changed)
 Q_PROPERTY(bool modelKnown READ modelKnown NOTIFY settingsChanged)
 Q_PROPERTY(bool busy READ busy NOTIFY changed)
 Q_PROPERTY(bool blocked READ blocked NOTIFY changed)
 Q_PROPERTY(bool credentialStored READ credentialStored NOTIFY settingsChanged)
 Q_PROPERTY(bool catalogLoading READ catalogLoading NOTIFY catalogChanged)
 Q_PROPERTY(bool chatLoading READ chatLoading NOTIFY changed)
 Q_PROPERTY(bool hasMoreConversations READ hasMoreConversations NOTIFY catalogChanged)
 Q_PROPERTY(bool hasOlderHistory READ hasOlderHistory NOTIFY changed)
 Q_PROPERTY(bool hasMoreActivity READ hasMoreActivity NOTIFY activityChanged)
 Q_PROPERTY(qint64 draftByteCount READ draftByteCount NOTIFY draftChanged)
 Q_PROPERTY(qint64 inputByteLimit READ inputByteLimit NOTIFY settingsChanged)
 Q_PROPERTY(QString error READ error NOTIFY changed)
 struct Pending{QString method,cid,purpose;QJsonObject params;quint64 selection=0,catalog=0,review=0,source=0,workVersion=0,chatVersion=0;qint64 at=0;};
 ResumeIntentStore resumeStore_;SettingsController settingsController_;QJsonObject runtimeSettings_;QString pendingLegacyKey_;bool configured_=false;
 SourceDocument sourceDocument_;ChatModel model_;ApprovalModel approvals_;Outbox outbox_;GuiState state_;QLocalSocket socket_;QTimer reconnect_,helloTimer_,draftTimer_,watchdog_,payloadTimer_,usageTimer_;QElapsedTimer clock_;
 QHash<QString,Pending> requests_;QSet<QString> retiredChats_,retiredCatalogs_,retiredEpochs_;
 QString path_,directory_,connection_="disconnected",selected_,selectedState_="idle",root_,draft_,error_,credentialError_,epoch_,chatSubscription_,catalogSubscription_,filter_,catalogRevision_,catalogNext_,historyNext_,activityNext_,partial_,sourceText_,activeIntent_,detailsRequest_;
 QJsonObject settings_,ui_,limits_,policy_,work_,usage_,details_,partialRow_,pendingDecision_,pendingGrant_,pendingActivation_;QJsonArray catalog_,rows_,activity_;QVariantList models_;
 QByteArray incoming_;quint64 selectionGeneration_=0,catalogGeneration_=0,reviewGeneration_=0,sourceGeneration_=0,chatSeq_=0,catalogSeq_=0,workVersion_=0,chatVersion_=0;
 qint64 lastUsageAt_=-500,lastChunkAt_=-12;bool createMaySelect_=false;bool sourceLoading_=false;bool stopping_=false,reportedLost_=false,hadConnected_=false,helloAnswered_=false,mismatch_=false,triedV3_=false,triedV2_=false,triedV1_=false,negotiated_=false,configReady_=false,stateOkay_=false,outboxOkay_=false,stored_=false,modelsReady_=false,selectedBarrier_=false,catalogBarrier_=false,dirty_=false,admitted_=false,followLatest_=true;int retry_=0,probeVersion_=0;
 void syncSettings();
 QString send(const QString&,const QJsonObject&params={},const QString&purpose={});void read();void frame(const QJsonObject&);void lost();void fail(const QString&);void hello();void subscribeSelected();void subscribeCatalog();void settleReady();void resumeIntents();void resend();void createPending();void refreshUsage();void refreshApprovals();void applyWork(const QJsonObject&);void applyView(const QJsonObject&,bool,bool=true);void applyCatalog(const QJsonObject&,bool);void applyActivity(const QJsonObject&,bool);void renderRows();void mergeRows(const QJsonArray&,bool);bool chunkReady();void fetchSourceChunk();void fetchReviewChunk();void rejectOutbox(const Pending&);bool flushDraft();bool hasRequest(const QString&,const QString&cid={})const;bool requestCurrent(const Pending&)const;void retire(QSet<QString>&,const QString&);void invalidateReview();
public:
 explicit IpcBridge(QString outbox,QObject*parent=nullptr);~IpcBridge()override;
 static bool peerAllowed(qintptr,uint);
 void connectToAgent(const QString&);
 QString connectionState()const{return connection_;}ChatModel*chat(){return &model_;}ApprovalModel*approvals(){return &approvals_;}
 SettingsController*settingsController(){return &settingsController_;}bool credentialReady()const{return configured_;}QJsonObject pendingRequestMetadata()const;
 SourceDocument*sourceDocument(){return &sourceDocument_;}
 Q_INVOKABLE QVariantMap restoreWindow(QObject*);Q_INVOKABLE bool saveWindowGeometry(const QJsonObject&);
 Q_INVOKABLE void loadFullSource(const QString&,int);Q_INVOKABLE void closeSource();Q_INVOKABLE void loadActivityPayload(const QString&);
 QString selectedConversationId()const{return selected_;}QString draft()const{return draft_;}QString partial()const{return partial_;}QString sourceText()const{return sourceText_;}QString error()const{return error_;}
 bool detailsLoading()const{return !detailsRequest_.isEmpty()&&requests_.contains(detailsRequest_);}
 QVariantList conversations()const{return catalog_.toVariantList();}QVariantList activity()const{return activity_.toVariantList();}QVariantMap activityDetails()const{return details_.toVariantMap();}QVariantMap usage()const{return usage_.toVariantMap();}QVariantMap work()const{return work_.toVariantMap();}QVariantMap uiSettings()const{return ui_.toVariantMap();}QVariantMap limits()const{return limits_.toVariantMap();}QVariantMap toolPolicy()const{return policy_.toVariantMap();}QVariantMap settings()const{return settings_.toVariantMap();}QVariantList models()const{return models_;}
 bool credentialStored()const{return stored_;}bool canChangeModel()const{return negotiated_&&work_.value("status")=="ready"&&!admitted_&&outbox_.pending().isEmpty();}bool canCancel()const{return negotiated_&&!work_.value("activeConversationId").toString().isEmpty();}bool resolvingSubmission()const{return admitted_||!outbox_.pending().isEmpty();}bool modelKnown()const;bool busy()const;bool blocked()const;bool catalogLoading()const{return negotiated_&&!catalogBarrier_;}bool chatLoading()const{return negotiated_&&!selected_.isEmpty()&&!selectedBarrier_;}bool hasMoreConversations()const{return !catalogNext_.isEmpty();}bool hasOlderHistory()const{return !historyNext_.isEmpty();}bool hasMoreActivity()const{return !activityNext_.isEmpty();}qint64 draftByteCount()const{return draft_.toUtf8().size();}qint64 inputByteLimit()const;
 Q_INVOKABLE bool selectConversation(const QString&);Q_INVOKABLE void editDraft(const QString&);Q_INVOKABLE bool saveDraft(const QString&);Q_INVOKABLE bool prepareClose();Q_INVOKABLE bool activate(const QJsonObject&);Q_INVOKABLE bool createConversation();Q_INVOKABLE void renameConversation(const QString&,const QString&,const QString&);Q_INVOKABLE void filterConversations(const QString&);Q_INVOKABLE void loadMore();Q_INVOKABLE void loadOlder();Q_INVOKABLE void jumpToLatest();Q_INVOKABLE void loadActivity();Q_INVOKABLE void loadActivityDetails(const QString&,const QString&);Q_INVOKABLE void loadSource(const QString&,int,qint64=0);Q_INVOKABLE void updateUiSettings(const QJsonObject&);Q_INVOKABLE void updateUiSettingsExpected(const QString&,const QJsonObject&);Q_INVOKABLE void updateLimits(const QJsonObject&);Q_INVOKABLE void updateLimitsExpected(const QString&,const QJsonObject&);Q_INVOKABLE void extendBudget(const QJsonValue&,const QJsonValue&);Q_INVOKABLE void dismissReview();Q_INVOKABLE void frontendHidden();
 Q_INVOKABLE void loadApprovalDetails(const QString&,const QString&);Q_INVOKABLE void decideApproval(const QString&,const QString&,const QString&);
 Q_INVOKABLE bool submit(const QString&);Q_INVOKABLE void cancel();Q_INVOKABLE void selectModel(const QString&,const QString&authFile={});Q_INVOKABLE void saveApiKey(const QString&);
signals:
 void changed();void viewChanged();void draftChanged();void catalogChanged();void activityChanged();void detailsChanged();void sourceChanged();void workChanged();void usageChanged();void settingsChanged();void settingsSaveResult(const QString&kind,const QString&expectedRevision,const QString&revision);void catalogAboutToChange();void activityAboutToChange();void restoreDraft(const QString&);void submitted();void activationRequested(const QJsonObject&);
};
