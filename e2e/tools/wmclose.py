"""Sends WM_DELETE_WINDOW to every top-level X11 window of a process (like clicking the close button)."""
import ctypes, sys
pid = int(sys.argv[1])
x = ctypes.cdll.LoadLibrary('libX11.so.6')
x.XOpenDisplay.restype = ctypes.c_void_p
x.XDefaultRootWindow.restype = ctypes.c_ulong
x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x.XInternAtom.restype = ctypes.c_ulong
x.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
d = x.XOpenDisplay(None)
if not d: sys.exit('no display')
root = x.XDefaultRootWindow(d)
NET_WM_PID = x.XInternAtom(d, b'_NET_WM_PID', 0)
WM_PROTOCOLS = x.XInternAtom(d, b'WM_PROTOCOLS', 0)
WM_DELETE = x.XInternAtom(d, b'WM_DELETE_WINDOW', 0)
x.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
x.XGetWindowProperty.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_long, ctypes.c_long, ctypes.c_int, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte))]
def window_pid(w):
    t, f, n, b = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_ulong(), ctypes.c_ulong()
    p = ctypes.POINTER(ctypes.c_ubyte)()
    if x.XGetWindowProperty(d, w, NET_WM_PID, 0, 1, 0, 6, ctypes.byref(t), ctypes.byref(f), ctypes.byref(n), ctypes.byref(b), ctypes.byref(p)) == 0 and n.value:
        return ctypes.cast(p, ctypes.POINTER(ctypes.c_ulong))[0]
    return None
def children(w):
    r, pa, ch, n = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.POINTER(ctypes.c_ulong)(), ctypes.c_uint()
    x.XQueryTree(d, w, ctypes.byref(r), ctypes.byref(pa), ctypes.byref(ch), ctypes.byref(n))
    return [ch[i] for i in range(n.value)]
class Msg(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong), ('send_event', ctypes.c_int), ('display', ctypes.c_void_p), ('window', ctypes.c_ulong), ('message_type', ctypes.c_ulong), ('format', ctypes.c_int), ('data', ctypes.c_long * 5), ('pad', ctypes.c_long * 12)]
x.XFlush.argtypes = [ctypes.c_void_p]
x.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]
sent = 0
stack = children(root)
while stack:
    w = stack.pop()
    if window_pid(w) == pid:
        m = Msg(); m.type = 33; m.window = w; m.message_type = WM_PROTOCOLS; m.format = 32
        m.data[0] = WM_DELETE; m.data[1] = 0
        x.XSendEvent(d, w, 0, 0, ctypes.byref(m)); sent += 1
    else:
        stack.extend(children(w))
x.XFlush(d)
print('sent', sent)
