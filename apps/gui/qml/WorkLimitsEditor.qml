import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
ColumnLayout {
 id: editor; objectName: "workLimitsEditor"
 required property var bridge
 property var staged: ({})
 property var invalid: ({})
 property string revision: ""
 property bool dirty: false
 property bool saving: false
 property string pendingRevision: ""
 property string sentSettings: ""
 function save() { if(saving)return;saving=true;pendingRevision=revision;sentSettings=JSON.stringify(staged);bridge.updateLimitsExpected(revision,staged) }
 property var fields: [
  {key:"providerRequests",label:"Provider requests",nullable:true}, {key:"toolOperations",label:"Tool operations",nullable:true},
  {key:"providerTimeoutMs",label:"Provider timeout (milliseconds)"}, {key:"outputTokens",label:"Default output tokens"},
  {key:"shellTimeoutMs",label:"Shell timeout (milliseconds)",nullable:true}, {key:"inputBytes",label:"Input and draft bytes · maximum 131072"},
  {key:"fileReadBytes",label:"File read bytes · maximum 8388608"}, {key:"fileWriteBytes",label:"File write bytes · maximum 8388608"},
  {key:"retainedOutputBytes",label:"Retained output bytes · maximum 8388608"}, {key:"modelOutputBytes",label:"Model output preview bytes · maximum 8388608"},
  {key:"retentionDays",label:"Terminal payload retention days",nullable:true}, {key:"retentionBytes",label:"Terminal payload retention bytes",nullable:true} ]
 function reset() { if(!bridge.limits.settings)return;staged=JSON.parse(JSON.stringify(bridge.limits.settings));revision=bridge.limits.revision||"";invalid=({});dirty=false }
 function edit(field,text) { dirty=true;var value;var raw=text.trim().toLowerCase();var errors=Object.assign({},invalid);if(field.nullable && raw===(field.key==="shellTimeoutMs"?"none":"unlimited"))value=null;else if(/^[0-9]+$/.test(raw)&&Number.isSafeInteger(Number(raw))&&Number(raw)>0)value=Number(raw);else {errors[field.key]="Enter a positive whole number"+(field.nullable?" or "+(field.key==="shellTimeoutMs"?"none":"unlimited"):"");invalid=errors;return}delete errors[field.key];invalid=errors;var next=Object.assign({},staged);next[field.key]=value;staged=next;dirty=true }
 spacing: 12
 Label { Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap; text: "Work limits"; font.pixelSize:Math.round(Theme.bodySize*22/15); font.bold: true }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0; text: "Defaults for the next input. The active run keeps its admitted policy and counts. Saving never extends a paused run or approves an action."; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0; text: "Effective next-model output: "+(bridge.limits.effectiveModel ? bridge.limits.effectiveModel.outputTokens+" tokens" : "unavailable")+". Retention source: "+(bridge.limits.retentionSource||"unavailable")+"."; wrapMode: Text.Wrap; textFormat: Text.PlainText }
 Repeater { model: editor.fields
  delegate: ColumnLayout { required property var modelData; Layout.fillWidth:true;Layout.minimumWidth:0; spacing: 4
   Label { text: modelData.label; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
   TextField { Accessible.name:parent.modelData.label; objectName: "limit_"+parent.modelData.key; Layout.fillWidth:true;Layout.minimumWidth:0; text: editor.staged[parent.modelData.key]===null ? (parent.modelData.key==="shellTimeoutMs"?"none":"unlimited") : String(editor.staged[parent.modelData.key]===undefined?"":editor.staged[parent.modelData.key]); onTextEdited: editor.edit(parent.modelData,text) }
   Label { visible: !!editor.invalid[modelData.key]; text: editor.invalid[modelData.key]||""; wrapMode: Text.Wrap; Layout.fillWidth:true;Layout.minimumWidth:0; color: Theme.muted }
  }
 }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0; text: "Use unlimited for count/retention limits and none for a shell with no deadline. Every shell action still needs exact approval. Shell active time excludes suspend. Larger files and output use private bounded caches."; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap; text: "Model-specific output overrides (JSON array)"; textFormat: Text.PlainText }
 TextArea { id: overrides;Accessible.name:"Model output overrides JSON"; Layout.fillWidth:true;Layout.minimumWidth:0; Layout.preferredHeight: 110; wrapMode: TextEdit.WrapAnywhere; textFormat: TextEdit.PlainText; selectByMouse: true; text: JSON.stringify(editor.staged.modelOutputOverrides||[],null,2); onTextChanged: { if(activeFocus){try{var next=Object.assign({},editor.staged);var value=JSON.parse(text);if(!Array.isArray(value))throw Error();next.modelOutputOverrides=value;editor.staged=next;var errors=Object.assign({},editor.invalid);delete errors.overrides;editor.invalid=errors;editor.dirty=true}catch(e){var errors=Object.assign({},editor.invalid);errors.overrides="Enter a valid overrides array.";editor.invalid=errors}} } }
 Label { visible: !!editor.invalid.overrides; text: editor.invalid.overrides||""; wrapMode: Text.Wrap; color: Theme.muted; Layout.fillWidth: true }
 Flow { Layout.fillWidth:true;Layout.minimumWidth:0;spacing:8
  FormButton { objectName: "saveWorkLimits"; text: "Save next-run limits"; enabled: !editor.saving && editor.revision.length>0 && Object.keys(editor.invalid).length===0; onClicked: editor.save() }
  FormButton { text: "Reload accepted values"; onClicked: editor.reset() }
 }
 Connections { target: bridge; function onSettingsChanged() { if(!editor.dirty&&!editor.saving)editor.reset() } function onSettingsSaveResult(kind,expectedRevision,revision) { if(kind==="limits.update"&&editor.saving&&expectedRevision===editor.pendingRevision){editor.saving=false;if(revision.length){editor.revision=revision;editor.dirty=JSON.stringify(editor.staged)!==editor.sentSettings}} } }
 Component.onCompleted: reset()
}
