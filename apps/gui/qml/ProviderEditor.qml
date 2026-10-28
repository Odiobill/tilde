import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
ColumnLayout {
 id: editor
 required property var bridge
 property var draft: ({})
 property string validation: ""
 property bool custom: draft.kind==="openai-compatible"
 property var jsonErrors: ({})
 property bool resetting:false
 function reset(){resetting=true;lastDefinition=JSON.stringify(bridge.definition||{});draft=JSON.parse(JSON.stringify(bridge.definition||{}));optionsJson.text=JSON.stringify(draft.options||{kind:"none"},null,2);headersJson.text=JSON.stringify(draft.headers||[],null,2);modelsJson.text=JSON.stringify(draft.models||[],null,2);compatJson.text=JSON.stringify(draft.compat||{},null,2);jsonErrors={};validation="";resetting=false}
 function edit(key,value){var next=Object.assign({},draft);next[key]=value;draft=next;bridge.markDirty()}
 function jsonEdit(key,value){if(resetting)return;bridge.markDirty();var errors=Object.assign({},jsonErrors);try{var parsed=JSON.parse(value);if((key==="headers"||key==="models")?!Array.isArray(parsed):(!parsed||typeof parsed!=="object"||Array.isArray(parsed)))throw new Error("shape");if(key==="compat"){var next=Object.assign({},draft);if(Object.keys(parsed).length)next.compat=parsed;else delete next.compat;draft=next;bridge.markDirty()}else edit(key,parsed);delete errors[key]}catch(e){errors[key]="Enter valid JSON for "+key}jsonErrors=errors;validation=Object.keys(errors).map(function(k){return errors[k]}).join("\n")}

 spacing: 10
 visible: !!draft.connectionId
 Label { Layout.fillWidth:true;Layout.minimumWidth:0; text: editor.custom?"OpenAI-compatible connection":"Provider configuration"; font.bold: true; textFormat: Text.PlainText }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap; text: "Display name" }
 TextField { objectName: "providerDisplayName";Accessible.name:"Provider display name"; Layout.fillWidth:true;Layout.minimumWidth:0; text: editor.draft.displayName||""; onTextEdited: editor.edit("displayName",text) }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap; visible: editor.custom; text: "Base URL · no embedded credentials" }
 TextField { Accessible.name:"Provider base URL";visible: editor.custom; Layout.fillWidth:true;Layout.minimumWidth:0; text: editor.draft.baseUrl||""; placeholderText: "http://127.0.0.1:8080/v1"; onTextEdited: editor.edit("baseUrl",text) }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap; visible: editor.custom; text: "OpenAI API" }
 ComboBox { Accessible.name:"OpenAI API style";visible: editor.custom; Layout.fillWidth:true;Layout.minimumWidth:0; model:["openai-completions","openai-responses"]; currentIndex: editor.draft.api==="openai-responses"?1:0; wheelEnabled:false; onActivated: editor.edit("api",currentText) }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap; visible: editor.custom; text: "Authentication" }
 ComboBox { id: mode;Accessible.name:"Connection authentication mode"; visible: editor.custom; Layout.fillWidth:true;Layout.minimumWidth:0; model:["none","api-key","environment"]; currentIndex: Math.max(0,model.indexOf((editor.draft.auth||{}).mode||"none")); wheelEnabled:false; onActivated: editor.edit("auth",currentText==="environment"?{mode:currentText,envKey:"LOCAL_API_KEY"}:{mode:currentText}) }
 TextField { Accessible.name:"Credential environment variable name";visible: editor.custom&&(editor.draft.auth||{}).mode==="environment"; Layout.fillWidth:true;Layout.minimumWidth:0; placeholderText: "Named environment variable"; text: (editor.draft.auth||{}).envKey||""; onTextEdited: editor.edit("auth",{mode:"environment",envKey:text}) }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0; text: "Provider options (JSON). Azure: kind, baseUrl/resourceName, apiVersion, deployments as [{modelId,deployment}]. Bedrock: {kind:bedrock,region}. Other providers: {kind:none}. Profile/account/file references are entered through Pi setup above."; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
 TextArea { id:optionsJson;Accessible.name:"Provider options JSON"; objectName: "providerOptions"; Layout.fillWidth:true;Layout.minimumWidth:0; wrapMode: TextEdit.WrapAnywhere; textFormat: TextEdit.PlainText; selectByMouse: true; onTextChanged: if(activeFocus&&!editor.resetting)editor.jsonEdit("options",text) }
 Label { Layout.fillWidth:true;Layout.minimumWidth:0; text: "Headers (JSON array of {name,value} or {name,secretRef}). Secret headers use named environment references; enter no tokens here."; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted }
 TextArea { id:headersJson;Accessible.name:"Provider header references JSON"; Layout.fillWidth:true;Layout.minimumWidth:0; wrapMode: TextEdit.WrapAnywhere; textFormat: TextEdit.PlainText; selectByMouse: true; onTextChanged: if(activeFocus&&!editor.resetting)editor.jsonEdit("headers",text) }
 Label { visible: editor.custom; Layout.fillWidth:true;Layout.minimumWidth:0; text: "Models (JSON array). Each model needs id, name, contextWindow, maxTokens and reasoning. Add the local server’s exact model ID; no probe is sent."; wrapMode: Text.Wrap; textFormat: Text.PlainText }
 TextArea { id:modelsJson;Accessible.name:"Provider models JSON"; objectName:"providerModels"; visible: editor.custom; Layout.fillWidth:true;Layout.minimumWidth:0; wrapMode:TextEdit.WrapAnywhere; textFormat:TextEdit.PlainText; selectByMouse:true; onTextChanged:if(activeFocus&&!editor.resetting)editor.jsonEdit("models",text) }
 Label { visible: editor.custom; Layout.fillWidth:true;Layout.minimumWidth:0; text:"Compatibility flags (JSON object): optional public Pi flags for the selected OpenAI API. Omit unused flags."; wrapMode:Text.Wrap; textFormat:Text.PlainText }
 TextArea { id:compatJson;Accessible.name:"Compatibility flags JSON"; visible:editor.custom; Layout.fillWidth:true;Layout.minimumWidth:0; wrapMode:TextEdit.WrapAnywhere; textFormat:TextEdit.PlainText; selectByMouse:true; onTextChanged:if(activeFocus&&!editor.resetting)editor.jsonEdit("compat",text) }
 Label { visible: editor.validation.length>0; Layout.fillWidth:true;Layout.minimumWidth:0; text:editor.validation; wrapMode:Text.Wrap; textFormat:Text.PlainText }
 Flow { Layout.fillWidth:true;Layout.minimumWidth:0; spacing:8
  FormButton { text:"Apply provider configuration"; enabled:editor.bridge.canMutate&&!editor.validation.length; onClicked:editor.bridge.saveConnection(editor.draft) }
  FormButton { text:"Reload provider"; onClicked:editor.reset() }
  FormButton { text:"Disable connection…"; enabled:editor.bridge.canMutate&&!!editor.bridge.target.connectionId; onClicked:disable.open() }
 }
 Dialog {
  enter:Transition { NumberAnimation { property:"opacity";from:0;to:1;duration:Theme.reducedMotion?0:150 } }
  exit:Transition { NumberAnimation { property:"opacity";from:1;to:0;duration:Theme.reducedMotion?0:150 } }
 id:disable; modal:true; title:"Disable this connection?"; standardButtons:Dialog.Cancel|Dialog.Ok; onAccepted:editor.bridge.removeConnection(editor.bridge.target.connectionId) }
 Connections { target:editor.bridge; function onChanged(){if(JSON.stringify(editor.bridge.definition)!==editor.lastDefinition){editor.lastDefinition=JSON.stringify(editor.bridge.definition);editor.reset()}} }
 property string lastDefinition:""
 Component.onCompleted:reset()
}
