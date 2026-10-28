import QtQuick
import QtQuick.Controls

Button {
    id: control
    // Flow children need a bounded implicit width; the native background,
    // focus indicator and button accessibility remain provided by Button.
    implicitWidth: Math.min(parent ? parent.width : 480,
                            Math.max(implicitBackgroundWidth + leftInset + rightInset,
                                     label.implicitWidth + leftPadding + rightPadding))
    contentItem: Text {
        id: label
        text: control.text
        font: control.font
        color: control.palette.buttonText
        textFormat: Text.PlainText
        wrapMode: Text.Wrap
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        Accessible.ignored: true
    }
}
