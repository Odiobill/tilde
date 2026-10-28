#include "TrayController.h"
#include <QPainter>
TrayController::TrayController(std::function<bool()> probe,QObject*parent):QObject(parent),probe_(std::move(probe)),simulated_(bool(probe_)){
 if(!probe_)probe_=[]{return QSystemTrayIcon::isSystemTrayAvailable();};
 QPixmap mark(32,32);mark.fill(Qt::transparent);QPainter painter(&mark);painter.setRenderHint(QPainter::Antialiasing);painter.setPen(QColor("#75985b"));auto font=painter.font();font.setPixelSize(30);font.setBold(true);painter.setFont(font);painter.drawText(mark.rect(),Qt::AlignCenter,"~");painter.end();icon_.setIcon(QIcon(mark));icon_.setToolTip("Tilde");
 toggle_=menu_.addAction("Hide Tilde");connect(toggle_,&QAction::triggered,this,[this]{if(windowVisible_)emit hideRequested();else emit showRequested();});
 connect(menu_.addAction("Settings…"),&QAction::triggered,this,&TrayController::settingsRequested);
 connect(menu_.addAction("Quit frontend"),&QAction::triggered,this,&TrayController::quitRequested);icon_.setContextMenu(&menu_);
 connect(&icon_,&QSystemTrayIcon::activated,this,[this](QSystemTrayIcon::ActivationReason reason){if(reason==QSystemTrayIcon::Trigger){if(windowVisible_)emit hideRequested();else emit showRequested();}});
 poll_.setInterval(1000);connect(&poll_,&QTimer::timeout,this,&TrayController::pollAvailability);
}
void TrayController::updateMenu(){toggle_->setText(windowVisible_?"Hide Tilde":"Show Tilde");}
void TrayController::syncIcon(){if(!simulated_)icon_.setVisible(enabled_&&available_);}
void TrayController::setPreferences(const QVariantMap&p){const bool wasRecoverable=enabled_&&available_;enabled_=p.value("trayEnabled",true).toBool();hideOnClose_=p.value("hideOnClose",false).toBool();available_=enabled_&&probe_();if(enabled_)poll_.start();else poll_.stop();syncIcon();emit availabilityChanged();if(wasRecoverable&&(!enabled_||!available_)&&!windowVisible_)emit showRequested();}
void TrayController::pollAvailability(){const bool next=enabled_&&probe_();if(next==available_)return;const bool lost=available_&&!next;available_=next;syncIcon();emit availabilityChanged();if(lost&&!windowVisible_)emit showRequested();}
void TrayController::setWindowVisible(bool visible){windowVisible_=visible;updateMenu();}
void TrayController::setStatus(const QString&status){const QString suffix=status=="running"?" · Working":status=="waiting_for_approval"||status=="budget_paused"||status=="blocked"||status=="outcome_unknown"||status=="concurrent_recovery"||status=="storage_failed"?" · Attention needed":"";icon_.setToolTip("Tilde"+suffix);}
