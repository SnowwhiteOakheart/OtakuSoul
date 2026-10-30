// KWin script for the OtakuSoul desktop pet under KDE Wayland (loaded by `kwin_bridge.rs`).
// A Wayland client cannot see the pointer over other programs nor the other windows; KWin can.
// This script reports them to the app over D-Bus: pointer, active window (fullscreen or not)
// and the windows top to bottom. Only geometry and ids leave KWin, never titles or content.
// Placeholders are filled in by the app: the service of this app instance, its process id and
// this script's plugin name.
var SERVICE = "%SERVICE%";
var OWN_PID = %PID%;
var PLUGIN = "%PLUGIN%";
var PET_CAPTION = "OtakuSoul Pet";

function send(method, data) {
    callDBus(SERVICE, "/Pet", "org.otakusoul.Pet", method, JSON.stringify(data));
}

function isPet(w) {
    return w.pid === OWN_PID && w.caption === PET_CAPTION;
}

function onCurrentDesktop(w) {
    return w.onAllDesktops || w.desktops.indexOf(workspace.currentDesktop) >= 0;
}

// Normal windows and dialogs the pet could stand on, top to bottom: [id, x, y, width, height].
function windows() {
    var list = workspace.stackingOrder;
    var out = [];
    for (var i = list.length - 1; i >= 0; i--) {
        var w = list[i];
        if (w.deleted || w.minimized || w.hidden || isPet(w) || !onCurrentDesktop(w)) continue;
        if (!w.normalWindow && !w.dialog) continue;
        var g = w.frameGeometry;
        out.push([String(w.internalId), Math.round(g.x), Math.round(g.y), Math.round(g.width), Math.round(g.height)]);
    }
    return out;
}

function screen() {
    var w = workspace.activeWindow;
    if (!w || isPet(w)) return [false, ""];
    return [!!w.fullScreen, String(w.internalId)];
}

var lastCursor = "";
var lastWindows = "";
var lastScreen = "";
var tick = 0;

var timer = new QTimer();
timer.interval = 33;
timer.timeout.connect(function () {
    tick++;
    var p = workspace.cursorPos;
    var cursor = [Math.round(p.x), Math.round(p.y)];
    var key = cursor.join(",");
    if (key !== lastCursor) {
        lastCursor = key;
        send("Cursor", cursor);
    }
    if (tick % 3 !== 0) return;
    var list = windows();
    var listKey = JSON.stringify(list);
    if (listKey !== lastWindows) {
        lastWindows = listKey;
        send("Windows", list);
    }
    var state = screen();
    var stateKey = JSON.stringify(state);
    // Every two seconds also unchanged: tells the app that the script still runs.
    if (stateKey !== lastScreen || tick % 60 === 0) {
        lastScreen = stateKey;
        send("Screen", state);
    }
    // The app is gone (crashed or closed without unloading): stop and unload this script.
    if (tick % 60 === 0) {
        callDBus("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "NameHasOwner", SERVICE,
            function (present) {
                if (present) return;
                timer.stop();
                callDBus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "unloadScript", PLUGIN);
            });
    }
});
timer.start();
