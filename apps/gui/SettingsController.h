#pragma once
#include <QObject>
#include <QJsonObject>
#include <QJsonArray>
#include <QVariantMap>
#include <QVariantList>
#include <QUrl>
#include <QSet>
#include <QHash>
#include <functional>
class ResumeIntentStore;
class SettingsController:public QObject{
 Q_OBJECT
 Q_PROPERTY(QVariantMap settings READ settings NOTIFY changed)
 Q_PROPERTY(QVariantMap modelSelection READ modelSelection NOTIFY changed)
 Q_PROPERTY(int modelSelectionIndex READ modelSelectionIndex NOTIFY changed)
 Q_PROPERTY(bool modelSelectionAvailable READ modelSelectionAvailable NOTIFY changed)
 Q_PROPERTY(QVariantList providers READ providers NOTIFY changed)
 Q_PROPERTY(QVariantList models READ models NOTIFY changed)
 Q_PROPERTY(QVariantMap target READ target NOTIFY changed)
 Q_PROPERTY(QVariantMap definition READ definition NOTIFY changed)
 Q_PROPERTY(QVariantMap authStatus READ authStatus NOTIFY changed)
 Q_PROPERTY(QVariantMap authSession READ authSession NOTIFY authChanged)
 Q_PROPERTY(QVariantMap catalogRefresh READ catalogRefresh NOTIFY changed)
 Q_PROPERTY(QVariantMap uiSettings READ uiSettings NOTIFY settingsChanged)
 Q_PROPERTY(QVariantMap preferences READ preferences NOTIFY settingsChanged)
 Q_PROPERTY(QVariantMap limits READ limits NOTIFY settingsChanged)
 Q_PROPERTY(QVariantMap toolPolicy READ toolPolicy NOTIFY changed)
 Q_PROPERTY(QVariantMap work READ work NOTIFY changed)
 Q_PROPERTY(QString error READ error NOTIFY changed)
 Q_PROPERTY(bool dirty READ dirty NOTIFY changed)
 Q_PROPERTY(bool conflict READ conflict NOTIFY changed)
 Q_PROPERTY(bool providersMore READ providersMore NOTIFY changed)
 Q_PROPERTY(bool modelsMore READ modelsMore NOTIFY changed)
 Q_PROPERTY(bool canMutate READ canMutate NOTIFY changed)
 Q_PROPERTY(bool repairingRetained READ repairingRetained NOTIFY changed)
 using SendRpc=std::function<QString(const QString&,const QJsonObject&,const QString&)>;
 QJsonObject modelSelection_;QString modelSelectionRevision_;
 QJsonObject settings_,target_,definition_,status_,session_,refresh_,ui_,prefs_,limits_,policy_,work_;QJsonArray providers_,models_;QString providerNext_,modelNext_,providerQuery_,modelQuery_,error_,epoch_,clientId_,prefsRevision_;bool dirty_=false,conflict_=false;quint64 generation_=0,providerGeneration_=0,modelGeneration_=0,authGeneration_=0;QSet<QString>dirtyDomains_;int providerPages_=0,modelPages_=0;
 struct Pending{QString method,purpose;quint64 generation;quint64 page=0,auth=0;QJsonObject sentPreferences;};QHash<QString,Pending>pending_;SendRpc transport_;ResumeIntentStore*resume_=nullptr;std::function<bool(const QUrl&)>browser_;
 QString send(const QString&,const QJsonObject&params={},const QString&purpose={});QJsonObject fence(const QJsonObject&)const;void acceptAuth(const QJsonObject&);void setError(const QString&);
public:
 explicit SettingsController(QObject*parent=nullptr);void attachTransport(SendRpc);void attachResumeStore(ResumeIntentStore*);void setBrowserOpener(std::function<bool(const QUrl&)>);
 void setConnectionIdentity(const QString&,const QString&);void setRuntimeSettings(const QJsonObject&);void setWorkspace(const QJsonObject&,const QJsonObject&);void handleReply(const QString&,const QString&,const QJsonObject&);void handleFailure(const QString&,const QString&);void handleAuthEvent(const QJsonObject&);void handleCatalogRefreshEvent(const QJsonObject&);void resetConnection();QJsonObject pendingMetadata()const;
 QVariantMap modelSelection()const{return modelSelection_.toVariantMap();}int modelSelectionIndex()const;bool modelSelectionAvailable()const{return modelSelectionIndex()>=0;}
 QVariantMap settings()const{return settings_.toVariantMap();}QVariantList providers()const{return providers_.toVariantList();}QVariantList models()const{return models_.toVariantList();}QVariantMap target()const{return target_.toVariantMap();}QVariantMap definition()const{return definition_.toVariantMap();}QVariantMap authStatus()const{return status_.toVariantMap();}QVariantMap authSession()const{return session_.toVariantMap();}QVariantMap catalogRefresh()const{return refresh_.toVariantMap();}QVariantMap uiSettings()const{return ui_.toVariantMap();}QVariantMap preferences()const{return prefs_.toVariantMap();}QVariantMap limits()const{return limits_.toVariantMap();}QVariantMap toolPolicy()const{return policy_.toVariantMap();}QVariantMap work()const{return work_.toVariantMap();}QString error()const{return error_;}bool dirty()const{return dirty_;}bool conflict()const{return conflict_;}bool providersMore()const{return!providerNext_.isEmpty();}bool modelsMore()const{return!modelNext_.isEmpty();}bool repairingRetained()const;bool canMutate()const;bool setupActive()const;
 Q_INVOKABLE void reloadModelSelection();Q_INVOKABLE void chooseModel(int);Q_INVOKABLE void applyModelSelection();
 Q_INVOKABLE void repairRetainedConnection();Q_INVOKABLE void reload();Q_INVOKABLE void inspectProvider(QVariantMap);Q_INVOKABLE void newConnection();Q_INVOKABLE void loadProviders(QString,bool more=false);Q_INVOKABLE void loadModels(QVariantMap,QString,bool more=false);Q_INVOKABLE void applySelection(QVariantMap);Q_INVOKABLE void applyStore(QString);Q_INVOKABLE void saveConnection(QVariantMap);Q_INVOKABLE void removeConnection(QString);Q_INVOKABLE void startAuth(QVariantMap,QString);Q_INVOKABLE void respondAuth(QString,QString);Q_INVOKABLE void cancelAuth();Q_INVOKABLE void removeCredentials(QVariantMap);Q_INVOKABLE void refreshModels(QVariantMap);Q_INVOKABLE void cancelModelRefresh();Q_INVOKABLE void openAuthBrowser();Q_INVOKABLE void openAuthInfoLink(int index);Q_INVOKABLE void copyDeviceCode();Q_INVOKABLE void resumeAuth(QVariantMap);Q_INVOKABLE void setPreference(QString,QVariant);Q_INVOKABLE void applyPreferences();Q_INVOKABLE void reloadPreferences();Q_INVOKABLE void markDirty(QString domain="provider");Q_INVOKABLE void discardDrafts();Q_INVOKABLE void leavePage();Q_INVOKABLE void updateLimitsExpected(const QString&,const QJsonObject&);
signals:void changed();void authChanged();void settingsChanged();void settingsSaveResult(const QString&,const QString&,const QString&);
};
