import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
ColumnLayout {
 id: message
 property string sourceText: ""
 property bool complete: true
 property bool truncated: false
 property bool showSource: false
 function routeWheel(event) {
  var shifted=event.modifiers&Qt.ShiftModifier
  var dx=event.pixelDelta.x!==0?event.pixelDelta.x:event.angleDelta.x/120*60
  var dy=event.pixelDelta.y!==0?event.pixelDelta.y:event.angleDelta.y/120*60
  if(shifted||Math.abs(dx)>Math.abs(dy)){
   var delta=dx!==0?dx:dy;var flick=viewport.contentItem
   if(delta===0||viewport.contentWidth<=viewport.availableWidth){event.accepted=false;return}
   flick.cancelFlick();flick.contentX=Math.max(0,Math.min(flick.contentX-delta,viewport.contentWidth-viewport.availableWidth));event.accepted=true;return
  }
  if(dy===0){event.accepted=false;return}
  verticalScrollRequested(dy);event.accepted=true
 }
 property alias controller: markdown
 signal verticalScrollRequested(real delta)
 signal fullSourceRequested()
 spacing: 6
 MarkdownController { id: markdown }
 onSourceTextChanged: markdown.setSource(sourceText, complete)
 onCompleteChanged: markdown.setSource(sourceText, complete)
 Label { Layout.fillWidth: true; visible: markdown.renderError.length > 0; text: markdown.renderError; textFormat: Text.PlainText; wrapMode: Text.Wrap; opacity: 0.7 }
 Label { visible: markdown.hasPendingText; text: "New text is waiting."; textFormat: Text.PlainText; opacity: 0.7 }
 ScrollView {
  id: viewport
  Layout.fillWidth: true; Layout.preferredHeight: (message.showSource ? literal.implicitHeight : rendered.implicitHeight) + (horizontal.visible ? horizontal.height : 0)
  clip: true
  ScrollBar.vertical.policy: ScrollBar.AlwaysOff
  ScrollBar.horizontal: ScrollBar { id: horizontal }
  contentWidth: Math.max(availableWidth, message.showSource ? literal.contentWidth : rendered.contentWidth)
  contentHeight: message.showSource ? literal.implicitHeight : rendered.implicitHeight
  // The displayed editor owns the content height. Keep both editor sizes
  // explicit rather than using ScrollView's automatic TextArea attachment.
  Item {
   width: viewport.contentWidth; height: viewport.contentHeight
   TextArea {
    id: rendered; Accessible.name:"Tilde response";Accessible.ignored:!message.complete; objectName: "safeMarkdownText"; visible: !message.showSource
    width: viewport.availableWidth; height: implicitHeight; readOnly: true; selectByMouse: true; persistentSelection: true; textFormat: TextEdit.RichText; wrapMode: TextEdit.Wrap
    background: null; padding: 0
    WheelHandler { orientation: Qt.Horizontal; target: null; acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad; onWheel: function(event){message.routeWheel(event)} }
    WheelHandler { target: null; acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad; onWheel: function(event){message.routeWheel(event)} }
    onSelectedTextChanged: markdown.setSelectionActive(selectedText.length > 0)
    onLinkActivated: function(link) { if (markdown.previewLink(link)) destination.open() }
   }
   TextArea { id: literal;Accessible.name:"Message source";Accessible.ignored:!message.complete; visible: message.showSource; width: viewport.availableWidth; height: implicitHeight; readOnly: true; selectByMouse: true; wrapMode: TextEdit.WrapAnywhere; textFormat: TextEdit.PlainText; text: markdown.renderedSource; background: null; padding: 0; onSelectedTextChanged: markdown.setSelectionActive(selectedText.length > 0)
    WheelHandler { orientation: Qt.Horizontal; target: null; acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad; onWheel: function(event){message.routeWheel(event)} }
    WheelHandler { target: null; acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad; onWheel: function(event){message.routeWheel(event)} }
   }
  }
 }
 RowLayout {
  Layout.fillWidth: true
  ToolButton { text: message.showSource ? "Rendered" : "Source"; onClicked: { rendered.deselect(); literal.deselect(); message.showSource = !message.showSource; markdown.setSelectionActive(false) } }
  ToolButton { text: message.truncated ? "Copy displayed source" : "Copy source"; onClicked: markdown.copySource() }
  ToolButton { text: "Copy selection"; visible: rendered.selectedText.length > 0 || literal.selectedText.length > 0; onClicked: markdown.copySelection(message.showSource ? literal.selectedText : rendered.selectedText) }
  ComboBox { id: code;Accessible.name:"Code block language"; visible: markdown.codeBlocks.length > 0; Layout.maximumWidth: 150; model: markdown.codeBlocks; textRole: "language" }
  ToolButton { text: "Copy code"; visible: code.visible; onClicked: markdown.copyCode(code.currentIndex) }
  ToolButton { text: "Complete source…"; visible: message.truncated; onClicked: message.fullSourceRequested() }
  Item { Layout.fillWidth: true }
 }
 Dialog {
  enter:Transition { NumberAnimation { property:"opacity";from:0;to:1;duration:Theme.reducedMotion?0:150 } }
  exit:Transition { NumberAnimation { property:"opacity";from:1;to:0;duration:Theme.reducedMotion?0:150 } }

  id: destination; title: "Open link"; parent: Overlay.overlay; anchors.centerIn: parent; modal: true; width: Math.min(600, parent ? parent.width - 24 : 500)
  onClosed: markdown.dismissLink()
  contentItem: Label { text: markdown.pendingLink; wrapMode: Text.WrapAnywhere; textFormat: Text.PlainText }
  footer: DialogButtonBox {
   Button { text: "Cancel"; onClicked: destination.close() }
   Button { text: "Open"; focus: false; onClicked: { markdown.openLink(); destination.close() } }
  }
 }
 Component.onCompleted: { markdown.attach(rendered.textDocument); markdown.setSource(sourceText, complete) }
}
