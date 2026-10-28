#pragma once
#include <QObject>
#include <QPointer>
#include <QTimer>
#include <QQuickTextDocument>
#include "SafeMarkdownDocument.h"
class MarkdownController:public QObject{
 Q_OBJECT
 Q_PROPERTY(QString source READ source NOTIFY changed)
 Q_PROPERTY(QString renderedSource READ renderedSource NOTIFY changed)
 Q_PROPERTY(QString renderError READ renderError NOTIFY changed)
 Q_PROPERTY(bool hasPendingText READ hasPendingText NOTIFY changed)
 Q_PROPERTY(int renderCount READ renderCount NOTIFY rendered)
 Q_PROPERTY(QString pendingLink READ pendingLink NOTIFY linkChanged)
 Q_PROPERTY(QVariantList codeBlocks READ codeBlocks NOTIFY changed)
 SafeMarkdownDocument*doc_;QPointer<QQuickTextDocument>quick_;QPointer<QTextDocument>original_;QTimer timer_;QString source_,rendered_,error_,link_;bool selection_=false,complete_=false;int count_=0;
 void render();void detach();void copy(const QString&);
public:
 explicit MarkdownController(QObject*parent=nullptr);~MarkdownController()override;
 SafeMarkdownDocument*document()const{return doc_;}QString source()const{return source_;}QString renderedSource()const{return rendered_;}QString renderError()const{return error_;}bool hasPendingText()const{return source_!=rendered_;}int renderCount()const{return count_;}QString pendingLink()const{return link_;}QVariantList codeBlocks()const;
 Q_INVOKABLE void attach(QQuickTextDocument*);Q_INVOKABLE void setSource(const QString&,bool complete);Q_INVOKABLE void setSelectionActive(bool);Q_INVOKABLE void copySource();Q_INVOKABLE void copyCode(int);Q_INVOKABLE void copySelection(const QString&);Q_INVOKABLE bool previewLink(const QString&);Q_INVOKABLE bool openLink();Q_INVOKABLE void dismissLink();
signals:void changed();void rendered();void copied(const QString&);void linkChanged();
};
