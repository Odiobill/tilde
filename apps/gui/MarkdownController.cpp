#include "MarkdownController.h"
#include "LinkPolicy.h"
#include <QGuiApplication>
#include <QClipboard>
#include <QDesktopServices>
#include <QAbstractTextDocumentLayout>
#include <QRegularExpression>
#include <QThread>
#include <QTextTable>
#include <QTextCursor>
#include <QFontMetricsF>
MarkdownController::MarkdownController(QObject*parent):QObject(parent),doc_(new SafeMarkdownDocument(this)){
 doc_->setUndoRedoEnabled(false);doc_->setBaseUrl({});doc_->setMetaInformation(QTextDocument::DocumentUrl,{});doc_->setDefaultStyleSheet({});
 timer_.setSingleShot(true);timer_.setInterval(100);timer_.setTimerType(Qt::PreciseTimer);connect(&timer_,&QTimer::timeout,this,&MarkdownController::render);
}
MarkdownController::~MarkdownController(){detach();}
void MarkdownController::detach(){
 if(quick_&&quick_->textDocument()==doc_){if(original_)quick_->setTextDocument(original_);else quick_->setTextDocument(new SafeMarkdownDocument(quick_));}
 quick_.clear();original_.clear();
}
void MarkdownController::attach(QQuickTextDocument*quick){
 Q_ASSERT(QThread::currentThread()==thread());if(quick==quick_)return;detach();if(!quick)return;
 quick_=quick;original_=quick->textDocument();doc_->setDefaultFont(original_?original_->defaultFont():QGuiApplication::font());quick_->setTextDocument(doc_);
}
void MarkdownController::setSource(const QString&s,bool complete){
 Q_ASSERT(QThread::currentThread()==thread());if(s==source_&&complete==complete_)return;
 auto bytes=s.toUtf8();if(s!=source_)error_.clear();if(bytes.size()>32768){int n=32768;while(n>0&&(quint8(bytes[n])&0xc0)==0x80)--n;bytes.truncate(n);error_="Display preview truncated. Inspect the complete retained source.";}
 source_=QString::fromUtf8(bytes);complete_=complete;emit changed();if(selection_)return;if(complete){timer_.stop();render();}else if(!timer_.isActive())timer_.start();
}
void MarkdownController::render(){
 if(selection_||source_==rendered_&&count_>0)return;const auto before=doc_->deniedResources();
 doc_->setMarkdown(source_,QTextDocument::MarkdownFeatures(QTextDocument::MarkdownDialectGitHub)|QTextDocument::MarkdownNoHTML);
 // Preserve a table's natural columns instead of squeezing every cell into
 // the paragraph width. QTextDocument can overflow this frame while prose
 // keeps wrapping at the Quick editor width; the containing view scrolls it.
 const QFontMetricsF metrics(doc_->defaultFont());
 auto tables=[&](auto&&self,QTextFrame*frame)->void{for(auto it=frame->begin();!it.atEnd();++it)if(auto*child=it.currentFrame()){if(auto*table=qobject_cast<QTextTable*>(child)){QList<QTextLength> widths;qreal total=0;for(int col=0;col<table->columns();++col){qreal width=96;for(int row=0;row<table->rows();++row){const auto cell=table->cellAt(row,col);auto cursor=cell.firstCursorPosition();cursor.setPosition(cell.lastCursorPosition().position(),QTextCursor::KeepAnchor);width=qMax(width,qMin(qreal(320),metrics.horizontalAdvance(cursor.selectedText())+20));}widths.append(QTextLength(QTextLength::FixedLength,width));total+=width;}auto format=table->format();format.setColumnWidthConstraints(widths);format.setWidth(QTextLength(QTextLength::FixedLength,total));table->setFormat(format);}self(self,child);}};
 tables(tables,doc_->rootFrame());
 // Force native layout while this parse is current so a denied image cannot
 // trigger a later alternate Quick image-loading path or hidden fallback.
 doc_->documentLayout()->documentSize();
 if(doc_->deniedResources()!=before){error_="External images and resources are blocked. Showing literal source.";doc_->setPlainText(source_);}
 rendered_=source_;++count_;emit changed();emit rendered();
}
void MarkdownController::setSelectionActive(bool active){if(active==selection_)return;selection_=active;if(active)timer_.stop();else if(hasPendingText()){if(complete_)render();else timer_.start();}emit changed();}
QVariantList MarkdownController::codeBlocks()const{
 QVariantList blocks;QString mark,body,language;const QRegularExpression fence("^ {0,3}(`{3,}|~{3,})(.*)$");
 const auto lines=rendered_.split('\n');for(int i=0;i<lines.size();++i){const auto line=lines[i];const auto match=fence.match(line);if(mark.isEmpty()){if(match.hasMatch()){mark=match.captured(1);language=match.captured(2).trimmed();body.clear();}}else if(match.hasMatch()&&match.captured(1)[0]==mark[0]&&match.captured(1).size()>=mark.size()&&match.captured(2).trimmed().isEmpty()){blocks.append(QVariantMap{{"language",language},{"text",body}});mark.clear();}else{body+=line;if(i+1<lines.size())body+='\n';}}
 if(!mark.isEmpty())blocks.append(QVariantMap{{"language",language},{"text",body}});return blocks;
}
void MarkdownController::copy(const QString&text){if(auto*clipboard=QGuiApplication::clipboard()){clipboard->setText(text);emit copied(text);}}
void MarkdownController::copySource(){copy(source_);}void MarkdownController::copyCode(int index){const auto blocks=codeBlocks();if(index>=0&&index<blocks.size())copy(blocks[index].toMap().value("text").toString());}void MarkdownController::copySelection(const QString&text){if(text.toUtf8().size()<=32768)copy(text);}
bool MarkdownController::previewLink(const QString&text){
 link_.clear();for(const auto c:text)if(c.category()==QChar::Other_Control||c.category()==QChar::Other_Format){emit linkChanged();return false;}
 const QUrl url(text,QUrl::StrictMode);if(text.toUtf8().size()>8192||!LinkPolicy::allowed(url)){emit linkChanged();return false;}link_=QString::fromLatin1(url.toEncoded());emit linkChanged();return true;
}
bool MarkdownController::openLink(){const auto text=link_;dismissLink();const QUrl url(text,QUrl::StrictMode);return !text.isEmpty()&&LinkPolicy::allowed(url)&&QDesktopServices::openUrl(url);}
void MarkdownController::dismissLink(){if(link_.isEmpty())return;link_.clear();emit linkChanged();}
