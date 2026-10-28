import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
Pane {
 id: page; objectName:"settingsView"
 required property var bridge
 signal backRequested()
 property var localAccessibility: typeof accessibilityPreferences!=="undefined" ? accessibilityPreferences : null
 property bool pendingJump:true
 property string anchor:"models-and-providers"
 property var headings:[{id:"models-and-providers",name:"Models and providers"},{id:"credential-storage",name:"Credential storage"},{id:"appearance",name:"Appearance"},{id:"work-limits",name:"Work limits"},{id:"tools-and-privacy",name:"Tools and privacy"},{id:"desktop",name:"Desktop"}]
 function jump(id){pendingJump=false;var item=id==="models-and-providers"?modelsHeading:id==="credential-storage"?storeHeading:id==="appearance"?appearanceHeading:id==="work-limits"?limitsHeading:id==="tools-and-privacy"?toolsHeading:desktopHeading;scroll.contentY=Math.max(0,Math.min(item.y,scroll.contentHeight-scroll.height))}
 function requestBack(){auth.clearFocus();if(bridge.dirty||limitsEditor.dirty)discard.open();else{bridge.leavePage();backRequested()}}
 background:Rectangle{color:Theme.background}
 ColumnLayout {
  anchors.fill:parent; spacing:10
  RowLayout { Layout.fillWidth:true
   Button { id:settingsBack; objectName:"settingsBack";text:"‹ Conversation";onClicked:page.requestBack() }
   Label { text:"Settings";elide:Text.ElideRight;Layout.minimumWidth:0;font.pixelSize:Math.round(Theme.bodySize*24/15);font.bold:true;Layout.fillWidth:true }
   Button { text:"Reload";onClicked:page.bridge.reload() }
  }
  Flickable {
   id:headingsView;objectName:"settingsNavigation";Accessible.role:Accessible.ToolBar;Accessible.name:"Settings headings";Layout.fillWidth:true;Layout.minimumWidth:0;Layout.preferredHeight:headingsRow.implicitHeight+(headingsBar.visible?headingsBar.implicitHeight:0);clip:true
   contentWidth:headingsRow.implicitWidth;contentHeight:headingsRow.implicitHeight;flickableDirection:Flickable.HorizontalFlick;maximumFlickVelocity:Theme.reducedMotion?0:2500;boundsBehavior:Flickable.StopAtBounds
   ScrollBar.horizontal:ScrollBar{id:headingsBar;Accessible.name:"Settings headings scrollbar";policy:ScrollBar.AsNeeded}
   Row { id:headingsRow;spacing:4
    Repeater { model:page.headings;Button{required property var modelData;text:modelData.name;flat:true;activeFocusOnTab:true;onClicked:page.jump(modelData.id);onActiveFocusChanged:if(activeFocus){var point=mapToItem(headingsRow,0,0);if(point.x<headingsView.contentX)headingsView.contentX=point.x;else if(point.x+width>headingsView.contentX+headingsView.width)headingsView.contentX=Math.min(headingsView.contentWidth-headingsView.width,point.x+width-headingsView.width)}} }
   }
  }
  Label { visible:page.bridge.error.length>0;Layout.fillWidth:true;Layout.minimumWidth:0;text:page.bridge.error.replace(/_/g," ")+(page.bridge.conflict?" · reload accepted values or keep editing":"");textFormat:Text.PlainText;wrapMode:Text.Wrap;color:Theme.muted }
  Flickable {
   id:scroll;objectName:"settingsFlickable";Layout.fillWidth:true;Layout.minimumWidth:0;Layout.fillHeight:true;clip:true
   contentWidth:width;contentHeight:form.implicitHeight;maximumFlickVelocity:Theme.reducedMotion?0:2500;boundsBehavior:Flickable.StopAtBounds
   ScrollBar.vertical:ScrollBar{objectName:"settingsScrollBar";policy:ScrollBar.AsNeeded}
   // Recheck after layout changes settle; user scrolling does not schedule this.
   Timer { id:revealLater;interval:0;onTriggered:if(page.Window.window)scroll.reveal(page.Window.window.activeFocusItem) }
   function scheduleReveal(){revealLater.restart()}
   function reveal(item){if(!item||!item.mapToItem||height<=0)return;var parent=item;while(parent&&parent!==form)parent=parent.parent;if(parent!==form)return;var point=item.mapToItem(form,0,0);if(point.y<contentY)contentY=Math.max(0,point.y-10);else if(point.y+item.height>contentY+height)contentY=Math.max(0,Math.min(contentHeight-height,point.y+item.height-height+10))}
   onWidthChanged:scheduleReveal()
   onHeightChanged:scheduleReveal()
   onContentHeightChanged:{if(page.pendingJump)jumpLater.restart();scheduleReveal()}
   ColumnLayout {
    id:form;width:Math.min(860,scroll.width-20);spacing:14
    Label { id:modelsHeading;Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap;objectName:"heading-models-and-providers";text:"Models and providers";font.pixelSize:Math.round(Theme.bodySize*22/15);font.bold:true }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:"Choose the next-input model, or manage a provider independently. Settings never probe a server, refresh sign-in, or send a model request unless you explicitly request that operation.";wrapMode:Text.Wrap;textFormat:Text.PlainText;color:Theme.muted }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:"Current: "+((page.bridge.settings.selection||{}).providerId||"unavailable")+" / "+((page.bridge.settings.selection||{}).modelId||"unavailable");wrapMode:Text.Wrap;textFormat:Text.PlainText }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;visible:!!page.bridge.settings.selectedModel;text:page.bridge.settings.selectedModel?"API: "+page.bridge.settings.selectedModel.api+" · context "+page.bridge.settings.selectedModel.contextWindow+" tokens · maximum output "+page.bridge.settings.selectedModel.maxTokens+" tokens":"";wrapMode:Text.Wrap;textFormat:Text.PlainText;color:Theme.muted }
    TextField { id:providerSearch;objectName:"providerSearch";Accessible.name:"Search providers";Layout.fillWidth:true;Layout.minimumWidth:0;placeholderText:"Search all providers · literal text";onTextEdited:providerDelay.restart() }
    Timer { id:providerDelay;interval:200;onTriggered:page.bridge.loadProviders(providerSearch.text) }
    Repeater { model:page.bridge.providers
     RowLayout { required property var modelData;Layout.fillWidth:true
      Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:modelData.name+" · "+modelData.providerId+(modelData.disabled?" · disabled":"");wrapMode:Text.Wrap;textFormat:Text.PlainText }
      FormButton { text:"Manage";onClicked:page.bridge.inspectProvider(parent.modelData) }
     }
    }
    Flow { Layout.fillWidth:true;Layout.minimumWidth:0;spacing:8
     FormButton { visible:page.bridge.providersMore;text:"Load more providers";onClicked:page.bridge.loadProviders(providerSearch.text,true) }
     FormButton { text:"Add OpenAI-compatible connection";enabled:page.bridge.canMutate;onClicked:page.bridge.newConnection() }
    }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;visible:!!page.bridge.target.providerId;text:"Managing: "+(page.bridge.target.providerId||"");wrapMode:Text.Wrap;textFormat:Text.PlainText;font.bold:true }
    AuthSetupPanel { id:auth;Layout.fillWidth:true;Layout.minimumWidth:0;visible:!!page.bridge.target.providerId;bridge:page.bridge
     function clearFocus(){forceActiveFocus()}
    }
    Flow { Layout.fillWidth:true;Layout.minimumWidth:0;spacing:8
     FormButton { text:"Refresh selected catalog";enabled:!!page.bridge.target.providerId&&!page.bridge.repairingRetained;onClicked:page.bridge.refreshModels(page.bridge.target) }
     FormButton { visible:page.bridge.catalogRefresh.state==="running";text:"Cancel catalog refresh";onClicked:page.bridge.cancelModelRefresh() }
     Label { text:page.bridge.catalogRefresh.state||"";textFormat:Text.PlainText }
    }
    TextField { id:modelSearch;Accessible.name:"Search provider models";Layout.fillWidth:true;Layout.minimumWidth:0;placeholderText:"Search this provider’s models";onTextEdited:modelDelay.restart() }
    Timer { id:modelDelay;interval:200;onTriggered:page.bridge.loadModels(page.bridge.target,modelSearch.text) }
    ComboBox { id:modelChoice;objectName:"settingsModelSelector";Accessible.name:"Next-input model";Layout.fillWidth:true;Layout.minimumWidth:0;model:page.bridge.models;textRole:"name";valueRole:"modelId";displayText:currentIndex>=0?currentText:(page.bridge.modelSelection.modelId?"Selected: "+page.bridge.modelSelection.modelId+" (outside these results)":"Choose a model");currentIndex:-1;wheelEnabled:false;onActivated:page.bridge.chooseModel(currentIndex) }
    Flow { Layout.fillWidth:true;Layout.minimumWidth:0;spacing:8
     FormButton { visible:page.bridge.modelsMore;text:"Load more models";onClicked:page.bridge.loadModels(page.bridge.target,modelSearch.text,true) }
     FormButton { text:"Reload accepted model";onClicked:page.bridge.reloadModelSelection() }
     FormButton { text:"Apply model selection";enabled:page.bridge.canMutate&&page.bridge.modelSelectionAvailable;onClicked:page.bridge.applyModelSelection() }
    }
    Label { visible:!!page.bridge.settings.authRecovery;Layout.fillWidth:true;Layout.minimumWidth:0;text:"A retained run still needs explicit Resume after access is repaired. Its original connection and request counters are preserved.";wrapMode:Text.Wrap;textFormat:Text.PlainText }
    FormButton { objectName:"repairRetainedAuth";visible:!!page.bridge.settings.authRecovery;text:"Repair retained connection";onClicked:page.bridge.repairRetainedConnection() }
    Label { visible:page.bridge.repairingRetained;Layout.fillWidth:true;Layout.minimumWidth:0;text:"Repairing the retained connection · original credential store: "+(page.bridge.target.authFile||"")+" · original destination: "+(page.bridge.definition.baseUrl||(page.bridge.definition.options||{}).baseUrl||page.bridge.target.providerId||"")+". Provider definitions and next-input defaults remain unchanged. Resume is a separate action.";wrapMode:Text.WrapAnywhere;textFormat:Text.PlainText }
    FormButton { objectName:"resumeAuth";visible:!!page.bridge.settings.authRecovery;text:"Resume retained run";onClicked:{var intent=Object.assign({},page.bridge.settings.authRecovery.owner);delete intent.target;page.bridge.resumeAuth(intent)} }
    ProviderEditor { Layout.fillWidth:true;Layout.minimumWidth:0;enabled:!page.bridge.repairingRetained;bridge:page.bridge }
    Rectangle { Layout.fillWidth:true;Layout.minimumWidth:0;implicitHeight:1;color:Theme.muted;opacity:0.3 }
    Label { id:storeHeading;Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap;objectName:"heading-credential-storage";text:"Credential storage";font.pixelSize:Math.round(Theme.bodySize*22/15);font.bold:true }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:"The shared Pi-format auth.json file is read/write storage: replacement or removal affects every client using it. Choose a separate absolute path for separate credentials. Stored secrets are never loaded into fields.";wrapMode:Text.Wrap;textFormat:Text.PlainText;color:Theme.muted }
    TextField { id:authFile;objectName:"credentialStorePath";Accessible.name:"Credential store path";Layout.fillWidth:true;Layout.minimumWidth:0;text:(page.bridge.settings.selection||{}).authFile||"";placeholderText:"Absolute auth.json path";onTextEdited:page.bridge.markDirty("store") }
    FormButton { text:"Apply credential store";enabled:page.bridge.canMutate&&authFile.text.startsWith("/");onClicked:page.bridge.applyStore(authFile.text) }
    Label { id:appearanceHeading;Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap;objectName:"heading-appearance";text:"Appearance";font.pixelSize:Math.round(Theme.bodySize*22/15);font.bold:true }
    ComboBox { Accessible.name:"Color theme"; model:["system","light","dark"];currentIndex:Math.max(0,model.indexOf(page.bridge.preferences.theme||"system"));wheelEnabled:false;onActivated:page.bridge.setPreference("theme",currentText) }
    FormCheckBox { objectName:"reducedMotion";text:"Reduce motion";Accessible.name:"Reduce motion";enabled:!!page.localAccessibility&&page.localAccessibility.error.length===0;checked:page.localAccessibility? page.localAccessibility.reducedMotion : false;onToggled:if(page.localAccessibility)page.localAccessibility.reducedMotion=checked }
    Label { objectName:"motionPreferenceError";visible:!!page.localAccessibility&&page.localAccessibility.error.length>0;Layout.fillWidth:true;Layout.minimumWidth:0;text:page.localAccessibility? "Motion preference: "+page.localAccessibility.error : "";wrapMode:Text.Wrap;Accessible.name:text;textFormat:Text.PlainText }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:"Color theme and Desktop options use Apply below. Reduce motion is saved immediately.";wrapMode:Text.Wrap;textFormat:Text.PlainText;color:Theme.muted }
    Item { id:limitsHeading;objectName:"heading-work-limits";Layout.fillWidth:true;Layout.minimumWidth:0;implicitHeight:0 }
    WorkLimitsEditor { id:limitsEditor;Layout.fillWidth:true;Layout.minimumWidth:0;bridge:page.bridge }
    Label { id:toolsHeading;Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap;objectName:"heading-tools-and-privacy";text:"Tools and privacy";font.pixelSize:Math.round(Theme.bodySize*22/15);font.bold:true }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:"Typed tool roots and policy are read-only here. An approved shell has ordinary account access to files, network, credentials, journals and same-user services. Typed roots do not contain it. Redaction cannot prevent transmission or guarantee journal integrity after a grant.";wrapMode:Text.Wrap;textFormat:Text.PlainText }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:"Typed roots:\n"+(page.bridge.toolPolicy.roots||[]).join("\n")+"\nPolicy: "+(page.bridge.toolPolicy.policyRevision||"unavailable");wrapMode:Text.WrapAnywhere;textFormat:Text.PlainText }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:"Chat context goes to the configured hosted or local destination. Chats, drafts and receipts use private local storage. External Markdown resources remain blocked; opening any link is explicit.";wrapMode:Text.Wrap;textFormat:Text.PlainText;color:Theme.muted }
    Label { id:desktopHeading;Layout.fillWidth:true;Layout.minimumWidth:0;wrapMode:Text.Wrap;objectName:"heading-desktop";text:"Desktop";font.pixelSize:Math.round(Theme.bodySize*22/15);font.bold:true }
    Label { Layout.fillWidth:true;Layout.minimumWidth:0;text:"Notification status: "+(page.bridge.work.desktopStatus||"disabled")+". A missing tray host keeps the window available.";wrapMode:Text.Wrap;textFormat:Text.PlainText;color:Theme.muted }
    FormCheckBox { text:"Show tray icon";checked:!!page.bridge.preferences.trayEnabled;onToggled:page.bridge.setPreference("trayEnabled",checked) }
    FormCheckBox { text:"Hide on close when a tray host is available";checked:!!page.bridge.preferences.hideOnClose;onToggled:page.bridge.setPreference("hideOnClose",checked) }
    FormCheckBox { text:"Notify on successful completion";checked:!!page.bridge.preferences.notifyCompletion;onToggled:page.bridge.setPreference("notifyCompletion",checked) }
    FormCheckBox { objectName:"desktopNotifyAttention";text:"Notify when attention or approval is needed";checked:!!page.bridge.preferences.notifyAttention;onToggled:page.bridge.setPreference("notifyAttention",checked) }
    FormButton { objectName:"applyPreferences";text:"Apply Appearance and Desktop preferences";enabled:!!page.bridge.uiSettings.revision;onClicked:page.bridge.applyPreferences() }
    FormButton { text:"Reload accepted preferences";onClicked:page.bridge.reloadPreferences() }
    Item { Layout.fillWidth:true;Layout.minimumWidth:0;implicitHeight:24 }
   }
  }
 }
 Dialog {
  enter:Transition { NumberAnimation { property:"opacity";from:0;to:1;duration:Theme.reducedMotion?0:150 } }
  exit:Transition { NumberAnimation { property:"opacity";from:1;to:0;duration:Theme.reducedMotion?0:150 } }
 id:discard;title:"Discard unsaved Settings edits?";modal:true;standardButtons:Dialog.Discard|Dialog.Cancel;onDiscarded:{page.bridge.discardDrafts();page.bridge.leavePage();page.backRequested()} }
 Timer { id:modelChoiceLater;interval:0;onTriggered:if(page.Window.window)modelChoice.currentIndex=page.bridge.modelSelectionIndex }
 Connections { target:page.bridge;function onChanged(){modelChoiceLater.restart()} }
 Connections { target:page.Window.window;function onActiveFocusItemChanged(){
  // An explicit field focus wins over the deferred initial section jump.
  var item=page.Window.window? page.Window.window.activeFocusItem : null
  while(item&&item!==form)item=item.parent
  if(item===form){page.pendingJump=false;jumpLater.stop()}
  scroll.scheduleReveal()
 } }
 Timer { id:jumpLater;interval:16;onTriggered:{if(!page.Window.window)return;page.jump(page.anchor);settingsBack.forceActiveFocus(Qt.TabFocusReason)} }
 onAnchorChanged:{pendingJump=true;jumpLater.restart()}
 Component.onCompleted:{pendingJump=true;jumpLater.restart()}
}
