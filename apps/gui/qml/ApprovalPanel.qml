import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
ColumnLayout {
 id: panel
 property var bridge
 function reviewAction(id,fp) { bridge.loadApprovalDetails(id,fp);review.open() }
 function dismissReview() { review.close(); inspection.close(); bridge.dismissReview() }
 property string inspectedText: ""
 Layout.fillWidth: true
 visible: bridge.approvals.count !== 0 || bridge.approvals.status === "outcome_unknown" || bridge.approvals.status === "storage_failed"
 Label { Layout.fillWidth: true; text: "Verified operations · " + bridge.approvals.status.replace(/_/g, " "); textFormat: Text.PlainText; font.bold: true }
 ListView {
  objectName: "verifiedOperations"; Accessible.role: Accessible.List; Accessible.name: "Verified operations"; model: bridge.approvals; Layout.fillWidth: true; Layout.preferredHeight: count > 0 ? Math.min(70, count * 36) : 0; clip: true
  ScrollBar.vertical: ScrollBar {}
  delegate: RowLayout {
   id: operationRow
   required property string operationId; required property string toolName; required property string status; required property string summary; required property string fingerprint; required property bool truncated; required property string output; required property var targets; required property string risk
   width: ListView.view.width; height: 36
   Label { Layout.fillWidth: true; text: operationRow.toolName + " · " + operationRow.status.replace(/_/g, " ") + (operationRow.truncated ? " · preview truncated" : ""); elide: Text.ElideRight; textFormat: Text.PlainText }
   Button { text: operationRow.status === "awaiting_approval" ? "Review action" : "Inspect"; onClicked: { if (operationRow.status === "awaiting_approval") { bridge.loadApprovalDetails(operationRow.operationId, operationRow.fingerprint); review.open() } else { panel.inspectedText = operationRow.summary + "\nRisk: " + operationRow.risk + "\nTargets: " + operationRow.targets.join(", ") + "\n" + operationRow.output + (operationRow.truncated ? "\n[Preview truncated]" : ""); inspection.open() } } }
  }
 }
 Dialog {
  enter:Transition { NumberAnimation { property:"opacity";from:0;to:1;duration:Theme.reducedMotion?0:150 } }
  exit:Transition { NumberAnimation { property:"opacity";from:1;to:0;duration:Theme.reducedMotion?0:150 } }
 id: inspection; title: "Verified operation"; parent: Overlay.overlay; anchors.centerIn: parent; modal: true; width: Math.min(680, parent.width - 24); height: Math.min(500, parent.height - 32); standardButtons: Dialog.Close; contentItem: ScrollView { clip: true; TextArea { readOnly: true; textFormat: TextEdit.PlainText; wrapMode: TextEdit.WrapAnywhere; text: panel.inspectedText } } }
 Dialog {
  enter:Transition { NumberAnimation { property:"opacity";from:0;to:1;duration:Theme.reducedMotion?0:150 } }
  exit:Transition { NumberAnimation { property:"opacity";from:1;to:0;duration:Theme.reducedMotion?0:150 } }

  id: review; objectName: "approvalDialog"; title: "Review exact action"; modal: true
  parent: Overlay.overlay; anchors.centerIn: parent; width: Math.min(720, parent.width - 24); height: Math.min(600, parent.height - 32)
  onOpened: Qt.callLater(function() { if (review.visible && bridge.approvals.document.complete) bridge.approvals.setDetailsDisplayed(true) })
  onClosed: bridge.dismissReview()
  Connections { target: bridge.approvals.document; function onChanged() { Qt.callLater(function() { if (review.visible && bridge.approvals.document.complete) bridge.approvals.setDetailsDisplayed(true) }) } }
  contentItem: ColumnLayout {
   Label { Layout.fillWidth: true; text: bridge.approvals.risk.replace(/_/g, " "); textFormat: Text.PlainText; font.bold: true }
   Label { Layout.fillWidth: true; visible: bridge.approvals.risk === "unrestricted_shell"; wrapMode: Text.Wrap; textFormat: Text.PlainText; text: "This script has ordinary account file and network access, including credentials and same-user services. Typed path restrictions do not contain it. Output redaction cannot prevent network transmission or guarantee journal integrity after this grant." }
   Label { Layout.fillWidth: true; text: bridge.approvals.expiresAt>0 ? "Approval expires: "+new Date(bridge.approvals.expiresAt).toLocaleString() : "Loading matching action…"; textFormat: Text.PlainText; wrapMode: Text.Wrap }
   Label { objectName: "exactDeadline"; Layout.fillWidth: true; visible: bridge.approvals.deadlineLabel.length > 0; text: bridge.approvals.deadlineLabel; textFormat: Text.PlainText; wrapMode: Text.Wrap }
   Label { Layout.fillWidth: true; text: bridge.approvals.document.complete ? "Complete action · " + bridge.approvals.document.byteCount + " bytes" : "Fetching and verifying the complete action…"; textFormat: Text.PlainText }
   ListView { id: exactAction; objectName: "exactApprovalAction"; Accessible.role: Accessible.List; Accessible.name: "Complete action to review"; Accessible.description: "Use Up and Down to select an action page, Home and End for the first and last. Tab moves into its read-only text."; activeFocusOnTab: true; keyNavigationEnabled: true; currentIndex: 0; Keys.onPressed:function(event){if(event.key===Qt.Key_Home){exactAction.currentIndex=0;event.accepted=true}else if(event.key===Qt.Key_End){exactAction.currentIndex=exactAction.count-1;event.accepted=true}else event.accepted=false} Layout.fillWidth: true; Layout.fillHeight: true; clip: true; model: bridge.approvals.document.pageCount; cacheBuffer: 0; reuseItems: true
    ScrollBar.vertical: ScrollBar {}
    delegate: TextArea { required property int index; Accessible.name: "Action page "+(index+1)+" of "+exactAction.count; activeFocusOnTab:true; width: exactAction.width; readOnly: true; selectByMouse: true; textFormat: TextEdit.PlainText; wrapMode: TextEdit.WrapAnywhere; text: bridge.approvals.document.pageAt(index) }
   }
  }
  footer: DialogButtonBox {
   Button { objectName: "denyOnce"; text: "Deny"; enabled: review.visible && bridge.approvals.canDecide; onClicked: bridge.decideApproval(bridge.approvals.selectedId, bridge.approvals.fingerprint, "deny") }
   Button { objectName: "approveOnce"; text: "Approve once"; enabled: review.visible && bridge.approvals.canDecide; focus: false; onClicked: bridge.decideApproval(bridge.approvals.selectedId, bridge.approvals.fingerprint, "approve_once") }
   Button { text: "Close"; onClicked: review.close() }
  }
 }
}
