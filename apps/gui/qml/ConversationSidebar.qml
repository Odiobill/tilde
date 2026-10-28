import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
Pane {
 id: sidebar
 property string anchorId: ""
 property real anchorOffset: 0
 function remember() { var index=history.indexAt(history.width/2,history.contentY+1);if(index>=0){anchorId=bridge.conversations[index].id;var item=history.itemAtIndex(index);anchorOffset=item?history.contentY-item.y:0}else anchorId="" }
 function restore() { if(!anchorId.length)return;var rows=bridge.conversations;for(var i=0;i<rows.length;i++)if(rows[i].id===anchorId){history.positionViewAtIndex(i,ListView.Beginning);history.forceLayout();var item=history.itemAtIndex(i);if(item)history.contentY=item.y+anchorOffset;return} }
 Connections { target: bridge; function onCatalogAboutToChange(){sidebar.remember()} function onCatalogChanged(){Qt.callLater(sidebar.restore)} }
 required property var bridge
 signal settingsRequested()
 signal conversationChosen()
 padding: 12
 background: Rectangle { color: Theme.panel }
 ColumnLayout {
  anchors.fill: parent; spacing: 10
  RowLayout { Layout.fillWidth: true
   Label { Accessible.ignored:true; text: "~"; font.pixelSize:Math.round(Theme.bodySize*30/15); font.bold: true; color: Theme.accent }
   Label { text: "Tilde"; font.pixelSize:Math.round(Theme.bodySize*21/15); font.bold: true; Layout.fillWidth: true }
  }
  Button { objectName: "newConversation"; Accessible.name:"New conversation"; text: "+ New conversation"; Layout.fillWidth: true; onClicked: bridge.createConversation() }
  TextField { id: filter; Accessible.name:"Filter conversation titles"; Layout.fillWidth: true; placeholderText: "Filter titles"; onTextEdited: filterDelay.restart() }
  Timer { id: filterDelay; interval: 250; onTriggered: bridge.filterConversations(filter.text) }
  RowLayout { Layout.fillWidth: true
   Label { text: "HISTORY"; font.pixelSize: Theme.smallSize; color: Theme.muted; Layout.fillWidth: true }
   ToolButton { text: "Refresh"; onClicked: bridge.filterConversations(filter.text) }
  }
  Label { Layout.fillWidth: true; visible: bridge.catalogLoading || bridge.work.catalogStatus !== "ready"; text: bridge.work.catalogStatus === "unavailable" ? "History unavailable" : "Refreshing history…"; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
  ListView {
   id: history; objectName: "conversationHistory"; Accessible.role:Accessible.List; Accessible.name:"Conversation history"; Layout.fillWidth: true; Layout.fillHeight: true; clip: true; spacing: 4; model: bridge.conversations
   ScrollBar.vertical: ScrollBar {}
   delegate: Rectangle {
    id: row; required property var modelData
    width: history.width; height: 52; radius: 7
    color: modelData.id === bridge.selectedConversationId ? Qt.alpha(Theme.accent,0.15) : "transparent"
    RowLayout { anchors.fill: parent; anchors.margins: 6
     Button { id: titleButton; objectName: "conversationTitle"; Layout.fillWidth: true; text: row.modelData.title; Accessible.name:text; Accessible.selected:row.modelData.id===bridge.selectedConversationId; flat: true
      contentItem: Label { text: titleButton.text; textFormat: Text.PlainText; elide: Text.ElideRight; verticalAlignment: Text.AlignVCenter }
      onClicked: { if (bridge.selectConversation(row.modelData.id)) sidebar.conversationChosen() }
     }
     ToolButton { Accessible.name:"Rename conversation"; text: "⋯"; onClicked: { rename.conversationId = row.modelData.id; rename.revision = row.modelData.metadataRevision; renameTitle.text = row.modelData.title; rename.open() } }
    }
   }
  }
  Button { visible: bridge.hasMoreConversations; Layout.fillWidth: true; text: "Older conversations"; onClicked: bridge.loadMore() }
  Button { text: "Settings"; Layout.fillWidth: true; flat: true; onClicked: sidebar.settingsRequested() }
 }
 Dialog {
  enter:Transition { NumberAnimation { property:"opacity";from:0;to:1;duration:Theme.reducedMotion?0:150 } }
  exit:Transition { NumberAnimation { property:"opacity";from:1;to:0;duration:Theme.reducedMotion?0:150 } }

  id: rename; title: "Rename conversation"; parent: Overlay.overlay; anchors.centerIn: parent; modal: true
  property string conversationId: ""; property string revision: ""
  width: Math.min(420, parent ? parent.width - 24 : 400)
  contentItem: TextField { id: renameTitle; Accessible.name:"Conversation title"; selectByMouse: true; onAccepted: {} }
  footer: DialogButtonBox {
   Button { text: "Cancel"; onClicked: rename.close() }
   Button { text: "Save title"; enabled: renameTitle.text.trim().length > 0; onClicked: { bridge.renameConversation(rename.conversationId,renameTitle.text,rename.revision); rename.close() } }
  }
 }
}
