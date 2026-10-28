import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
Rectangle {
 id: card; objectName: "verifiedToolCard"
 required property string operationId
 required property string fingerprint
 property var operation: ({})
 property double activeNow: ActiveClock.now()
 onOperationChanged: activeNow=ActiveClock.now()
 onVisibleChanged: activeNow=ActiveClock.now()
 function timingText() { var timing=operation.activeTime;if(timing){var elapsed=timing.elapsedMs+(timing.running?Math.max(0,activeNow-timing.sampledAtMs):0);return Math.floor(elapsed/1000)+"s active · "+(timing.durationMs==null?"No time limit":"limit "+(timing.durationMs/1000)+"s active time") }if(operation.timingKind==="legacy-wall"&&operation.startedAt!==undefined){var end=operation.finishedAt===undefined?now.time:operation.finishedAt;return "Legacy · "+Math.max(0,Math.floor((end-operation.startedAt)/1000))+"s wall elapsed"}return operation.startedAt!==undefined?"Active timing unavailable":"" }
 signal inspectRequested(string operationId,string fingerprint)
 signal reviewRequested(string operationId,string fingerprint)
 implicitHeight: content.implicitHeight + 24; color: Theme.panel; border.color: Theme.border; radius: 8
 ColumnLayout { id: content; anchors.fill: parent; anchors.margins: 12; spacing: 6
  RowLayout { Layout.fillWidth: true
   Label { text: "Verified tool activity"; font.bold: true; font.pixelSize: Theme.smallSize; color: Theme.accent; Layout.fillWidth: true; textFormat: Text.PlainText }
   Label { text: card.operation.status ? card.operation.status.replace(/_/g," ") : "Saved operation"; font.pixelSize: Theme.smallSize; textFormat: Text.PlainText }
  }
  Label { Layout.fillWidth: true; text: card.operation.tool || "Operation details"; font.bold: true; textFormat: Text.PlainText }
  Label { Layout.fillWidth: true; visible: text.length > 0; text: card.operation.summary || ""; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
  Label { objectName: "outputAvailability"; Layout.fillWidth: true; visible: !!card.operation.truncated; text: card.operation.payload==="retained" ? "Output preview truncated · complete retained output is available in the inspector." : card.operation.payload==="pruned" ? "Output preview truncated · full payload pruned." : "Output preview truncated · full payload unavailable."; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted; font.pixelSize: Theme.smallSize }
  RowLayout { Layout.fillWidth: true
   Button { text: "Inspect"; onClicked: card.inspectRequested(card.operationId,card.fingerprint) }
   Button { visible: card.operation.status === "awaiting_approval"; text: "Review exact action"; onClicked: card.reviewRequested(card.operationId,card.fingerprint) }
   Item { Layout.fillWidth: true }
   Label { objectName: "activeTimeLabel"; visible: text.length>0; text: card.timingText();wrapMode: Text.Wrap;Layout.maximumWidth: card.width*0.6;color: Theme.muted; font.pixelSize: Theme.smallSize }
  }
 }
 QtObject { id: now; property double time: Date.now() }
 Timer { interval: 1000; running: card.visible && card.operation.status === "running"; repeat: true; onTriggered: { card.activeNow=ActiveClock.now();if(card.operation.timingKind==="legacy-wall")now.time=Date.now() } }
}
