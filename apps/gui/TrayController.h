#pragma once
#include <QObject>
#include <QVariantMap>
#include <QMenu>
#include <QSystemTrayIcon>
#include <QTimer>
#include <functional>
// The injected host probe exercises controller transitions without registering a host icon.
class TrayController:public QObject{
 Q_OBJECT
 Q_PROPERTY(bool available READ available NOTIFY availabilityChanged)
 Q_PROPERTY(bool enabled READ enabled NOTIFY availabilityChanged)
 Q_PROPERTY(bool effectiveHideOnClose READ effectiveHideOnClose NOTIFY availabilityChanged)
 std::function<bool()> probe_;bool simulated_=false,enabled_=false,available_=false,hideOnClose_=false,windowVisible_=true;
 QSystemTrayIcon icon_;QMenu menu_;QAction*toggle_;QTimer poll_;
 void updateMenu();void syncIcon();
public:
 explicit TrayController(std::function<bool()> probe={},QObject*parent=nullptr);
 Q_INVOKABLE void setPreferences(const QVariantMap&);Q_INVOKABLE void setStatus(const QString&);
 Q_INVOKABLE void setWindowVisible(bool);Q_INVOKABLE void pollAvailability();
 bool available()const{return available_;}bool enabled()const{return enabled_;}bool effectiveHideOnClose()const{return enabled_&&available_&&hideOnClose_;}
 QMenu*menu(){return &menu_;}QString toolTip()const{return icon_.toolTip();}
signals:void showRequested();void hideRequested();void settingsRequested();void quitRequested();void availabilityChanged();
};
