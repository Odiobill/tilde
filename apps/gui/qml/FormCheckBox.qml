import QtQuick
import QtQuick.Controls

CheckBox {
    id: control
    implicitWidth: Math.min(parent ? parent.width : 480,
                            label.implicitWidth + leftPadding + rightPadding)
    contentItem: Text {
        id: label
        text: control.text
        font: control.font
        color: control.palette.windowText
        textFormat: Text.PlainText
        wrapMode: Text.Wrap
        leftPadding: control.indicator && !control.mirrored ? control.indicator.width + control.spacing : 0
        rightPadding: control.indicator && control.mirrored ? control.indicator.width + control.spacing : 0
        verticalAlignment: Text.AlignVCenter
        Accessible.ignored: true
    }
}
