#include <QtTest>
#include <QTemporaryDir>
#include "GuiState.h"
#include "Outbox.h"
#include "ResumeIntentStore.h"
class StorageDurabilityTest:public QObject{
 Q_OBJECT
 struct Fault{explicit Fault(const QString&root,bool file=false){qputenv("TILDE_TEST_FSYNC_ROOT",root.toUtf8());if(file)qputenv("TILDE_TEST_FSYNC_FILE","1");}~Fault(){qunsetenv("TILDE_TEST_FSYNC_ROOT");qunsetenv("TILDE_TEST_FSYNC_FILE");}};
 static QJsonObject request(){return{{"conversationId","1"},{"requestId","retained"},{"text","synthetic"},{"selectionRevision","revision"}};}
 static QJsonObject intent(){return{{"intentId","intent"},{"conversationId","1"},{"runId","2"},{"taskId","3"},{"expectedWorkRevision","4"}};}
private slots:
 void fileDataFailureNeverAcknowledgesOutbox(){QTemporaryDir d;Outbox box(d.filePath("outbox.json"));Fault fault(d.path(),true);QVERIFY(!box.save(request()));QVERIFY(box.pending().isEmpty());}
 void fileDataFailureNeverAcknowledgesState(){QTemporaryDir d;GuiState state(d.filePath("state.json"));QVERIFY(state.load());Fault fault(d.path(),true);QVERIFY(!state.setSelection("1"));}
 void fileDataFailureNeverAcknowledgesResume(){QTemporaryDir d;ResumeIntentStore store(d.filePath("resume.json"));Fault fault(d.path(),true);QVERIFY(!store.save(intent()));}
 void directoryFailureNeverAcknowledgesOutbox(){QTemporaryDir d;Outbox box(d.filePath("outbox.json"));Fault fault(d.path());QVERIFY(!box.save(request()));QVERIFY(box.pending().isEmpty());}
 void directoryFailureNeverAcknowledgesOutboxRemoval(){QTemporaryDir d;Outbox box(d.filePath("outbox.json"));QVERIFY(box.save(request()));Fault fault(d.path());QVERIFY(!box.clear());QCOMPARE(box.pending(),request());}
 void directoryFailureNeverAcknowledgesSelection(){QTemporaryDir d;GuiState state(d.filePath("state.json"));QVERIFY(state.load());Fault fault(d.path());QVERIFY(!state.setSelection("1"));QVERIFY(state.selection().isEmpty());QCOMPARE(state.error(),QString("GUI_STATE_UNAVAILABLE"));}
 void newDraftDirectoryFailureNeverAcknowledgesDraft(){QTemporaryDir d;GuiState state(d.filePath("state.json"));QVERIFY(state.load());Fault fault(d.path());QVERIFY(!state.setDraft("1","must not acknowledge"));QCOMPARE(state.error(),QString("DRAFT_UNAVAILABLE"));}
 void directoryFailureNeverAcknowledgesStartupDraft(){QTemporaryDir d;GuiState state(d.filePath("state.json"));QVERIFY(state.load());Fault fault(d.path());QVERIFY(!state.setStartupDraft("must not acknowledge"));}
 void directoryFailureNeverAcknowledgesResumeIntent(){QTemporaryDir d;ResumeIntentStore store(d.filePath("resume.json"));Fault fault(d.path());QVERIFY(!store.save(intent()));QVERIFY(store.pending().isEmpty());}
 void directoryFailureNeverAcknowledgesResumeRemoval(){QTemporaryDir d;ResumeIntentStore store(d.filePath("resume.json"));QVERIFY(store.save(intent()));Fault fault(d.path());QVERIFY(!store.clear());QCOMPARE(store.pending(),intent());}
};
QTEST_GUILESS_MAIN(StorageDurabilityTest)
#include "tst_storage_durability.moc"
