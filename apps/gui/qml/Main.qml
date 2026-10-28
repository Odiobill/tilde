import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
ApplicationWindow {
 id: window
 visible: true; width: 1100; height: 760; minimumWidth: 520; minimumHeight: 400; title: "Tilde"
 color: Theme.background; font.pixelSize: Theme.bodySize
 palette.window: Theme.background; palette.windowText: Theme.foreground; palette.text: Theme.foreground; palette.base: Theme.surface
 palette.mid: Theme.border; palette.dark: Theme.border; palette.light: Theme.border; palette.button: Theme.surface; palette.buttonText: Theme.foreground; palette.highlight: Theme.accent; palette.highlightedText: Theme.accentText; palette.placeholderText: Theme.muted
 property var localAccessibility: typeof accessibilityPreferences!=="undefined" ? accessibilityPreferences : null
 property var desktopTray: typeof trayController!=="undefined" ? trayController : null
 property var bridgeObject: bridge
 property int restoreVisibility: Window.Windowed
 property alias draft: composer.text
 property bool geometryReady: false
 property var normalGeometry: ({x:0,y:0,width:1100,height:760,mode:"windowed"})
 property bool settingsOpen: false
 property string settingsAnchor: "models-and-providers"
 property bool initialSetupShown: false
 property bool inspectorOpen: false
 property bool inspectorSource: false
 Binding { target: Theme; property: "reducedMotion"; value: window.localAccessibility ? window.localAccessibility.reducedMotion : false }
 Binding { target: Theme; property: "mode"; value: bridge.uiSettings.theme || "system" }
 onVisibilityChanged: function(value) { if(desktopTray)desktopTray.setWindowVisible(value!==Window.Hidden&&value!==Window.Minimized); if(value===Window.Windowed||value===Window.Maximized||value===Window.FullScreen)restoreVisibility=value;else if(value===Window.Hidden||value===Window.Minimized){bridge.frontendHidden();approvalPanel.dismissReview()} }
 function saveFrontendState() { var g=Object.assign({},normalGeometry);g.mode=restoreVisibility===Window.Maximized?"maximized":restoreVisibility===Window.FullScreen?"fullscreen":"windowed";return bridge.prepareClose()&&bridge.saveWindowGeometry(g) }
 function hideToTray() { if(desktopTray&&desktopTray.enabled&&desktopTray.available&&saveFrontendState())hide() }
 function quitFrontend() { if(saveFrontendState())Qt.quit();else activateFromLauncher() }
 onClosing: function(close) { close.accepted=saveFrontendState();if(close.accepted&&desktopTray&&desktopTray.effectiveHideOnClose){hide();close.accepted=false} }
 function rememberGeometry() { if(geometryReady&&visibility===Window.Windowed)normalGeometry=({x:x,y:y,width:width,height:height,mode:"windowed"}) }
 onXChanged: rememberGeometry()
 onYChanged: rememberGeometry()
 onWidthChanged: rememberGeometry()
 onHeightChanged: rememberGeometry()
 function activateFromLauncher() { if(visibility===Window.Minimized||visibility===Window.Hidden){if(restoreVisibility===Window.Maximized)showMaximized();else if(restoreVisibility===Window.FullScreen)showFullScreen();else showNormal()}raise();requestActivate();approvalPanel.dismissReview();composer.forceActiveFocus() }
 function sendDraft() { if(!composer.inputMethodComposing)bridge.submit(composer.text) }
 function openSettings(anchor) { settingsAnchor=typeof anchor==="string"?anchor:"models-and-providers";settingsOpen=true }
 function openWorkLimits() { openSettings("work-limits") }
 function finishSettings() { settingsOpen=false;composer.forceActiveFocus() }
 function closeSettings() { if(settingsLoader.item)settingsLoader.item.requestBack();else finishSettings() }
 function inspect(id,fp) { inspectorSource=false;inspectorOpen=true;bridge.loadActivityDetails(id,fp);if(width<1000)inspectorDrawer.open() }
 function inspectSource(entry,index) { inspectorSource=true;inspectorOpen=true;bridge.loadFullSource(entry,index);if(width<1000)inspectorDrawer.open() }
 function review(id,fp) { approvalPanel.reviewAction(id,fp) }
 function statusText() {
  if(bridge.connectionState==="protocol_mismatch")return "Daemon and frontend versions do not match"
  if(bridge.connectionState!=="ready")return "Waiting for the daemon…"
  var s=bridge.work.status
  if(s==="storage_failed")return "Storage unavailable · cancellation remains available for known work"
  if(s==="outcome_unknown")return "Outcome unknown · inspect the retained receipt"
  if(s==="concurrent_recovery")return "Conflicting retained work · owner recovery is required"
  if(s==="budget_paused")return "Budget reached · work is paused"
  if(s==="waiting_for_approval")return "Waiting for exact action approval"
  if(s==="blocked")return "Work is blocked · review the status below"
  if(bridge.resolvingSubmission&&!bridge.work.activeConversationId)return "Resolving the saved submission…"
  if(s==="running")return bridge.work.activeConversationId!==bridge.selectedConversationId ? "Work is running in another conversation" : "Responding…"
  if(!bridge.modelKnown)return "Choose an available model in Settings"
  if(!bridge.credentialReady)return "Configure provider access in Settings"
  return bridge.chatLoading ? "Loading conversation…" : "Ready"
 }
 Connections { target: window.desktopTray
  function onShowRequested() { window.activateFromLauncher() }
  function onHideRequested() { window.hideToTray() }
  function onSettingsRequested() { window.activateFromLauncher();window.openSettings() }
  function onQuitRequested() { window.quitFrontend() }
 }
 Connections {
  target: bridge
  function onSettingsChanged() { if(window.desktopTray)window.desktopTray.setPreferences(bridge.uiSettings);if(bridge.connectionState==="ready"&&!bridge.credentialReady&&!window.initialSetupShown){window.initialSetupShown=true;window.openSettings()} }
  function onWorkChanged() { if(window.desktopTray)window.desktopTray.setStatus(bridge.work.status||"ready") }
  function onDraftChanged() { if(composer.text!==bridge.draft)composer.text=bridge.draft }
  function onActivationRequested(payload) { if(payload.intent==="settings")window.openSettings() }
 }
 ColumnLayout {
  anchors.fill: parent; spacing: 0
  Keys.onEscapePressed: function(event) { if(window.settingsOpen)window.closeSettings();else if(window.inspectorOpen){window.inspectorOpen=false;bridge.closeSource();composer.forceActiveFocus()}else event.accepted=false }
  RowLayout { visible: !window.settingsOpen; Layout.fillWidth: true; Layout.preferredHeight: 52; Layout.leftMargin: 12; Layout.rightMargin: 12
   Button { visible: window.width<900; text: "History"; onClicked: historyDrawer.open() }
   Label { Accessible.ignored:true; visible: window.width<900; text: "~"; color: Theme.accent; font.bold: true; font.pixelSize:Math.round(Theme.bodySize*24/15) }
   Label { Layout.fillWidth: true; objectName:"workStatus";Accessible.name:text;text: window.statusText(); textFormat: Text.PlainText; elide: Text.ElideRight; color: Theme.muted }
   Button { visible: !!bridge.work.activeConversationId&&bridge.work.activeConversationId!==bridge.selectedConversationId; text: "Go to active"; onClicked: bridge.selectConversation(bridge.work.activeConversationId) }
   Button { text: "Activity"; onClicked: { window.inspectorSource=false;window.inspectorOpen=!window.inspectorOpen;if(window.width<1000&&window.inspectorOpen)inspectorDrawer.open() } }
   Button { id: settingsButton; objectName: "openSettings"; Accessible.name: "Open Settings"; text: "Settings"; onClicked: window.openSettings() }
  }
  Label { Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; visible: bridge.error.length>0; text: bridge.error; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.foreground; topPadding: 6; bottomPadding: 6 }
  Label { visible: bridge.work.desktopStatus==="failed"; Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; wrapMode: Text.Wrap; textFormat: Text.PlainText; text: "Desktop integration failed. An Open target may be unavailable; use History or inspect Desktop settings."; color: Theme.muted }
  Label { objectName: "usageBadge"; visible: !!bridge.usage.runId; Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; textFormat: Text.PlainText; color: Theme.muted; wrapMode: Text.Wrap; font.pixelSize: Theme.smallSize
   text: {var u=bridge.usage;if(!u.runId)return "Run usage unavailable";var near=(u.requestLimit!==null&&u.requests>=u.requestLimit*0.75)||(u.toolLimit!==null&&u.tools>=u.toolLimit*0.75);return (near?"75% budget cue · ":"")+u.requests+" / "+(u.requestLimit===null?"unlimited":u.requestLimit)+" requests · "+u.tools+" / "+(u.toolLimit===null?"unlimited":u.toolLimit)+" tools"}
  }
  Pane { id: budgetBanner; objectName: "budgetBanner"; visible: bridge.work.status==="budget_paused"; Layout.fillWidth: true; padding: 8
   background: Rectangle { color: Theme.panel }
   RowLayout { anchors.fill: parent
    Label { Layout.fillWidth: true; wrapMode: Text.Wrap; textFormat: Text.PlainText; text: {var p=bridge.work.budgetPause;return p ? p.used+" / "+p.limit+" "+p.kind+" used. The run is paused; counts and completed actions are preserved." : "The run is paused."} }
    Button { objectName: "reviewBudget"; text: "Review extension…"; onClicked: budgetDialog.open() }
   }
  }
  RowLayout { visible: !window.settingsOpen; Layout.fillWidth: true; Layout.fillHeight: true; spacing: 0
   ConversationSidebar { objectName: "historySidebar"; visible: window.width>=900; Layout.preferredWidth: 224; Layout.fillHeight: true; bridge: window.bridgeObject; onSettingsRequested: window.openSettings() }
   ColumnLayout { Layout.fillWidth: true; Layout.fillHeight: true; spacing: 6
    TranscriptView { id: transcriptView; Layout.fillWidth: true; Layout.fillHeight: true; bridge: window.bridgeObject; onInspectRequested: function(id,fp){window.inspect(id,fp)} onReviewRequested: function(id,fp){window.review(id,fp)} onSourceRequested: function(entry,index){window.inspectSource(entry,index)} }
    ApprovalPanel { id: approvalPanel; bridge: window.bridgeObject; Layout.leftMargin: 12; Layout.rightMargin: 12 }
    ScrollView { objectName: "composerViewport"; Layout.fillWidth: true; Layout.preferredHeight: 100; Layout.minimumHeight: 64; Layout.maximumHeight: 140; Layout.leftMargin: 16; Layout.rightMargin: 16; clip: true
     TextArea { id: composer; objectName: "composer"; Accessible.name: "Message to Tilde"; Accessible.description: "Enter sends the message. Shift Enter inserts a new line."; activeFocusOnTab: true; KeyNavigation.priority: KeyNavigation.BeforeItem; KeyNavigation.tab: sendButton.enabled?sendButton:settingsButton; KeyNavigation.backtab: settingsButton; focus: true; placeholderText: "Ask Tilde…"; wrapMode: TextEdit.Wrap; textFormat: TextEdit.PlainText; selectByMouse: true
      onTextChanged: bridge.editDraft(text)
      Keys.onReturnPressed: function(event) { if(inputMethodComposing||event.modifiers&Qt.ShiftModifier){event.accepted=false;return}window.sendDraft();event.accepted=true }
      Keys.onEnterPressed: function(event) { if(inputMethodComposing||event.modifiers&Qt.ShiftModifier){event.accepted=false;return}window.sendDraft();event.accepted=true }
     }
    }
    RowLayout { Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.bottomMargin: 10
     Label { Layout.fillWidth: true; text: (bridge.settings.modelId||"Choose a model")+" · "+(bridge.settings.store||"shared")+" store"; textFormat: Text.PlainText; elide: Text.ElideRight; color: Theme.muted; font.pixelSize: Theme.smallSize }
     Label { text: bridge.draftByteCount+" / "+bridge.inputByteLimit+" bytes"+(bridge.draftByteCount>bridge.inputByteLimit?" · over input limit":""); textFormat: Text.PlainText; color: Theme.muted; font.pixelSize: Theme.smallSize }
     Button { id: cancelButton; objectName: "cancelWork"; Accessible.name: "Cancel active work"; text: "Cancel"; enabled: bridge.canCancel; onClicked: bridge.cancel() }
     Button { id: sendButton; objectName: "sendMessage"; Accessible.name: "Send message"; text: "Send"; enabled: !bridge.busy&&composer.text.trim().length>0&&bridge.draftByteCount<=bridge.inputByteLimit; onClicked: window.sendDraft() }
    }
   }
   ActivityInspector { visible: window.inspectorOpen&&window.width>=1000; Layout.preferredWidth: 320; Layout.fillHeight: true; bridge: window.bridgeObject; sourceMode: window.inspectorSource; onPayloadRequested: function(kind){window.inspectorSource=true;bridge.loadActivityPayload(kind)} onCloseRequested: window.inspectorOpen=false; onReviewRequested: function(id,fp){window.review(id,fp)} }
  }
  Loader { id:settingsLoader;Layout.fillWidth: true; Layout.fillHeight: true; visible: window.settingsOpen; active: window.settingsOpen; sourceComponent: SettingsPage { bridge: window.bridgeObject.settingsController;anchor:window.settingsAnchor;onBackRequested: window.finishSettings() } }
 }
 Drawer { id: historyDrawer; enter: Transition { enabled: !Theme.reducedMotion; NumberAnimation { property:"position";from:0;to:1;duration:180 } } exit: Transition { enabled: !Theme.reducedMotion; NumberAnimation { property:"position";from:1;to:0;duration:180 } } objectName: "historyDrawer"; width: Math.min(260,window.width-48); height: window.height
  ConversationSidebar { anchors.fill: parent; bridge: window.bridgeObject; onSettingsRequested: {historyDrawer.close();window.openSettings()} onConversationChosen: historyDrawer.close() }
 }
 Drawer { id: inspectorDrawer; enter: Transition { enabled: !Theme.reducedMotion; NumberAnimation { property:"position";from:0;to:1;duration:180 } } exit: Transition { enabled: !Theme.reducedMotion; NumberAnimation { property:"position";from:1;to:0;duration:180 } } edge: Qt.RightEdge; width: Math.min(360,window.width-32); height: window.height
  ActivityInspector { anchors.fill: parent; bridge: window.bridgeObject; sourceMode: window.inspectorSource; onPayloadRequested: function(kind){window.inspectorSource=true;bridge.loadActivityPayload(kind)} onCloseRequested: {inspectorDrawer.close();window.inspectorOpen=false} onReviewRequested: function(id,fp){window.review(id,fp)} }
 }
 Dialog {
  enter:Transition { NumberAnimation { property:"opacity";from:0;to:1;duration:Theme.reducedMotion?0:150 } }
  exit:Transition { NumberAnimation { property:"opacity";from:1;to:0;duration:Theme.reducedMotion?0:150 } }

  id: budgetDialog; title: "Extend the paused run"; parent: Overlay.overlay; anchors.centerIn: parent; modal: true; width: Math.min(500,parent.width-24)
  property var paused: ({})
  function parseCount(text) { var s=text.trim().toLowerCase();if(s==="unlimited")return null;return /^[0-9]+$/.test(s)&&Number.isSafeInteger(Number(s))&&Number(s)>0 ? Number(s) : undefined }
  onAboutToShow: { paused=Object.assign({},bridge.work.budgetPause||{});grantRequests.text=paused.kind==="requests"?String(paused.limit+1):"";grantTools.text=paused.kind==="tools"?String(paused.limit+1):"" }
  contentItem: ColumnLayout {
   Label { Layout.fillWidth: true; text: "Run "+(budgetDialog.paused.runId||"")+" · "+(budgetDialog.paused.used||0)+" "+(budgetDialog.paused.kind||"")+" used. Enter absolute new ceilings or unlimited. Counts are preserved; this does not approve any command."; wrapMode: Text.Wrap; textFormat: Text.PlainText }
   Label { text: "Provider request ceiling" }
   TextField { id: grantRequests;Accessible.name:"Provider request ceiling"; objectName: "grantRequests"; Layout.fillWidth: true; placeholderText: "Positive whole number or unlimited" }
   Label { text: "Tool operation ceiling" }
   TextField { id: grantTools;Accessible.name:"Tool operation ceiling"; objectName: "grantTools"; Layout.fillWidth: true; placeholderText: "Positive whole number or unlimited" }
   Label { Layout.fillWidth: true; text: "Proposed ceilings: "+grantRequests.text+" requests · "+grantTools.text+" tools"; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
  }
  footer: DialogButtonBox {
   Button { text: "Close"; onClicked: budgetDialog.close() }
   Button { objectName: "extendBudget"; text: "Extend budget"; focus: false; enabled: bridge.work.status==="budget_paused"&&bridge.work.budgetPause&&bridge.work.budgetPause.revision===budgetDialog.paused.revision&&budgetDialog.parseCount(grantRequests.text)!==undefined&&budgetDialog.parseCount(grantTools.text)!==undefined; onClicked: {if(bridge.work.budgetPause.revision!==budgetDialog.paused.revision)return;bridge.extendBudget(budgetDialog.parseCount(grantRequests.text),budgetDialog.parseCount(grantTools.text));budgetDialog.close()} }
  }
 }

 Component.onCompleted: { if(desktopTray){desktopTray.setPreferences(bridge.uiSettings);desktopTray.setWindowVisible(visible);desktopTray.setStatus(bridge.work.status||"ready")}normalGeometry=bridge.restoreWindow(window);geometryReady=true;composer.text=bridge.draft;composer.forceActiveFocus();if(bridge.connectionState==="ready"&&!bridge.credentialReady){initialSetupShown=true;openSettings()} }
}
