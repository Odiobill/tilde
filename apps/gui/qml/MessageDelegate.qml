import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
Item {
 id: message
 required property string entryId
 required property string rowKind
 required property string sourceEntryId
 required property int messageIndex
 required property string generationTaskId
 required property string stopReason
 required property string operationId
 required property string fingerprint
 required property string provenanceModel
 required property string speaker
 required property string body
 required property bool truncated
 required property var bridge
 signal inspectRequested(string operationId,string fingerprint)
 signal reviewRequested(string operationId,string fingerprint)
 signal sourceRequested(string entryId,int messageIndex)
 signal verticalScrollRequested(real delta)
 signal layoutChanged()
 readonly property bool emptyToolMessage: rowKind === "message" && speaker === "assistant" && body.length === 0 && stopReason === "toolUse"
 width: ListView.view ? ListView.view.width : 700
 height: emptyToolMessage ? 0 : content.implicitHeight + 24
 visible: !emptyToolMessage
 onHeightChanged: layoutChanged()
 MarkdownController { id: literalCopy }
 function facts() { var items = bridge.activity; for (var i=0;i<items.length;i++) if (items[i].id === operationId && items[i].fingerprint === fingerprint) return items[i]; return ({}) }
 ColumnLayout {
  id: content; width: Math.min(760,parent.width-32); anchors.horizontalCenter: parent.horizontalCenter; y: 12; spacing: 6
  Label { visible: message.rowKind !== "tool_anchor"; Layout.fillWidth: true; text: message.speaker === "user" ? "You" : "Tilde" + (message.provenanceModel ? " · " + message.provenanceModel : ""); font.bold: true; color: Theme.muted; textFormat: Text.PlainText; font.pixelSize: Theme.smallSize }
  Loader {
   Layout.fillWidth: true; active: message.rowKind !== "tool_anchor"; sourceComponent: message.speaker === "assistant" ? assistant : user
  }
  Component { id: assistant
   MarkdownMessage { onVerticalScrollRequested: function(delta){message.verticalScrollRequested(delta)} sourceText: message.body; complete: message.rowKind !== "partial"; truncated: message.truncated && message.rowKind!=="partial"; onFullSourceRequested: message.sourceRequested(message.sourceEntryId,message.messageIndex) }
  }
  Component { id: user
   ColumnLayout {
    TextArea { Accessible.name:"User message";Layout.fillWidth: true; text: message.body; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; textFormat: TextEdit.PlainText; padding: 0; background: null
     WheelHandler { target: null; acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
      onWheel: function(event) { if(event.modifiers&Qt.ShiftModifier||event.angleDelta.y===0&&event.pixelDelta.y===0){event.accepted=false;return}message.verticalScrollRequested(event.pixelDelta.y!==0?event.pixelDelta.y:event.angleDelta.y/120*60);event.accepted=true }
     }
    }
    RowLayout {
     ToolButton { text: message.truncated ? "Copy displayed text" : "Copy text"; onClicked: literalCopy.copySelection(message.body) }
     ToolButton { visible: message.truncated; text: "Complete source…"; onClicked: message.sourceRequested(message.sourceEntryId,message.messageIndex) }
    }
   }
  }
  Label { visible: message.stopReason === "aborted" || message.stopReason === "error"; text: message.stopReason === "aborted" ? "Interrupted reply" : "Reply failed"; textFormat: Text.PlainText; color: Theme.muted; font.pixelSize: Theme.smallSize }
  Label { visible: message.rowKind === "partial"; text: "Responding…"; textFormat: Text.PlainText; color: Theme.muted; font.pixelSize: Theme.smallSize }
  ToolCard { Layout.fillWidth: true; visible: message.rowKind === "tool_anchor"; operationId: message.operationId; fingerprint: message.fingerprint; operation: message.facts(); onInspectRequested: function(id,fp) { message.inspectRequested(id,fp) } onReviewRequested: function(id,fp) { message.reviewRequested(id,fp) } }
 }
}
