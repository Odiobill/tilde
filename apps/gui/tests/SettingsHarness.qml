import QtQuick
import QtQuick.Controls
import "../qml" as Local
ApplicationWindow{visible:true;width:520;height:400;Local.SettingsPage{anchors.fill:parent;bridge:settingsController}}
