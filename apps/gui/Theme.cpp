#include "Theme.h"
#include <QGuiApplication>
#include <QStyleHints>
#include <QPalette>
#include <QFontInfo>
Theme::Theme(QObject*parent):QObject(parent){connect(qGuiApp,&QGuiApplication::fontChanged,this,&Theme::changed);connect(QGuiApplication::styleHints(),&QStyleHints::colorSchemeChanged,this,[this]{if(mode_=="system")emit changed();});}
void Theme::setMode(const QString&mode){if((mode!="system"&&mode!="light"&&mode!="dark")||mode==mode_)return;mode_=mode;emit changed();}
bool Theme::dark()const{if(mode_=="dark")return true;if(mode_=="light")return false;const auto scheme=QGuiApplication::styleHints()->colorScheme();return scheme==Qt::ColorScheme::Dark||(scheme==Qt::ColorScheme::Unknown&&QGuiApplication::palette().window().color().lightness()<128);}

int Theme::bodySize()const{const auto font=QGuiApplication::font();return qMax(15,font.pixelSize()>0?font.pixelSize():QFontInfo(font).pixelSize());}
