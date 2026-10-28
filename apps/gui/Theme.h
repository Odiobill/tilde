#pragma once
#include <QObject>
#include <QColor>
class Theme:public QObject{
 Q_OBJECT
 Q_PROPERTY(QString mode READ mode WRITE setMode NOTIFY changed)
 Q_PROPERTY(bool reducedMotion READ reducedMotion WRITE setReducedMotion NOTIFY changed)
 Q_PROPERTY(bool dark READ dark NOTIFY changed)
 Q_PROPERTY(QColor background READ background NOTIFY changed)
 Q_PROPERTY(QColor panel READ panel NOTIFY changed)
 Q_PROPERTY(QColor surface READ surface NOTIFY changed)
 Q_PROPERTY(QColor foreground READ foreground NOTIFY changed)
 Q_PROPERTY(QColor muted READ muted NOTIFY changed)
 Q_PROPERTY(QColor border READ border NOTIFY changed)
 Q_PROPERTY(QColor accent READ accent NOTIFY changed)
 Q_PROPERTY(QColor accentText READ accentText NOTIFY changed)
 Q_PROPERTY(int bodySize READ bodySize NOTIFY changed)
 Q_PROPERTY(int smallSize READ smallSize NOTIFY changed)
 QString mode_="system";
 bool reduced_=false;
public:
 explicit Theme(QObject*parent=nullptr);QString mode()const{return mode_;}void setMode(const QString&);bool dark()const;
 bool reducedMotion()const{return reduced_;}void setReducedMotion(bool value){if(reduced_!=value){reduced_=value;emit changed();}}
 QColor background()const{return dark()?QColor("#171b18"):QColor("#f7f8f3");}QColor panel()const{return dark()?QColor("#1e2420"):QColor("#eef1e9");}QColor surface()const{return dark()?QColor("#252d27"):QColor("#ffffff");}QColor foreground()const{return dark()?QColor("#e4e9df"):QColor("#273229");}QColor muted()const{return dark()?QColor("#a7b3a5"):QColor("#5f6e60");}QColor border()const{return dark()?QColor("#778672"):QColor("#7d8b74");}QColor accent()const{return dark()?QColor("#b3cc92"):QColor("#526d3d");}QColor accentText()const{return dark()?QColor("#172014"):QColor("#ffffff");}int bodySize()const;int smallSize()const{return qMax(12,qRound(bodySize()*0.8));}
signals:void changed();
};
