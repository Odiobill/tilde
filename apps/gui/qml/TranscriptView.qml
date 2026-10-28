import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Tilde.Native 1.0
Item {
 id: root
 required property var bridge
 signal inspectRequested(string operationId,string fingerprint)
 signal reviewRequested(string operationId,string fingerprint)
 signal sourceRequested(string entryId,int messageIndex)
 property bool followNear: true
 property bool newActivity: false
 property bool ready: false
 property bool holding: false
 property bool applyingPosition: false
 property bool initialPositioned: false
 property bool followAfter: true
 property string anchorId: ""
 property real anchorOffset: 0
 property int passes: 0
 property string lastMarker: ""
 function remember() {
  if (!ready || holding || view.count === 0) return
  for (var y=1;y<view.height;y+=4) { var index=view.indexAt(view.width/2,view.contentY+y); if(index>=0) { var item=view.itemAtIndex(index); if(item) { anchorId=bridge.chat.idAt(index);anchorOffset=view.contentY-item.y; } return } }
 }
 function begin(prepend) {
  if (!ready || holding) return
  remember(); holding=true; passes=0; followAfter=followNear && !prepend
  if (prepend) followNear=false
 }
 // Layout signals include changes caused by our own positioning and by
 // message geometry settling. They may finish a current correction,
 // but must never create a new scroll transaction by themselves.
 function changedLayout() { if(ready&&holding)settle.restart() }
 function restore() {
  if (!holding || !ready) return
  applyingPosition=true
  view.forceLayout()
  if (followAfter) view.positionViewAtEnd()
  else { var index=bridge.chat.indexOfId(anchorId); if(index>=0) { view.positionViewAtIndex(index,ListView.Beginning);view.forceLayout();var item=view.itemAtIndex(index);if(item)view.contentY=item.y+anchorOffset } }
  applyingPosition=false;initialPositioned=true
  if (++passes<3) settle.restart()
  else { holding=false; followNear=followAfter; remember() }
 }
 function scrollWheel(delta) {
  holding=false;settle.stop();view.cancelFlick()
  view.contentY=Math.max(0,Math.min(view.contentY-delta,Math.max(0,view.contentHeight-view.height)))
  followNear=view.contentHeight-view.height-view.contentY<=48;remember()
 }
 function latest() { followNear=true;newActivity=false;bridge.jumpToLatest();begin(false);followAfter=true;settle.restart() }
 Timer { id: settle; interval: 16; onTriggered: root.restore() }
 Flickable {
  id: view; objectName: "transcript"; anchors.fill: parent; clip: true
  contentWidth: width; contentHeight: rows.implicitHeight; flickableDirection: Flickable.VerticalFlick; maximumFlickVelocity: Theme.reducedMotion?0:2500; boundsBehavior: Flickable.StopAtBounds
  readonly property int count: messages.count
  // The bridge bounds the tail to 128 rows / 256 KiB, plus a bounded live preview.
  // Measuring that whole window keeps the scroll extent independent of position.
  function forceLayout() { rows.forceLayout() }
  function itemAtIndex(index: int): Item { return messages.itemAt(index) }
  function indexAt(x: real,y: real): int { if(x<0||x>width)return -1;for(var i=0;i<count;i++){var item=messages.itemAt(i);if(item&&item.visible&&y>=item.y&&y<item.y+item.height)return i}return -1 }
  function positionViewAtIndex(index: int,mode: int) { rows.forceLayout();var item=messages.itemAt(index);if(!item)return;var y=item.y;if(mode===ListView.End)y+=item.height-height;else if(mode===ListView.Center)y+=(item.height-height)/2;contentY=Math.max(0,Math.min(y,Math.max(0,contentHeight-height))) }
  function positionViewAtEnd() { rows.forceLayout();contentY=Math.max(0,contentHeight-height) }
  ScrollBar.vertical: ScrollBar { onPressedChanged: { if(pressed){root.holding=false;settle.stop()} } }
  WheelHandler {
   target: null
   onWheel: function(event) {
    if(event.modifiers&Qt.ShiftModifier||event.angleDelta.y===0&&event.pixelDelta.y===0){event.accepted=false;return}
    var delta=event.pixelDelta.y!==0?event.pixelDelta.y:event.angleDelta.y/120*60
    root.scrollWheel(delta);event.accepted=true
   }
  }
  onContentYChanged: { if(root.ready&&root.initialPositioned&&!root.applyingPosition&&!root.holding) { root.followNear=contentHeight-height-contentY<=48;root.remember() } }
  onMovementStarted: { root.holding=false;settle.stop() }
  onMovementEnded: { root.followNear=contentHeight-height-contentY<=48;root.remember() }
  onContentHeightChanged: root.changedLayout()
  onWidthChanged: { root.begin(false);root.changedLayout() }
  onHeightChanged: { root.begin(false);root.changedLayout() }
  Column {
   id: rows; width: view.width; spacing: 0
   Item {
    width: view.width; height: bridge.hasOlderHistory ? 46 : 0
    Button { anchors.centerIn: parent; visible: bridge.hasOlderHistory; text: "Load older messages"; onClicked: { root.begin(true);root.holding=false;bridge.loadOlder() } }
   }
   Repeater {
    id: messages; model: bridge.chat
    delegate: MessageDelegate {
     width: view.width; bridge: root.bridge
     onVerticalScrollRequested: function(delta) { root.scrollWheel(delta) }
     onInspectRequested: function(id,fp) { root.inspectRequested(id,fp) }
     onReviewRequested: function(id,fp) { root.reviewRequested(id,fp) }
     onSourceRequested: function(entry,index) { root.sourceRequested(entry,index) }
     onLayoutChanged: root.changedLayout()
    }
   }
  }
 }
 Label { anchors.centerIn: parent; visible: view.count===0; width: Math.min(440,parent.width-32); horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; textFormat: Text.PlainText; color: Theme.muted; text: bridge.chatLoading ? "Loading conversation…" : "What would you like to work on?\nYour conversations stay on this computer." }
 Button { anchors.bottom: parent.bottom; anchors.bottomMargin: 12; anchors.horizontalCenter: parent.horizontalCenter; visible: !root.followNear; text: root.newActivity ? "New activity · Jump to latest" : "Jump to latest"; onClicked: root.latest() }
 Connections {
  target: bridge.chat
  function onRowsAboutToBeInserted(parent,first,last) { root.begin(first===0&&view.count>0) }
  function onRowsAboutToBeRemoved() { root.begin(false) }
  function onRowsInserted() { root.changedLayout() }
  function onRowsRemoved() { root.changedLayout() }
  function onDataChanged() { root.begin(false);root.changedLayout() }
  function onModelAboutToBeReset() { root.begin(false) }
  function onModelReset() { root.changedLayout() }
 }
 Connections { target: bridge; function onViewChanged() { var marker=bridge.chat.idAt(view.count-1)+"/"+bridge.partial;if(root.ready&&marker!==root.lastMarker&&!root.followNear)root.newActivity=true;root.lastMarker=marker } }
 Component.onCompleted: { ready=true;holding=true;followAfter=true;settle.restart() }
}
