import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
Pane {
 id: inspector;
 property string anchorId: ""
 property real anchorOffset: 0
 function remember() { anchorId="";for(var i=0;i<activityCards.count;i++){var card=activityCards.itemAt(i);if(card&&card.y+card.height>activityScroll.contentItem.contentY){anchorId=card.operationId;anchorOffset=activityScroll.contentItem.contentY-card.y;return}} }
 function restore(){if(!anchorId.length)return;for(var i=0;i<activityCards.count;i++){var card=activityCards.itemAt(i);if(card&&card.operationId===anchorId){activityScroll.contentItem.contentY=Math.max(0,card.y+anchorOffset);return}}}
 Connections { target: bridge; function onActivityAboutToChange(){inspector.remember()} function onActivityChanged(){Qt.callLater(inspector.restore)} } objectName: "activityInspector"
 required property var bridge
 property bool sourceMode: false
 signal payloadRequested(string kind)
 signal closeRequested()
 signal reviewRequested(string operationId,string fingerprint)
 padding: 12
 background: Rectangle { color: Theme.panel }
 ColumnLayout {
  anchors.fill: parent; spacing: 10
  RowLayout { Layout.fillWidth: true
   Label { text: inspector.sourceMode ? "Retained text" : "Activity"; font.pixelSize:Math.round(Theme.bodySize*19/15); font.bold: true; Layout.fillWidth: true }
   ToolButton { text: "Close"; onClicked: { if(inspector.sourceMode)bridge.closeSource();inspector.closeRequested() } }
  }
  Label { Layout.fillWidth: true; text: inspector.sourceMode ? (bridge.sourceDocument.error || (bridge.sourceDocument.complete ? bridge.sourceDocument.byteCount+" bytes · complete" : bridge.sourceDocument.byteCount+" bytes received…")) : "Verified operations from the local journal"; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
  ListView { id:sourcePages;Accessible.role:Accessible.List;Accessible.name:"Complete retained text";activeFocusOnTab:true;keyNavigationEnabled:true;currentIndex:0;Keys.onPressed:function(event){if(event.key===Qt.Key_Home){sourcePages.currentIndex=0;event.accepted=true}else if(event.key===Qt.Key_End){sourcePages.currentIndex=sourcePages.count-1;event.accepted=true}else event.accepted=false} visible: inspector.sourceMode; Layout.fillWidth: true; Layout.fillHeight: true; clip: true; model: bridge.sourceDocument.pageCount; cacheBuffer: 0
   ScrollBar.vertical: ScrollBar {}
   delegate: TextArea { required property int index;Accessible.name:"Retained text page "+(index+1)+" of "+sourcePages.count;activeFocusOnTab:true; width: ListView.view.width; readOnly: true; selectByMouse: true; textFormat: TextEdit.PlainText; wrapMode: TextEdit.WrapAnywhere; text: bridge.sourceDocument.pageAt(index); background: null }
  }
  Button { visible: inspector.sourceMode; text: "Copy complete text"; enabled: bridge.sourceDocument.complete; onClicked: bridge.sourceDocument.copy() }
  ScrollView { id: activityScroll;objectName: "activityScroll"; visible: !inspector.sourceMode; Layout.fillWidth: true; Layout.fillHeight: true; clip: true; contentWidth: availableWidth
   ColumnLayout { width: parent.width; spacing: 12
    Repeater { id: activityCards; model: bridge.activity
     delegate: ToolCard { required property var modelData; Layout.fillWidth: true; operationId: modelData.id; fingerprint: modelData.fingerprint; operation: modelData; onInspectRequested: function(id,fp){bridge.loadActivityDetails(id,fp)} onReviewRequested: function(id,fp){inspector.reviewRequested(id,fp)} }
    }
    Button { visible: bridge.hasMoreActivity; text: "Older operations"; onClicked: bridge.loadActivity() }
    Label { visible: !!bridge.activityDetails.operationId; text: bridge.detailsLoading ? "Loading selected operation…" : "Selected operation"; font.bold: true }
    Label { Layout.fillWidth: true; visible: !!bridge.activityDetails.payload; text: bridge.activityDetails.payload==="retained" ? "Retained receipt" : bridge.activityDetails.payload==="pruned" ? "Payload pruned · identity and receipt status retained" : "Payload unavailable"; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
    TextArea { Layout.fillWidth: true; readOnly: true; selectByMouse: true; wrapMode: TextEdit.WrapAnywhere; textFormat: TextEdit.PlainText; Accessible.name:"Request preview";text: bridge.activityDetails.requestText||""; background: null }
    Button { visible: !!bridge.activityDetails.requestManifest; text: "Complete retained request…"; enabled: !bridge.detailsLoading; onClicked: inspector.payloadRequested("request") }
    Label { visible: !!bridge.activityDetails.requestTruncated; text: "Request preview truncated"; color: Theme.muted }
    TextArea { Layout.fillWidth: true; readOnly: true; selectByMouse: true; wrapMode: TextEdit.WrapAnywhere; textFormat: TextEdit.PlainText; Accessible.name:"Operation output preview";text: bridge.activityDetails.output||""; background: null }
    Button { visible: !!bridge.activityDetails.outputManifest; text: "Complete retained output…"; enabled: !bridge.detailsLoading; onClicked: inspector.payloadRequested("output") }
    Label { visible: !!bridge.activityDetails.outputTruncated; text: "Output preview truncated"; color: Theme.muted }
   }
  }
 }
}
