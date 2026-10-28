import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
ColumnLayout {
 id: panel
 required property var bridge
 property var session: bridge.authSession
 property var prompt: session.prompt || ({})
 property var event: session.event || ({})
 property string promptIdentity: prompt.id || ""
 property bool active: !!session.sessionId && ["succeeded","failed","cancelled","expired"].indexOf(session.state)<0
 spacing: 10
 onPromptIdentityChanged: { response.clear();choice.currentIndex=-1 }
 onVisibleChanged: if(!visible)response.clear()
 Label { Layout.fillWidth:true;Layout.minimumWidth:0; text: (bridge.authStatus.status||"not_checked").replace(/_/g," ")+" · configured does not mean remotely tested"; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
 Label { visible: !!bridge.authStatus.source; Layout.fillWidth:true;Layout.minimumWidth:0; text: "Source: "+(bridge.authStatus.source||""); wrapMode: Text.Wrap; textFormat: Text.PlainText }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0; text: "Setup uses this provider’s Pi sign-in or configuration flow. It may open an account grant, refresh tokens, or access profile helpers when you explicitly use that method. Saving never sends a model request. SDK-internal credentials may not be visible to output redaction."; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
 Label { visible:panel.bridge.target.providerId==="github-copilot"; Layout.fillWidth:true;Layout.minimumWidth:0; text:"GitHub Copilot sign-in fetches model availability and enables supported account models. This changes account configuration and does not send a model request."; wrapMode:Text.Wrap; textFormat:Text.PlainText; color:Theme.muted }
 Flow { Layout.fillWidth:true;Layout.minimumWidth:0; spacing: 8
  Repeater { model: panel.bridge.authStatus.methods || []
   FormButton { required property var modelData; text: modelData.loginLabel || modelData.name; enabled: modelData.canLogin && !panel.active; onClicked: panel.bridge.startAuth(panel.bridge.target,modelData.type) }
  }
  FormButton { text: "Remove stored credential…"; enabled: !!panel.bridge.authStatus.credentialStored&&!panel.active; onClicked: remove.open() }
 }
 Label { visible: !!session.sessionId; Layout.fillWidth:true;Layout.minimumWidth:0; text: "Setup: "+(session.state||"")+(session.errorCode?" · "+session.errorCode:""); wrapMode: Text.Wrap; textFormat: Text.PlainText }
 Label { visible: !!prompt.message; Layout.fillWidth:true;Layout.minimumWidth:0; text: prompt.message||""; wrapMode: Text.Wrap; textFormat: Text.PlainText }
 Label { objectName:"authResponseLabel";visible:!!panel.prompt.id&&panel.prompt.type!=="select";Layout.fillWidth:true;Layout.minimumWidth:0;text:panel.prompt.type==="secret"||panel.prompt.type==="manual_code"?"Provider secret":"Provider setup response";Accessible.name:text;wrapMode:Text.Wrap;textFormat:Text.PlainText }
 TextField { id: response; objectName: "authPromptResponse"; Accessible.role: Accessible.EditableText; Accessible.name: panel.prompt.type==="secret"||panel.prompt.type==="manual_code" ? "Provider secret" : "Provider setup response"; Accessible.description: (panel.prompt.type==="secret"||panel.prompt.type==="manual_code" ? "Provider secret. " : "Provider setup response. ")+"Private provider setup field. Its value is never part of a chat draft."; visible: !!panel.prompt.id&&panel.prompt.type!=="select"; Layout.fillWidth:true;Layout.minimumWidth:0; placeholderText: panel.prompt.placeholder||""; echoMode: panel.prompt.type==="secret"||panel.prompt.type==="manual_code"?TextInput.Password:TextInput.Normal; selectByMouse: true; maximumLength: 65536; onAccepted: { if(visible){panel.bridge.respondAuth(panel.prompt.id,text);clear()} } }
 ComboBox { id: choice; visible: !!panel.prompt.id&&panel.prompt.type==="select"; Layout.fillWidth:true;Layout.minimumWidth:0; model: panel.prompt.options||[]; textRole: "label"; valueRole: "id"; wheelEnabled: false }
 FormButton { visible: !!panel.prompt.id; text: "Continue setup"; enabled: panel.prompt.type!=="select"||choice.currentIndex>=0; onClicked: {panel.bridge.respondAuth(panel.prompt.id,panel.prompt.type==="select"?choice.currentValue:response.text);response.clear()} }
 Label { objectName:"authUrlInstructions"; visible:panel.event.type==="auth_url"&&!!panel.event.instructions; Layout.fillWidth:true;Layout.minimumWidth:0; text:panel.event.instructions||""; wrapMode:Text.Wrap; textFormat:Text.PlainText }
 Label { visible: !!panel.event.message; Layout.fillWidth:true;Layout.minimumWidth:0; text: panel.event.message||""; wrapMode: Text.Wrap; textFormat: Text.PlainText }
 Label { visible: panel.event.type==="device_code"; Layout.fillWidth:true;Layout.minimumWidth:0; text: "Device code: "+(panel.event.userCode||""); wrapMode: Text.Wrap; textFormat: Text.PlainText }
 Label { visible: panel.event.type==="auth_url"||panel.event.type==="device_code"; Layout.fillWidth:true;Layout.minimumWidth:0; text: "Sign-in destination: "+String(panel.event.url||panel.event.verificationUri||"").split("/")[2]; wrapMode: Text.Wrap; textFormat: Text.PlainText }
 Flow { Layout.fillWidth:true;Layout.minimumWidth:0; spacing: 8
  FormButton { objectName:"authOpenBrowser"; visible: panel.event.type==="auth_url"||panel.event.type==="device_code"; text: "Open browser"; onClicked: panel.bridge.openAuthBrowser() }
  FormButton { visible: panel.event.type==="device_code"; text: "Copy device code"; onClicked: panel.bridge.copyDeviceCode() }
  FormButton { visible: panel.active; text: "Cancel setup"; onClicked: {response.clear();panel.bridge.cancelAuth()} }
 }
 Repeater { model:panel.event.links||[];FormButton {required property var modelData;required property int index;text:modelData.label||"Open provider information";onClicked:panel.bridge.openAuthInfoLink(index)} }
 Dialog {
  enter:Transition { NumberAnimation { property:"opacity";from:0;to:1;duration:Theme.reducedMotion?0:150 } }
  exit:Transition { NumberAnimation { property:"opacity";from:1;to:0;duration:Theme.reducedMotion?0:150 } }
 id: remove; modal: true; title: "Remove stored credential?"; implicitHeight:260; height:260; width: Math.min(460,panel.width); standardButtons: Dialog.Cancel|Dialog.Ok
  contentItem: Label { width: remove.availableWidth; text: "This removes this provider’s credential from the selected file. Every Pi client sharing that file is affected. Environment/profile sources may still be available."; wrapMode: Text.Wrap; textFormat: Text.PlainText }
  onAccepted: panel.bridge.removeCredentials(panel.bridge.target)
 }
 Connections { target: panel.bridge; function onAuthChanged(){ response.clear() } }
}
