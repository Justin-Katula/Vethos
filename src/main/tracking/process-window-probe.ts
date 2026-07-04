import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import * as readline from 'node:readline'
import log from '../logging/setup'

export type ProcessWindowBounds = {
  windowId?: string
  minimized?: boolean
  pid: number
  x: number
  y: number
  width: number
  height: number
}

export type ForegroundWindowInfo = ProcessWindowBounds & {
  windowId: string
  processName: string
  title: string
}

export type VisibleWindowInfo = ForegroundWindowInfo

type PendingQuery = {
  resolve: (bounds: ProcessWindowBounds | null) => void
  timer: ReturnType<typeof setTimeout>
}

type PendingForeground = {
  resolve: (info: ForegroundWindowInfo | null) => void
  timer: ReturnType<typeof setTimeout>
}

type PendingVisibleWindows = {
  resolve: (windows: VisibleWindowInfo[]) => void
  timer: ReturnType<typeof setTimeout>
}

type PendingControl = {
  resolve: (ok: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

type WindowWatcher = (bounds: ProcessWindowBounds[]) => void
type WindowWatcherRegistration = {
  pid: number
  processName: string
  onBounds: WindowWatcher
}

export type OverlayWindowInsets = {
  left?: number
  top?: number
  right?: number
  bottom?: number
}

type AttachmentRegistration = {
  targetWindowId: string
  insets: Required<OverlayWindowInsets>
}

const QUERY_TIMEOUT_MS = 750
const STARTUP_TIMEOUT_MS = 3_000

// La sonde reste dans la session utilisateur d'Electron. Un service Windows
// (Session 0) ne peut pas énumérer de manière fiable les fenêtres du bureau.
// Add-Type charge le petit pont Win32 en mémoire : aucun .exe généré dans le
// projet, donc aucune interception par AppLocker/Application Control.
const PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies @('System.Drawing') -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class VethosWindowProbe {
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int index, IntPtr value);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hWnd, int index);

    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hWnd, int index, int value);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags
    );

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr hWnd,
        int attribute,
        out int value,
        int size
    );

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr hWnd,
        int attribute,
        out RECT value,
        int size
    );

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(
        IntPtr hWnd,
        int attribute,
        ref int value,
        int size
    );

    [DllImport("dwmapi.dll")]
    private static extern int DwmInvalidateIconicBitmaps(IntPtr hWnd);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetIconicThumbnail(IntPtr hWnd, IntPtr bitmap, uint flags);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetIconicLivePreviewBitmap(
        IntPtr hWnd,
        IntPtr bitmap,
        IntPtr clientPoint,
        uint flags
    );

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    private const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    private const int DWMWA_CLOAKED = 14;
    private const int DWMWA_FORCE_ICONIC_REPRESENTATION = 7;
    private const int DWMWA_HAS_ICONIC_BITMAP = 10;
    private const int DWMWA_DISALLOW_PEEK = 11;
    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWCP_ROUND = 2;
    private const int SW_MINIMIZE = 6;
    private const uint WM_SYSCOMMAND = 0x0112;
    private const int SC_MINIMIZE = 0xF020;
    private const int GWL_EXSTYLE = -20;
    private const int GWLP_HWNDPARENT = -8;
    private const uint GA_ROOTOWNER = 3;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_APPWINDOW = 0x00040000L;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_NOOWNERZORDER = 0x0200;
    private static readonly IntPtr HWND_TOP = IntPtr.Zero;
    private static readonly object AttachmentSync = new object();
    private static readonly object AudioMuteSync = new object();
    private static readonly object TaskbarSync = new object();
    private static readonly Dictionary<long, AttachedOverlayInfo> AttachedTargets = new Dictionary<long, AttachedOverlayInfo>();
    private static readonly Dictionary<string, List<AudioMuteSnapshot>> AudioMuteSnapshotsByToken = new Dictionary<string, List<AudioMuteSnapshot>>();
    private static readonly Dictionary<string, AudioMuteTarget> AudioMuteTargetsByToken = new Dictionary<string, AudioMuteTarget>();
    private static readonly HashSet<long> TaskbarHiddenWindows = new HashSet<long>();

    private sealed class AttachedOverlayInfo {
        public long TargetWindowId;
        public int InsetLeft;
        public int InsetTop;
        public int InsetRight;
        public int InsetBottom;
    }

    private sealed class AudioMuteSnapshot {
        public string Key;
        public bool WasMuted;
    }

    private sealed class AudioMuteTarget {
        public int Pid;
        public string Name;
        public bool SawUnmutedSession;
    }

    [ComImport]
    [Guid("56FDF344-FD6D-11d0-958A-006097C9A090")]
    private class CTaskbarList { }

    [ComImport]
    [Guid("56FDF342-FD6D-11d0-958A-006097C9A090")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ITaskbarList {
        void HrInit();
        void AddTab(IntPtr hWnd);
        void DeleteTab(IntPtr hWnd);
        void ActivateTab(IntPtr hWnd);
        void SetActiveAlt(IntPtr hWnd);
    }

    private enum EDataFlow {
        eRender = 0,
        eCapture = 1,
        eAll = 2
    }

    private enum ERole {
        eConsole = 0,
        eMultimedia = 1,
        eCommunications = 2
    }

    [Flags]
    private enum DEVICE_STATE : uint {
        ACTIVE = 0x00000001
    }

    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumerator { }

    [ComImport]
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(EDataFlow dataFlow, DEVICE_STATE dwStateMask, out IMMDeviceCollection ppDevices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
        int RegisterEndpointNotificationCallback(IntPtr pClient);
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport]
    [Guid("0BD7A1BE-7A1A-44DB-8397-C0EA7A12C7F2")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection {
        int GetCount(out uint pcDevices);
        int Item(uint nDevice, out IMMDevice ppDevice);
    }

    [ComImport]
    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        int OpenPropertyStore(int stgmAccess, IntPtr ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out DEVICE_STATE pdwState);
    }

    [ComImport]
    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2 {
        int GetAudioSessionControl(ref Guid AudioSessionGuid, uint StreamFlags, out IAudioSessionControl SessionControl);
        int GetSimpleAudioVolume(ref Guid AudioSessionGuid, uint StreamFlags, out ISimpleAudioVolume AudioVolume);
        int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
        int RegisterSessionNotification(IntPtr SessionNotification);
        int UnregisterSessionNotification(IntPtr SessionNotification);
        int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionID, IntPtr duckNotification);
        int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [ComImport]
    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator {
        int GetCount(out int SessionCount);
        int GetSession(int SessionCount, out IAudioSessionControl Session);
    }

    [ComImport]
    [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl {
        int GetState(out int pRetVal);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        int GetGroupingParam(out Guid pRetVal);
        int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        int RegisterAudioSessionNotification(IntPtr NewNotifications);
        int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    }

    [ComImport]
    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2 {
        int GetState(out int pRetVal);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        int GetGroupingParam(out Guid pRetVal);
        int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        int RegisterAudioSessionNotification(IntPtr NewNotifications);
        int UnregisterAudioSessionNotification(IntPtr NewNotifications);
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int GetProcessId(out uint pRetVal);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }

    [ComImport]
    [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISimpleAudioVolume {
        int SetMasterVolume(float fLevel, ref Guid EventContext);
        int GetMasterVolume(out float pfLevel);
        int SetMute(bool bMute, ref Guid EventContext);
        int GetMute(out bool pbMute);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private static bool TryWindowBounds(IntPtr hWnd, out RECT rect) {
        if (DwmGetWindowAttribute(
            hWnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            out rect,
            Marshal.SizeOf(typeof(RECT))
        ) == 0) {
            return true;
        }
        return GetWindowRect(hWnd, out rect);
    }

    private static IntPtr GetWindowLongPtrSafe(IntPtr hWnd, int index) {
        return IntPtr.Size == 8
            ? GetWindowLongPtr64(hWnd, index)
            : new IntPtr(GetWindowLong(hWnd, index));
    }

    private static void SetWindowLongPtrSafe(IntPtr hWnd, int index, IntPtr value) {
        if (IntPtr.Size == 8) SetWindowLongPtr64(hWnd, index, value);
        else SetWindowLong(hWnd, index, value.ToInt32());
    }

    private static string FindBounds(int targetPid, string targetExeName, bool matchByName) {
        RECT bestRect = new RECT();
        uint bestPid = 0;
        long bestArea = 0;
        string normalizedTarget = (targetExeName ?? "").Trim();
        if (normalizedTarget.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) {
            normalizedTarget = normalizedTarget.Substring(0, normalizedTarget.Length - 4);
        }
        HashSet<int> matchingPids = new HashSet<int>();
        if (matchByName && normalizedTarget.Length > 0) {
            try {
                foreach (Process process in Process.GetProcessesByName(normalizedTarget)) {
                    try { matchingPids.Add(process.Id); }
                    finally { process.Dispose(); }
                }
            } catch { }
        }

        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            bool matches = pid == (uint)targetPid;
            if (matchByName && !matches) matches = matchingPids.Contains((int)pid);
            if (!matches || !IsWindowVisible(hWnd) || IsIconic(hWnd)) {
                return true;
            }

            int cloaked = 0;
            if (DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloaked, sizeof(int)) == 0 && cloaked != 0) {
                return true;
            }

            RECT rect;
            if (!TryWindowBounds(hWnd, out rect)) return true;
            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;
            if (width < 80 || height < 80) return true;

            long area = (long)width * height;
            if (area > bestArea) {
                bestArea = area;
                bestRect = rect;
                bestPid = pid;
            }
            return true;
        }, IntPtr.Zero);

        if (bestArea == 0) return "hidden";
        return String.Format(
            "{0},{1},{2},{3},{4}",
            bestPid,
            bestRect.Left,
            bestRect.Top,
            bestRect.Right,
            bestRect.Bottom
        );
    }

    public static string Bounds(int targetPid, string targetExeName) {
        string direct = FindBounds(targetPid, targetExeName, false);
        return direct == "hidden"
            ? FindBounds(targetPid, targetExeName, true)
            : direct;
    }

    public static string AllBounds(int targetPid, string targetExeName) {
        string normalizedTarget = (targetExeName ?? "").Trim();
        if (normalizedTarget.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) {
            normalizedTarget = normalizedTarget.Substring(0, normalizedTarget.Length - 4);
        }
        HashSet<int> matchingPids = new HashSet<int>();
        if (targetPid > 0) matchingPids.Add(targetPid);
        if (normalizedTarget.Length > 0) {
            try {
                foreach (Process process in Process.GetProcessesByName(normalizedTarget)) {
                    try { matchingPids.Add(process.Id); }
                    finally { process.Dispose(); }
                }
            } catch { }
        }

        List<string> windows = new List<string>();
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            bool minimized = IsIconic(hWnd);
            if (!matchingPids.Contains((int)pid) || (!IsWindowVisible(hWnd) && !minimized)) {
                return true;
            }
            int cloaked = 0;
            if (DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloaked, sizeof(int)) == 0 && cloaked != 0) {
                return true;
            }
            RECT rect;
            if (!TryWindowBounds(hWnd, out rect)) return true;
            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;
            if (width < 80 || height < 80) return true;
            windows.Add(String.Format(
                "{0},{1},{2},{3},{4},{5},{6}",
                hWnd.ToInt64(), pid, rect.Left, rect.Top, rect.Right, rect.Bottom, minimized ? 1 : 0
            ));
            return true;
        }, IntPtr.Zero);
        windows.Sort(StringComparer.Ordinal);
        return windows.Count == 0 ? "hidden" : String.Join(";", windows.ToArray());
    }

    private static string EncodeField(string value) {
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(value ?? ""));
    }

    public static string Foreground() {
        IntPtr hWnd = GetForegroundWindow();
        if (hWnd == IntPtr.Zero || !IsWindow(hWnd)) return "hidden";

        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid == 0) return "hidden";

        RECT rect;
        if (!TryWindowBounds(hWnd, out rect)) return "hidden";
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width < 40 || height < 40) return "hidden";

        string processName = "";
        try {
            using (Process process = Process.GetProcessById((int)pid)) {
                processName = process.ProcessName + ".exe";
            }
        } catch { }

        StringBuilder titleBuilder = new StringBuilder(1024);
        GetWindowText(hWnd, titleBuilder, titleBuilder.Capacity);
        bool minimized = IsIconic(hWnd);

        return String.Format(
            "{0},{1},{2},{3},{4},{5},{6}|{7}|{8}",
            hWnd.ToInt64(),
            pid,
            rect.Left,
            rect.Top,
            rect.Right,
            rect.Bottom,
            minimized ? 1 : 0,
            EncodeField(processName),
            EncodeField(titleBuilder.ToString())
        );
    }

    private static string WindowInfo(IntPtr hWnd, uint pid, RECT rect, bool minimized) {
        string processName = "";
        try {
            using (Process process = Process.GetProcessById((int)pid)) {
                processName = process.ProcessName + ".exe";
            }
        } catch { }

        StringBuilder titleBuilder = new StringBuilder(1024);
        GetWindowText(hWnd, titleBuilder, titleBuilder.Capacity);

        return String.Format(
            "{0},{1},{2},{3},{4},{5},{6}|{7}|{8}",
            hWnd.ToInt64(),
            pid,
            rect.Left,
            rect.Top,
            rect.Right,
            rect.Bottom,
            minimized ? 1 : 0,
            EncodeField(processName),
            EncodeField(titleBuilder.ToString())
        );
    }

    public static string VisibleWindows() {
        List<string> windows = new List<string>();
        EnumWindows((hWnd, lParam) => {
            bool minimized = IsIconic(hWnd);
            if (!IsWindowVisible(hWnd) && !minimized) return true;

            int cloaked = 0;
            if (DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloaked, sizeof(int)) == 0 && cloaked != 0) {
                return true;
            }

            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == 0) return true;

            RECT rect;
            if (!TryWindowBounds(hWnd, out rect)) return true;
            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;
            if (width < 120 || height < 120) return true;

            windows.Add(WindowInfo(hWnd, pid, rect, minimized));
            return true;
        }, IntPtr.Zero);
        return windows.Count == 0 ? "hidden" : String.Join(";", windows.ToArray());
    }

    public static bool Minimize(long windowId) {
        IntPtr hWnd = new IntPtr(windowId);
        if (windowId == 0 || !IsWindow(hWnd)) return false;
        IntPtr rootOwner = GetAncestor(hWnd, GA_ROOTOWNER);
        if (rootOwner != IntPtr.Zero) hWnd = rootOwner;
        bool requested = ShowWindowAsync(hWnd, SW_MINIMIZE);
        // Certaines applications empaquetées ignorent ShowWindow depuis un
        // autre thread. Le message système reproduit alors le vrai bouton « − ».
        bool posted = PostMessage(hWnd, WM_SYSCOMMAND, new IntPtr(SC_MINIMIZE), IntPtr.Zero);
        return requested || posted;
    }

    public static bool ForceClose(long windowId) {
        IntPtr hWnd = new IntPtr(windowId);
        if (windowId == 0 || !IsWindow(hWnd)) return false;
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid == 0) return false;
        try {
            using (Process process = Process.GetProcessById((int)pid)) {
                process.Kill();
            }
            return true;
        } catch {
            return false;
        }
    }

    private static bool SyncOverlay(
        long overlayWindowId,
        long targetWindowId,
        bool frameChanged,
        int insetLeft,
        int insetTop,
        int insetRight,
        int insetBottom
    ) {
        IntPtr overlay = new IntPtr(overlayWindowId);
        IntPtr target = new IntPtr(targetWindowId);
        if (!IsWindow(overlay) || !IsWindow(target)) return false;
        RECT rect;
        if (!TryWindowBounds(target, out rect)) return false;
        int left = rect.Left + Math.Max(0, insetLeft);
        int top = rect.Top + Math.Max(0, insetTop);
        int right = rect.Right - Math.Max(0, insetRight);
        int bottom = rect.Bottom - Math.Max(0, insetBottom);
        if (right - left < 80 || bottom - top < 80) return false;
        // Ne jamais afficher la fenêtre depuis Win32. Electron doit rester la
        // source de vérité de la visibilité, sinon un overlay restauré paraît
        // visible tout en gardant un renderer suspendu/non interactif.
        uint flags = SWP_NOACTIVATE | SWP_NOOWNERZORDER;
        if (frameChanged) flags |= SWP_FRAMECHANGED;
        return SetWindowPos(
            overlay,
            HWND_TOP,
            left,
            top,
            right - left,
            bottom - top,
            flags
        );
    }

    private static bool SyncOverlay(long overlayWindowId, long targetWindowId, bool frameChanged) {
        AttachedOverlayInfo info = null;
        lock (AttachmentSync) {
            AttachedTargets.TryGetValue(overlayWindowId, out info);
        }
        if (info != null && info.TargetWindowId == targetWindowId) {
            return SyncOverlay(
                overlayWindowId,
                targetWindowId,
                frameChanged,
                info.InsetLeft,
                info.InsetTop,
                info.InsetRight,
                info.InsetBottom
            );
        }
        return SyncOverlay(overlayWindowId, targetWindowId, frameChanged, 0, 0, 0, 0);
    }

    public static bool SyncOverlay(long overlayWindowId, long targetWindowId) {
        return SyncOverlay(overlayWindowId, targetWindowId, false);
    }

    public static bool AttachOverlay(
        long overlayWindowId,
        long targetWindowId,
        int insetLeft,
        int insetTop,
        int insetRight,
        int insetBottom
    ) {
        IntPtr overlay = new IntPtr(overlayWindowId);
        IntPtr target = new IntPtr(targetWindowId);
        if (!IsWindow(overlay) || !IsWindow(target)) return false;

        long extendedStyle = GetWindowLongPtrSafe(overlay, GWL_EXSTYLE).ToInt64();
        extendedStyle = (extendedStyle | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
        SetWindowLongPtrSafe(overlay, GWL_EXSTYLE, new IntPtr(extendedStyle));
        int cornerPreference = DWMWCP_ROUND;
        DwmSetWindowAttribute(
            overlay,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            ref cornerPreference,
            sizeof(int)
        );
        // Une fenêtre possédée est masquée/restaurée avec sa cible et ne crée
        // pas une vignette indépendante dans Alt+Tab, la barre des tâches ou Snap.
        SetWindowLongPtrSafe(overlay, GWLP_HWNDPARENT, target);
        lock (AttachmentSync) AttachedTargets[overlayWindowId] = new AttachedOverlayInfo {
            TargetWindowId = targetWindowId,
            InsetLeft = Math.Max(0, insetLeft),
            InsetTop = Math.Max(0, insetTop),
            InsetRight = Math.Max(0, insetRight),
            InsetBottom = Math.Max(0, insetBottom)
        };
        return SyncOverlay(overlayWindowId, targetWindowId, true);
    }

    public static bool AttachOverlay(long overlayWindowId, long targetWindowId) {
        return AttachOverlay(overlayWindowId, targetWindowId, 0, 0, 0, 0);
    }

    public static void DetachOverlay(long overlayWindowId) {
        lock (AttachmentSync) AttachedTargets.Remove(overlayWindowId);
    }

    private static IntPtr ResolveRootOwner(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero || !IsWindow(hWnd)) return hWnd;
        IntPtr root = GetAncestor(hWnd, GA_ROOTOWNER);
        return root != IntPtr.Zero && IsWindow(root) ? root : hWnd;
    }

    private static void WithTaskbarList(Action<ITaskbarList> action) {
        ITaskbarList taskbar = null;
        try {
            taskbar = (ITaskbarList)(new CTaskbarList());
            taskbar.HrInit();
            action(taskbar);
        } catch {
        } finally {
            if (taskbar != null) Marshal.ReleaseComObject(taskbar);
        }
    }

    private static void HideWindowFromTaskbar(IntPtr hWnd) {
        IntPtr root = ResolveRootOwner(hWnd);
        if (root == IntPtr.Zero || !IsWindow(root)) return;
        WithTaskbarList(taskbar => {
            taskbar.DeleteTab(root);
            lock (TaskbarSync) TaskbarHiddenWindows.Add(root.ToInt64());
        });
    }

    private static void RestoreWindowTaskbar(IntPtr hWnd) {
        IntPtr root = ResolveRootOwner(hWnd);
        if (root == IntPtr.Zero || !IsWindow(root)) return;
        WithTaskbarList(taskbar => {
            taskbar.AddTab(root);
            lock (TaskbarSync) TaskbarHiddenWindows.Remove(root.ToInt64());
        });
    }

    public static void RestoreProcessTaskbar(int targetPid, string targetName) {
        HashSet<long> restored = new HashSet<long>();
        EnumWindows((hWnd, lParam) => {
            if (hWnd == IntPtr.Zero || !IsWindow(hWnd)) return true;
            bool minimized = IsIconic(hWnd);
            if (!IsWindowVisible(hWnd) && !minimized) return true;
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (!AudioSessionMatches(pid, targetPid, targetName)) return true;
            IntPtr root = ResolveRootOwner(hWnd);
            if (root == IntPtr.Zero || !IsWindow(root)) return true;
            long rootId = root.ToInt64();
            if (!restored.Add(rootId)) return true;
            RestoreWindowTaskbar(root);
            int disabled = 0;
            DwmSetWindowAttribute(root, DWMWA_DISALLOW_PEEK, ref disabled, sizeof(int));
            DwmSetWindowAttribute(root, DWMWA_HAS_ICONIC_BITMAP, ref disabled, sizeof(int));
            DwmSetWindowAttribute(root, DWMWA_FORCE_ICONIC_REPRESENTATION, ref disabled, sizeof(int));
            DwmInvalidateIconicBitmaps(root);
            return true;
        }, IntPtr.Zero);
    }

    public static void RestoreAllTaskbarWindows() {
        long[] windowIds;
        lock (TaskbarSync) {
            windowIds = new long[TaskbarHiddenWindows.Count];
            TaskbarHiddenWindows.CopyTo(windowIds);
            TaskbarHiddenWindows.Clear();
        }
        foreach (long windowId in windowIds) {
            IntPtr hWnd = new IntPtr(windowId);
            if (hWnd != IntPtr.Zero && IsWindow(hWnd)) {
                WithTaskbarList(taskbar => taskbar.AddTab(hWnd));
            }
        }
    }

    // ── Audio guard ──────────────────────────────────────────────────────────
    // On agit au niveau des sessions audio Windows du processus bloqué, pas
    // via les touches média globales. Cela évite l'effet play/pause toggle.
    private static string NormalizeExeName(string value) {
        if (String.IsNullOrWhiteSpace(value)) return "";
        string trimmed = value.Trim();
        int slash = Math.Max(trimmed.LastIndexOf('\\'), trimmed.LastIndexOf('/'));
        if (slash >= 0 && slash + 1 < trimmed.Length) trimmed = trimmed.Substring(slash + 1);
        if (trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) {
            trimmed = trimmed.Substring(0, trimmed.Length - 4);
        }
        return trimmed;
    }

    private static bool AudioSessionMatches(uint sessionPid, int targetPid, string targetName) {
        if (sessionPid == 0) return false;
        if (targetPid > 0 && sessionPid == (uint)targetPid) return true;
        string expected = NormalizeExeName(targetName);
        if (expected.Length == 0) return false;
        try {
            Process process = Process.GetProcessById((int)sessionPid);
            return String.Equals(process.ProcessName, expected, StringComparison.OrdinalIgnoreCase);
        } catch {
            return false;
        }
    }

    private static IAudioSessionManager2 ActivateAudioSessionManager(IMMDevice device) {
        if (device == null) return null;
        try {
            Guid managerId = typeof(IAudioSessionManager2).GUID;
            object managerObject;
            if (device.Activate(ref managerId, 23, IntPtr.Zero, out managerObject) != 0 || managerObject == null) {
                return null;
            }
            return managerObject as IAudioSessionManager2;
        } catch {
            return null;
        }
    }

    private static void TryAddAudioSessionManager(
        List<IAudioSessionManager2> managers,
        List<string> deviceIds,
        HashSet<string> seenDeviceIds,
        IMMDevice device
    ) {
        if (device == null) return;
        string deviceId = "";
        try { device.GetId(out deviceId); } catch { deviceId = ""; }
        if (String.IsNullOrWhiteSpace(deviceId)) deviceId = "device:" + managers.Count.ToString();
        if (!seenDeviceIds.Add(deviceId)) return;
        IAudioSessionManager2 manager = ActivateAudioSessionManager(device);
        if (manager == null) return;
        managers.Add(manager);
        deviceIds.Add(deviceId);
    }

    private static List<IAudioSessionManager2> GetAudioSessionManagers(List<string> deviceIds) {
        List<IAudioSessionManager2> managers = new List<IAudioSessionManager2>();
        HashSet<string> seenDeviceIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        IMMDeviceEnumerator enumerator = null;
        try {
            enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        } catch {
            return managers;
        }

        IMMDeviceCollection collection = null;
        try {
            if (enumerator.EnumAudioEndpoints(EDataFlow.eRender, DEVICE_STATE.ACTIVE, out collection) == 0 && collection != null) {
                uint count;
                if (collection.GetCount(out count) == 0) {
                    for (uint index = 0; index < count; index++) {
                        IMMDevice device = null;
                        try {
                            if (collection.Item(index, out device) == 0 && device != null) {
                                TryAddAudioSessionManager(managers, deviceIds, seenDeviceIds, device);
                            }
                        } catch {
                        } finally {
                            if (device != null) Marshal.ReleaseComObject(device);
                        }
                    }
                }
            }
        } catch {
        } finally {
            if (collection != null) Marshal.ReleaseComObject(collection);
        }

        foreach (ERole role in new ERole[] { ERole.eMultimedia, ERole.eConsole, ERole.eCommunications }) {
            IMMDevice defaultDevice = null;
            try {
                if (enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, role, out defaultDevice) == 0 && defaultDevice != null) {
                    TryAddAudioSessionManager(managers, deviceIds, seenDeviceIds, defaultDevice);
                }
            } catch {
            } finally {
                if (defaultDevice != null) Marshal.ReleaseComObject(defaultDevice);
            }
        }

        try {
            if (enumerator != null) Marshal.ReleaseComObject(enumerator);
        } catch { }
        return managers;
    }

    private static string AudioSnapshotKey(string deviceId, string instanceId) {
        return (deviceId ?? "") + "\u001f" + (instanceId ?? "");
    }

    private static bool SnapshotExists(List<AudioMuteSnapshot> snapshots, string key) {
        foreach (AudioMuteSnapshot snapshot in snapshots) {
            if (String.Equals(snapshot.Key, key, StringComparison.Ordinal)) return true;
        }
        return false;
    }

    /// <summary>
    /// Coupe seulement les sessions audio de l'application bloquée.
    /// Contrairement à une suspension de processus, cela ne fige pas l'app et
    /// n'empêche pas Windows de la restaurer correctement après la session.
    /// </summary>
    public static bool MuteAppAudio(string token, int targetPid, string targetName) {
        if (String.IsNullOrWhiteSpace(token)) return false;
        List<string> deviceIds = new List<string>();
        List<IAudioSessionManager2> managers = GetAudioSessionManagers(deviceIds);
        bool mutedAny = false;

        try {
            lock (AudioMuteSync) {
                AudioMuteTarget target;
                if (!AudioMuteTargetsByToken.TryGetValue(token, out target)) {
                    target = new AudioMuteTarget { Pid = targetPid, Name = targetName ?? "", SawUnmutedSession = false };
                    AudioMuteTargetsByToken[token] = target;
                } else {
                    target.Pid = targetPid;
                    target.Name = targetName ?? "";
                }
            }

            for (int managerIndex = 0; managerIndex < managers.Count; managerIndex++) {
                IAudioSessionManager2 manager = managers[managerIndex];
                string deviceId = managerIndex < deviceIds.Count ? deviceIds[managerIndex] : "device:" + managerIndex.ToString();
                IAudioSessionEnumerator sessions = null;
                try {
                    if (manager == null || manager.GetSessionEnumerator(out sessions) != 0 || sessions == null) continue;
                    int count;
                    if (sessions.GetCount(out count) != 0) continue;

                    for (int index = 0; index < count; index++) {
                        IAudioSessionControl session = null;
                        try {
                            if (sessions.GetSession(index, out session) != 0 || session == null) continue;
                            IAudioSessionControl2 session2 = session as IAudioSessionControl2;
                            ISimpleAudioVolume volume = session as ISimpleAudioVolume;
                            if (session2 == null || volume == null) continue;

                            int sessionState;
                            if (session.GetState(out sessionState) != 0 || sessionState != 1) continue;

                            uint sessionPid;
                            if (session2.GetProcessId(out sessionPid) != 0 ||
                                !AudioSessionMatches(sessionPid, targetPid, targetName)) {
                                continue;
                            }

                            string instanceId = "";
                            session2.GetSessionInstanceIdentifier(out instanceId);
                            if (String.IsNullOrWhiteSpace(instanceId)) instanceId = "pid:" + sessionPid.ToString();
                            string key = AudioSnapshotKey(deviceId, instanceId);

                            bool wasMuted;
                            if (volume.GetMute(out wasMuted) != 0) continue;

                            lock (AudioMuteSync) {
                                AudioMuteTarget target;
                                if (AudioMuteTargetsByToken.TryGetValue(token, out target) && !wasMuted) {
                                    target.SawUnmutedSession = true;
                                }
                                List<AudioMuteSnapshot> snapshots;
                                if (!AudioMuteSnapshotsByToken.TryGetValue(token, out snapshots)) {
                                    snapshots = new List<AudioMuteSnapshot>();
                                    AudioMuteSnapshotsByToken[token] = snapshots;
                                }
                                if (!SnapshotExists(snapshots, key)) {
                                    snapshots.Add(new AudioMuteSnapshot {
                                        Key = key,
                                        WasMuted = wasMuted
                                    });
                                }
                            }

                            Guid context = Guid.Empty;
                            if (volume.SetMute(true, ref context) == 0) mutedAny = true;
                        } catch {
                        } finally {
                            if (session != null) Marshal.ReleaseComObject(session);
                        }
                    }
                } finally {
                    if (sessions != null) Marshal.ReleaseComObject(sessions);
                }
            }
        } catch {
        } finally {
            foreach (IAudioSessionManager2 manager in managers) {
                if (manager != null) Marshal.ReleaseComObject(manager);
            }
        }

        return mutedAny;
    }

    public static bool RestoreAppAudio(string token) {
        if (String.IsNullOrWhiteSpace(token)) return false;
        List<AudioMuteSnapshot> snapshots;
        AudioMuteTarget target = null;
        lock (AudioMuteSync) {
            AudioMuteSnapshotsByToken.TryGetValue(token, out snapshots);
            AudioMuteSnapshotsByToken.Remove(token);
            AudioMuteTargetsByToken.TryGetValue(token, out target);
            AudioMuteTargetsByToken.Remove(token);
        }
        if (snapshots == null) snapshots = new List<AudioMuteSnapshot>();
        if (snapshots.Count == 0 && target == null) return false;

        List<string> deviceIds = new List<string>();
        List<IAudioSessionManager2> managers = GetAudioSessionManagers(deviceIds);
        bool restoredAny = false;

        try {
            for (int managerIndex = 0; managerIndex < managers.Count; managerIndex++) {
                IAudioSessionManager2 manager = managers[managerIndex];
                string deviceId = managerIndex < deviceIds.Count ? deviceIds[managerIndex] : "device:" + managerIndex.ToString();
                IAudioSessionEnumerator sessions = null;
                try {
                    if (manager == null || manager.GetSessionEnumerator(out sessions) != 0 || sessions == null) continue;
                    int count;
                    if (sessions.GetCount(out count) != 0) continue;

                    for (int index = 0; index < count; index++) {
                        IAudioSessionControl session = null;
                        try {
                            if (sessions.GetSession(index, out session) != 0 || session == null) continue;
                            IAudioSessionControl2 session2 = session as IAudioSessionControl2;
                            ISimpleAudioVolume volume = session as ISimpleAudioVolume;
                            if (session2 == null || volume == null) continue;

                            uint sessionPid = 0;
                            session2.GetProcessId(out sessionPid);
                            string instanceId = "";
                            session2.GetSessionInstanceIdentifier(out instanceId);
                            if (String.IsNullOrWhiteSpace(instanceId)) {
                                instanceId = "pid:" + sessionPid.ToString();
                            }
                            string key = AudioSnapshotKey(deviceId, instanceId);
                            bool restoredThisSession = false;

                            foreach (AudioMuteSnapshot snapshot in snapshots) {
                                if (!String.Equals(snapshot.Key, key, StringComparison.Ordinal)) continue;
                                Guid context = Guid.Empty;
                                if (volume.SetMute(snapshot.WasMuted, ref context) == 0) restoredAny = true;
                                restoredThisSession = true;
                                break;
                            }
                            if (!restoredThisSession &&
                                target != null &&
                                target.SawUnmutedSession &&
                                AudioSessionMatches(sessionPid, target.Pid, target.Name)) {
                                Guid context = Guid.Empty;
                                if (volume.SetMute(false, ref context) == 0) restoredAny = true;
                            }
                        } catch {
                        } finally {
                            if (session != null) Marshal.ReleaseComObject(session);
                        }
                    }
                } finally {
                    if (sessions != null) Marshal.ReleaseComObject(sessions);
                }
            }
        } catch {
        } finally {
            foreach (IAudioSessionManager2 manager in managers) {
                if (manager != null) Marshal.ReleaseComObject(manager);
            }
        }

        return restoredAny;
    }

    private static bool ShouldForceAudioUnmute(string token) {
        if (String.IsNullOrWhiteSpace(token)) return false;
        lock (AudioMuteSync) {
            AudioMuteTarget target;
            bool hasTarget = AudioMuteTargetsByToken.TryGetValue(token, out target);
            if (hasTarget && target.SawUnmutedSession) {
                return true;
            }
            List<AudioMuteSnapshot> snapshots;
            if (!AudioMuteSnapshotsByToken.TryGetValue(token, out snapshots) || snapshots == null) {
                return hasTarget;
            }
            if (snapshots.Count == 0) return hasTarget;
            foreach (AudioMuteSnapshot snapshot in snapshots) {
                if (!snapshot.WasMuted) return true;
            }
        }
        return false;
    }

    private static bool ForceRestoreAppAudioTarget(int targetPid, string targetName) {
        List<string> deviceIds = new List<string>();
        List<IAudioSessionManager2> managers = GetAudioSessionManagers(deviceIds);
        bool restoredAny = false;

        try {
            for (int managerIndex = 0; managerIndex < managers.Count; managerIndex++) {
                IAudioSessionManager2 manager = managers[managerIndex];
                IAudioSessionEnumerator sessions = null;
                try {
                    if (manager == null || manager.GetSessionEnumerator(out sessions) != 0 || sessions == null) continue;
                    int count;
                    if (sessions.GetCount(out count) != 0) continue;

                    for (int index = 0; index < count; index++) {
                        IAudioSessionControl session = null;
                        try {
                            if (sessions.GetSession(index, out session) != 0 || session == null) continue;
                            IAudioSessionControl2 session2 = session as IAudioSessionControl2;
                            ISimpleAudioVolume volume = session as ISimpleAudioVolume;
                            if (session2 == null || volume == null) continue;

                            uint sessionPid = 0;
                            session2.GetProcessId(out sessionPid);
                            if (!AudioSessionMatches(sessionPid, targetPid, targetName)) continue;
                            Guid context = Guid.Empty;
                            float level = 1.0f;
                            if (volume.GetMasterVolume(out level) == 0 && level < 0.05f) {
                                volume.SetMasterVolume(1.0f, ref context);
                            }
                            if (volume.SetMute(false, ref context) == 0) restoredAny = true;
                        } catch {
                        } finally {
                            if (session != null) Marshal.ReleaseComObject(session);
                        }
                    }
                } finally {
                    if (sessions != null) Marshal.ReleaseComObject(sessions);
                }
            }
        } catch {
        } finally {
            foreach (IAudioSessionManager2 manager in managers) {
                if (manager != null) Marshal.ReleaseComObject(manager);
            }
        }

        return restoredAny;
    }

    public static bool RestoreAppAudioForTarget(string token, int targetPid, string targetName) {
        bool restoredAny = RestoreAppAudio(token);
        restoredAny = ForceRestoreAppAudioTarget(targetPid, targetName) || restoredAny;
        return restoredAny;
    }

    public static void RestoreAllAppAudio() {
        HashSet<string> tokens = new HashSet<string>(StringComparer.Ordinal);
        lock (AudioMuteSync) {
            foreach (string token in AudioMuteSnapshotsByToken.Keys) tokens.Add(token);
            foreach (string token in AudioMuteTargetsByToken.Keys) tokens.Add(token);
        }
        foreach (string token in tokens) {
            RestoreAppAudio(token);
        }
    }

    private static void ApplyBlockedPreviewBitmap(IntPtr root) {
        const int width = 360;
        const int height = 220;
        IntPtr bitmapHandle = IntPtr.Zero;

        try {
            using (Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format32bppPArgb)) {
                using (Graphics graphics = Graphics.FromImage(bitmap)) {
                    graphics.SmoothingMode = SmoothingMode.AntiAlias;
                    graphics.Clear(Color.FromArgb(4, 4, 6));
                    using (LinearGradientBrush background = new LinearGradientBrush(
                        new Rectangle(0, 0, width, height),
                        Color.FromArgb(22, 22, 28),
                        Color.FromArgb(0, 0, 0),
                        45f
                    )) {
                        graphics.FillRectangle(background, 0, 0, width, height);
                    }
                    using (Pen border = new Pen(Color.FromArgb(80, 148, 163, 184), 2f)) {
                        graphics.DrawRectangle(border, 1, 1, width - 3, height - 3);
                    }
                    using (SolidBrush muted = new SolidBrush(Color.FromArgb(180, 148, 163, 184)))
                    using (SolidBrush text = new SolidBrush(Color.FromArgb(248, 250, 252)))
                    using (SolidBrush accent = new SolidBrush(Color.FromArgb(125, 211, 252)))
                    using (Font eyebrow = new Font("Segoe UI", 12f, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (Font title = new Font("Segoe UI", 25f, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (Font body = new Font("Segoe UI", 14f, FontStyle.Regular, GraphicsUnit.Pixel)) {
                        graphics.FillEllipse(accent, 34, 40, 16, 16);
                        graphics.DrawString("BLOCAGE VETHOS", eyebrow, muted, 64, 38);
                        graphics.DrawString("Application bloquee", title, text, 34, 78);
                        graphics.DrawString("Reviens a ce que tu devais faire.", body, muted, 36, 122);
                    }
                }

                bitmapHandle = bitmap.GetHbitmap(Color.Black);
                DwmSetIconicThumbnail(root, bitmapHandle, 0);
                DwmSetIconicLivePreviewBitmap(root, bitmapHandle, IntPtr.Zero, 0);
            }
        } catch {
            // Certaines apps/versions de Windows refusent les bitmaps iconiques.
            // Les attributs DWM appliqués juste avant restent quand même utiles.
        } finally {
            if (bitmapHandle != IntPtr.Zero) DeleteObject(bitmapHandle);
        }
    }

    /// <summary>
    /// Demande à DWM de ne pas exposer le vrai contenu de la fenêtre bloquée
    /// dans les miniatures taskbar / Peek. Windows affichera alors une
    /// représentation iconique/neutre au lieu de l'image réelle de l'app.
    /// </summary>
    public static void ProtectWindowPreview(long windowId) {
        IntPtr hWnd = new IntPtr(windowId);
        if (!IsWindow(hWnd)) return;
        IntPtr root = GetAncestor(hWnd, GA_ROOTOWNER);
        if (root == IntPtr.Zero || !IsWindow(root)) root = hWnd;
        HideWindowFromTaskbar(root);
        int enabled = 1;
        DwmSetWindowAttribute(root, DWMWA_FORCE_ICONIC_REPRESENTATION, ref enabled, sizeof(int));
        DwmSetWindowAttribute(root, DWMWA_HAS_ICONIC_BITMAP, ref enabled, sizeof(int));
        DwmSetWindowAttribute(root, DWMWA_DISALLOW_PEEK, ref enabled, sizeof(int));
        ApplyBlockedPreviewBitmap(root);
        DwmInvalidateIconicBitmaps(root);
    }

    public static void RestoreWindowPreview(long windowId) {
        IntPtr hWnd = new IntPtr(windowId);
        if (!IsWindow(hWnd)) return;
        IntPtr root = GetAncestor(hWnd, GA_ROOTOWNER);
        if (root == IntPtr.Zero || !IsWindow(root)) root = hWnd;
        RestoreWindowTaskbar(root);
        int disabled = 0;
        DwmSetWindowAttribute(root, DWMWA_DISALLOW_PEEK, ref disabled, sizeof(int));
        DwmSetWindowAttribute(root, DWMWA_HAS_ICONIC_BITMAP, ref disabled, sizeof(int));
        DwmSetWindowAttribute(root, DWMWA_FORCE_ICONIC_REPRESENTATION, ref disabled, sizeof(int));
        DwmInvalidateIconicBitmaps(root);
    }

    public static void SyncAttachedForTarget(long targetWindowId) {
        List<KeyValuePair<long, AttachedOverlayInfo>> overlays = new List<KeyValuePair<long, AttachedOverlayInfo>>();
        lock (AttachmentSync) {
            foreach (KeyValuePair<long, AttachedOverlayInfo> pair in AttachedTargets) {
                if (pair.Value.TargetWindowId == targetWindowId) overlays.Add(pair);
            }
        }
        foreach (KeyValuePair<long, AttachedOverlayInfo> pair in overlays) {
            if (SyncOverlay(
                pair.Key,
                targetWindowId,
                false,
                pair.Value.InsetLeft,
                pair.Value.InsetTop,
                pair.Value.InsetRight,
                pair.Value.InsetBottom
            )) continue;
            lock (AttachmentSync) AttachedTargets.Remove(pair.Key);
        }
    }
}

public static class VethosWindowWatcher {
    private static readonly object Sync = new object();
    private static readonly object OutputSync = new object();
    private static readonly Dictionary<string, WatchState> Watchers = new Dictionary<string, WatchState>();

    private sealed class WatchState {
        public string Id;
        public int TargetPid;
        public string TargetName;
        public string LastBounds = "";
        public int CallbackBusy;
        public Timer Timer;
    }

    public static void Start(string id, int pid, string name) {
        lock (Sync) {
            WatchState previous;
            if (Watchers.TryGetValue(id, out previous)) previous.Timer.Dispose();
            WatchState state = new WatchState {
                Id = id,
                TargetPid = pid,
                TargetName = name ?? ""
            };
            Watchers[id] = state;
            state.Timer = new Timer(Sample, state, 0, 250);
        }
        VethosWinEventBridge.EnsureStarted();
    }

    public static void Stop(string id) {
        lock (Sync) {
            WatchState state;
            if (!Watchers.TryGetValue(id, out state)) return;
            Watchers.Remove(id);
            state.Timer.Dispose();
        }
    }

    private static void Sample(object rawState) {
        WatchState state = (WatchState)rawState;
        if (Interlocked.Exchange(ref state.CallbackBusy, 1) != 0) return;
        try {
            lock (Sync) {
                WatchState current;
                if (!Watchers.TryGetValue(state.Id, out current) || !Object.ReferenceEquals(current, state)) return;
            }
            string bounds = VethosWindowProbe.AllBounds(state.TargetPid, state.TargetName);

            lock (Sync) {
                WatchState current;
                if (!Watchers.TryGetValue(state.Id, out current) || !Object.ReferenceEquals(current, state)) return;
                if (bounds == state.LastBounds) return;
                state.LastBounds = bounds;
            }
            lock (OutputSync) {
                Console.Out.WriteLine("WATCH|" + state.Id + "|" + bounds);
                Console.Out.Flush();
            }
        } catch { }
        finally {
            Interlocked.Exchange(ref state.CallbackBusy, 0);
        }
    }

    public static void TriggerForProcess(int pid) {
        List<WatchState> matches = new List<WatchState>();
        string processName = "";
        try { processName = Process.GetProcessById(pid).ProcessName; } catch { }
        lock (Sync) {
            foreach (WatchState state in Watchers.Values) {
                string targetName = (state.TargetName ?? "").Trim();
                if (targetName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) {
                    targetName = targetName.Substring(0, targetName.Length - 4);
                }
                if (state.TargetPid == pid ||
                    (targetName.Length > 0 && String.Equals(targetName, processName, StringComparison.OrdinalIgnoreCase))) {
                    matches.Add(state);
                }
            }
        }
        foreach (WatchState state in matches) {
            ThreadPool.QueueUserWorkItem(Sample, state);
        }
    }
}

public static class VethosWinEventBridge {
    private delegate void WinEventDelegate(
        IntPtr hook, uint eventType, IntPtr hWnd, int objectId, int childId, uint eventThread, uint eventTime
    );

    [DllImport("user32.dll")]
    private static extern IntPtr SetWinEventHook(
        uint eventMin, uint eventMax, IntPtr module, WinEventDelegate callback,
        uint processId, uint threadId, uint flags
    );

    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG message, IntPtr hWnd, uint min, uint max);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG {
        public IntPtr HWnd;
        public uint Message;
        public UIntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public POINT Point;
    }

    private const uint EVENT_SYSTEM_MINIMIZESTART = 0x0016;
    private const uint EVENT_SYSTEM_MINIMIZEEND = 0x0017;
    private const uint EVENT_OBJECT_DESTROY = 0x8001;
    private const uint EVENT_OBJECT_SHOW = 0x8002;
    private const uint EVENT_OBJECT_HIDE = 0x8003;
    private const uint EVENT_OBJECT_LOCATIONCHANGE = 0x800B;
    private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    private const int OBJID_WINDOW = 0;
    private static readonly object Sync = new object();
    private static Thread thread;
    private static WinEventDelegate callback;
    private static readonly List<IntPtr> hooks = new List<IntPtr>();

    public static void EnsureStarted() {
        lock (Sync) {
            if (thread != null) return;
            thread = new Thread(Run);
            thread.IsBackground = true;
            thread.Name = "Vethos window events";
            thread.Start();
        }
    }

    private static void Run() {
        callback = OnWindowEvent;
        hooks.Add(SetWinEventHook(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, IntPtr.Zero, callback, 0, 0, WINEVENT_OUTOFCONTEXT));
        hooks.Add(SetWinEventHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE, IntPtr.Zero, callback, 0, 0, WINEVENT_OUTOFCONTEXT));
        hooks.Add(SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, IntPtr.Zero, callback, 0, 0, WINEVENT_OUTOFCONTEXT));
        MSG message;
        while (GetMessage(out message, IntPtr.Zero, 0, 0)) { }
    }

    private static void OnWindowEvent(
        IntPtr hook, uint eventType, IntPtr hWnd, int objectId, int childId, uint eventThread, uint eventTime
    ) {
        if (hWnd == IntPtr.Zero || (eventType >= EVENT_OBJECT_DESTROY && objectId != OBJID_WINDOW)) return;
        // Le déplacement est appliqué ici, dans le rappel WinEvent natif : aucun
        // timer et aucun aller-retour Electron/JavaScript sur le chemin critique.
        VethosWindowProbe.SyncAttachedForTarget(hWnd.ToInt64());
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid > 0) VethosWindowWatcher.TriggerForProcess((int)pid);
    }
}
'@

function Initialize-VethosMediaSessionBridge {
    if ($script:VethosMediaSessionBridgeReady) { return $true }
    try {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop
        $script:VethosWinRtAsTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() |
            Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
            Select-Object -First 1
        $script:VethosWinRtAsTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
            Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
            Select-Object -First 1
        [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
        [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
        $script:VethosMediaSessionBridgeReady = $true
        return $true
    } catch {
        return $false
    }
}

function Wait-VethosWinRtOperation($operation, [Type] $resultType) {
    if ($null -eq $operation) { return $null }
    try {
        $task = if ($null -ne $resultType) {
            $script:VethosWinRtAsTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
        } else {
            $script:VethosWinRtAsTask.Invoke($null, @($operation))
        }
        if (-not $task.Wait(750)) { return $null }
        if ($null -ne $resultType) { return $task.Result }
        return $null
    } catch {
        return $null
    }
}

function Normalize-VethosMediaName([string] $value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return '' }
    $name = [System.IO.Path]::GetFileNameWithoutExtension($value.Trim())
    return ($name -replace '[^a-zA-Z0-9]', '').ToLowerInvariant()
}

function Test-VethosMediaSourceMatch([string] $source, [string] $targetName) {
    $needle = Normalize-VethosMediaName $targetName
    if ($needle.Length -eq 0 -or [string]::IsNullOrWhiteSpace($source)) { return $false }
    $haystack = (Normalize-VethosMediaName $source)
    return $haystack -eq $needle -or $haystack.Contains($needle)
}

function Invoke-VethosMediaSessionPause([int] $targetPid, [string] $targetName) {
    if (-not (Initialize-VethosMediaSessionBridge)) { return }
    try {
        $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
        $manager = Wait-VethosWinRtOperation ($managerType::RequestAsync()) $managerType
        if ($null -eq $manager) { return }
        $playing = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media.Control, ContentType = WindowsRuntime]::Playing
        foreach ($session in $manager.GetSessions()) {
            try {
                if (-not (Test-VethosMediaSourceMatch $session.SourceAppUserModelId $targetName)) { continue }
                $playbackInfo = $session.GetPlaybackInfo()
                if ($null -eq $playbackInfo -or $playbackInfo.PlaybackStatus -ne $playing) { continue }
                [void](Wait-VethosWinRtOperation ($session.TryPauseAsync()) ([bool]))
            } catch { }
        }
    } catch { }
}

[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()

while ($null -ne ($line = [Console]::In.ReadLine())) {
    if ($line.StartsWith('FOREGROUND|')) {
        $foregroundParts = $line.Split('|', 2)
        if ($foregroundParts.Length -eq 2) {
            [Console]::Out.WriteLine("$($foregroundParts[1])|$([VethosWindowProbe]::Foreground())")
            [Console]::Out.Flush()
        }
        continue
    }
    if ($line.StartsWith('VISIBLE_WINDOWS|')) {
        $visibleParts = $line.Split('|', 2)
        if ($visibleParts.Length -eq 2) {
            [Console]::Out.WriteLine("$($visibleParts[1])|$([VethosWindowProbe]::VisibleWindows())")
            [Console]::Out.Flush()
        }
        continue
    }
    if ($line.StartsWith('CLOSE|')) {
        $controlParts = $line.Split('|', 3)
        $windowId = 0L
        $ok = $false
        if ($controlParts.Length -eq 3 -and [long]::TryParse($controlParts[2], [ref]$windowId)) {
            $ok = [VethosWindowProbe]::ForceClose($windowId)
        }
        if ($controlParts.Length -ge 2) {
            [Console]::Out.WriteLine("CONTROL|$($controlParts[1])|$(if ($ok) { '1' } else { '0' })")
            [Console]::Out.Flush()
        }
        continue
    }
    if ($line.StartsWith('MINIMIZE|')) {
        $controlParts = $line.Split('|', 3)
        $windowId = 0L
        $ok = $false
        if ($controlParts.Length -eq 3 -and [long]::TryParse($controlParts[2], [ref]$windowId)) {
            $ok = [VethosWindowProbe]::Minimize($windowId)
        }
        if ($controlParts.Length -ge 2) {
            [Console]::Out.WriteLine("CONTROL|$($controlParts[1])|$(if ($ok) { '1' } else { '0' })")
            [Console]::Out.Flush()
        }
        continue
    }
    if ($line.StartsWith('ATTACH|')) {
        $controlParts = $line.Split('|', 8)
        $overlayId = 0L
        $targetId = 0L
        $insetLeft = 0
        $insetTop = 0
        $insetRight = 0
        $insetBottom = 0
        $ok = $false
        if ($controlParts.Length -ge 4 -and
            [long]::TryParse($controlParts[2], [ref]$overlayId) -and
            [long]::TryParse($controlParts[3], [ref]$targetId)) {
            if ($controlParts.Length -ge 8) {
                [int]::TryParse($controlParts[4], [ref]$insetLeft) | Out-Null
                [int]::TryParse($controlParts[5], [ref]$insetTop) | Out-Null
                [int]::TryParse($controlParts[6], [ref]$insetRight) | Out-Null
                [int]::TryParse($controlParts[7], [ref]$insetBottom) | Out-Null
            }
            $ok = [VethosWindowProbe]::AttachOverlay(
                $overlayId,
                $targetId,
                $insetLeft,
                $insetTop,
                $insetRight,
                $insetBottom
            )
        }
        if ($controlParts.Length -ge 2) {
            [Console]::Out.WriteLine("CONTROL|$($controlParts[1])|$(if ($ok) { '1' } else { '0' })")
            [Console]::Out.Flush()
        }
        continue
    }
    if ($line.StartsWith('SYNC|')) {
        $syncParts = $line.Split('|', 3)
        $overlayId = 0L
        $targetId = 0L
        if ($syncParts.Length -eq 3 -and
            [long]::TryParse($syncParts[1], [ref]$overlayId) -and
            [long]::TryParse($syncParts[2], [ref]$targetId)) {
            [VethosWindowProbe]::SyncOverlay($overlayId, $targetId) | Out-Null
        }
        continue
    }
    if ($line.StartsWith('DETACH|')) {
        $overlayId = 0L
        if ([long]::TryParse($line.Substring(7), [ref]$overlayId)) {
            [VethosWindowProbe]::DetachOverlay($overlayId)
        }
        continue
    }
    if ($line.StartsWith('MUTE_APP_AUDIO|')) {
        $muteParts = $line.Split('|', 4)
        $mutePid = 0
        if ($muteParts.Length -ge 3 -and [int]::TryParse($muteParts[2], [ref]$mutePid)) {
            $muteName = if ($muteParts.Length -eq 4) { $muteParts[3] } else { '' }
            [VethosWindowProbe]::MuteAppAudio($muteParts[1], $mutePid, $muteName) | Out-Null
        }
        continue
    }
    if ($line.StartsWith('PAUSE_APP_MEDIA_SESSION|')) {
        $pauseParts = $line.Split('|', 3)
        $pausePid = 0
        if ($pauseParts.Length -ge 2 -and [int]::TryParse($pauseParts[1], [ref]$pausePid)) {
            $pauseName = if ($pauseParts.Length -eq 3) { $pauseParts[2] } else { '' }
            Invoke-VethosMediaSessionPause $pausePid $pauseName
        }
        continue
    }
    if ($line.StartsWith('RESTORE_APP_AUDIO|')) {
        [VethosWindowProbe]::RestoreAppAudio($line.Substring(18)) | Out-Null
        continue
    }
    if ($line.StartsWith('RESTORE_APP_AUDIO_TARGET|')) {
        $restoreParts = $line.Split('|', 4)
        $restorePid = 0
        if ($restoreParts.Length -ge 3 -and [int]::TryParse($restoreParts[2], [ref]$restorePid)) {
            $restoreName = if ($restoreParts.Length -eq 4) { $restoreParts[3] } else { '' }
            [VethosWindowProbe]::RestoreAppAudioForTarget($restoreParts[1], $restorePid, $restoreName) | Out-Null
        }
        continue
    }
    if ($line -eq 'RESTORE_ALL_APP_AUDIO') {
        [VethosWindowProbe]::RestoreAllAppAudio()
        continue
    }
    if ($line.StartsWith('RESTORE_PROCESS_TASKBAR|')) {
        $taskbarParts = $line.Split('|', 3)
        $taskbarPid = 0
        if ($taskbarParts.Length -ge 2 -and [int]::TryParse($taskbarParts[1], [ref]$taskbarPid)) {
            $taskbarName = if ($taskbarParts.Length -eq 3) { $taskbarParts[2] } else { '' }
            [VethosWindowProbe]::RestoreProcessTaskbar($taskbarPid, $taskbarName)
        }
        continue
    }
    if ($line -eq 'RESTORE_ALL_TASKBAR') {
        [VethosWindowProbe]::RestoreAllTaskbarWindows()
        continue
    }
    if ($line.StartsWith('PROTECT_PREVIEW|')) {
        $previewId = 0L
        if ([long]::TryParse($line.Substring(16), [ref]$previewId)) {
            [VethosWindowProbe]::ProtectWindowPreview($previewId)
        }
        continue
    }
    if ($line.StartsWith('RESTORE_PREVIEW|')) {
        $previewId = 0L
        if ([long]::TryParse($line.Substring(16), [ref]$previewId)) {
            [VethosWindowProbe]::RestoreWindowPreview($previewId)
        }
        continue
    }
    if ($line.StartsWith('WATCH|')) {
        $watchParts = $line.Split('|', 4)
        $watchPid = 0
        if ($watchParts.Length -ge 3 -and [int]::TryParse($watchParts[2], [ref]$watchPid)) {
            $watchName = if ($watchParts.Length -eq 4) { $watchParts[3] } else { '' }
            [VethosWindowWatcher]::Start($watchParts[1], $watchPid, $watchName)
        }
        continue
    }
    if ($line.StartsWith('STOP|')) {
        [VethosWindowWatcher]::Stop($line.Substring(5))
        continue
    }
    $parts = $line.Split('|', 3)
    if ($parts.Length -lt 2) { continue }
    $requestId = $parts[0]
    $pidValue = 0
    if (-not [int]::TryParse($parts[1], [ref]$pidValue)) {
        [Console]::Out.WriteLine("$requestId|hidden")
        [Console]::Out.Flush()
        continue
    }
    try {
        $targetName = if ($parts.Length -eq 3) { $parts[2] } else { '' }
        $bounds = [VethosWindowProbe]::Bounds($pidValue, $targetName)
        [Console]::Out.WriteLine("$requestId|$bounds")
    } catch {
        [Console]::Out.WriteLine("$requestId|hidden")
    }
    [Console]::Out.Flush()
}
[VethosWindowProbe]::RestoreAllAppAudio()
[VethosWindowProbe]::RestoreAllTaskbarWindows()
`

let probe: ChildProcessWithoutNullStreams | null = null
let readyPromise: Promise<void> | null = null
let resolveReady: (() => void) | null = null
let rejectReady: ((err: Error) => void) | null = null
let nextRequestId = 1
let nextWatcherId = 1
const pending = new Map<string, PendingQuery>()
const pendingForeground = new Map<string, PendingForeground>()
const pendingVisibleWindows = new Map<string, PendingVisibleWindows>()
const pendingControls = new Map<string, PendingControl>()
const watchers = new Map<string, WindowWatcherRegistration>()
const attachments = new Map<string, AttachmentRegistration>()
let restartTimer: ReturnType<typeof setTimeout> | null = null
let intentionallyStopped = false

export function parseProcessWindowBounds(raw: string): ProcessWindowBounds | null {
  if (raw === 'hidden') return null
  const values = raw.split(',').map(Number)
  if (values.length !== 5 || values.some((value) => !Number.isFinite(value))) return null
  const [pid, left, top, right, bottom] = values as [number, number, number, number, number]
  if (!Number.isInteger(pid) || pid <= 0) return null
  if (right <= left || bottom <= top) return null
  return { pid, x: left, y: top, width: right - left, height: bottom - top }
}

export function parseProcessWindowBoundsList(raw: string): ProcessWindowBounds[] {
  if (!raw || raw === 'hidden') return []
  const windows: ProcessWindowBounds[] = []
  for (const entry of raw.split(';')) {
    const values = entry.split(',')
    if (values.length !== 7) continue
    const [windowId = '', pidRaw = '', leftRaw = '', topRaw = '', rightRaw = '', bottomRaw = '', minimizedRaw = '0'] = values
    const pid = Number(pidRaw)
    const left = Number(leftRaw)
    const top = Number(topRaw)
    const right = Number(rightRaw)
    const bottom = Number(bottomRaw)
    if (!windowId || !Number.isInteger(pid) || pid <= 0) continue
    if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) continue
    windows.push({
      windowId,
      pid,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      minimized: minimizedRaw === '1',
    })
  }
  return windows
}

export function parseForegroundWindowInfo(raw: string): ForegroundWindowInfo | null {
  if (!raw || raw === 'hidden') return null
  const [boundsPart = '', processNamePart = '', titlePart = ''] = raw.split('|', 3)
  const values = boundsPart.split(',')
  if (values.length !== 7) return null
  const [
    windowId = '',
    pidRaw = '',
    leftRaw = '',
    topRaw = '',
    rightRaw = '',
    bottomRaw = '',
    minimizedRaw = '0',
  ] = values
  const pid = Number(pidRaw)
  const left = Number(leftRaw)
  const top = Number(topRaw)
  const right = Number(rightRaw)
  const bottom = Number(bottomRaw)
  if (!/^\d+$/u.test(windowId) || !Number.isInteger(pid) || pid <= 0) return null
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    return null
  }

  const decode = (value: string): string => {
    try {
      return Buffer.from(value, 'base64').toString('utf8')
    } catch {
      return ''
    }
  }

  return {
    windowId,
    pid,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    minimized: minimizedRaw === '1',
    processName: decode(processNamePart).toLowerCase(),
    title: decode(titlePart),
  }
}

export function parseVisibleWindowInfos(raw: string): VisibleWindowInfo[] {
  if (!raw || raw === 'hidden') return []
  return raw
    .split(';')
    .map((entry) => parseForegroundWindowInfo(entry))
    .filter((entry): entry is VisibleWindowInfo => entry !== null)
}

function settlePendingAsMissing(): void {
  for (const query of pending.values()) {
    clearTimeout(query.timer)
    query.resolve(null)
  }
  pending.clear()
  for (const foreground of pendingForeground.values()) {
    clearTimeout(foreground.timer)
    foreground.resolve(null)
  }
  pendingForeground.clear()
  for (const visibleWindows of pendingVisibleWindows.values()) {
    clearTimeout(visibleWindows.timer)
    visibleWindows.resolve([])
  }
  pendingVisibleWindows.clear()
  for (const control of pendingControls.values()) {
    clearTimeout(control.timer)
    control.resolve(false)
  }
  pendingControls.clear()
}

function sendWatcher(child: ChildProcessWithoutNullStreams, id: string, watcher: WindowWatcherRegistration): void {
  if (child.stdin.destroyed) return
  child.stdin.write(`WATCH|${id}|${watcher.pid}|${watcher.processName}\n`)
}

function normalizeInsets(insets: OverlayWindowInsets = {}): Required<OverlayWindowInsets> {
  const toInt = (value: number | undefined): number =>
    Number.isFinite(value) ? Math.max(0, Math.round(value ?? 0)) : 0
  return {
    left: toInt(insets.left),
    top: toInt(insets.top),
    right: toInt(insets.right),
    bottom: toInt(insets.bottom),
  }
}

function attachCommand(
  requestId: string,
  overlayWindowId: string,
  registration: AttachmentRegistration,
): string {
  const { targetWindowId, insets } = registration
  return [
    'ATTACH',
    requestId,
    overlayWindowId,
    targetWindowId,
    String(insets.left),
    String(insets.top),
    String(insets.right),
    String(insets.bottom),
  ].join('|')
}

function scheduleProbeRestart(): void {
  if (intentionallyStopped || (watchers.size === 0 && attachments.size === 0) || restartTimer) return
  restartTimer = setTimeout(() => {
    restartTimer = null
    void startProbe().catch(() => scheduleProbeRestart())
  }, 200)
}

function resetProbe(child: ChildProcessWithoutNullStreams, err?: Error): void {
  if (probe !== child) return
  probe = null
  if (err) rejectReady?.(err)
  resolveReady = null
  rejectReady = null
  readyPromise = null
  settlePendingAsMissing()
  scheduleProbeRestart()
}

function getEnvValue(name: string): string | undefined {
  return (
    process.env[name] ??
    Object.entries(process.env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  )
}

function createProbeEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const name of [
    'SystemRoot',
    'WINDIR',
    'Path',
    'PATH',
    'PATHEXT',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramData',
    'ComSpec',
    'PROCESSOR_ARCHITECTURE',
    'USERNAME',
    'USERDOMAIN',
  ]) {
    const value = getEnvValue(name)
    if (value) env[name] = value
  }
  return env
}

function startProbe(): Promise<void> {
  if (probe && readyPromise) return readyPromise
  intentionallyStopped = false

  let probeScriptDir = ''
  let probeScriptPath = ''
  try {
    probeScriptDir = mkdtempSync(joinPath(tmpdir(), 'vethos-window-probe-'))
    probeScriptPath = joinPath(probeScriptDir, 'probe.ps1')
    writeFileSync(probeScriptPath, PROBE_SCRIPT, 'utf8')
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)))
  }

  const cleanupProbeScript = (): void => {
    if (!probeScriptDir) return
    try {
      rmSync(probeScriptDir, { recursive: true, force: true })
    } catch {
      // Le dossier temporaire sera nettoyé par Windows si PowerShell le tient encore.
    }
    probeScriptDir = ''
  }

  const child = spawn(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      probeScriptPath,
    ],
    {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: createProbeEnvironment(),
    },
  )
  probe = child
  readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const startupTimer = setTimeout(() => {
    const err = new Error(`La sonde PowerShell n'est pas prête après ${STARTUP_TIMEOUT_MS} ms.`)
    log.warn('[window-probe] démarrage expiré', err.message)
    child.kill()
    resetProbe(child, err)
  }, STARTUP_TIMEOUT_MS)

  const output = readline.createInterface({ input: child.stdout, terminal: false })
  output.on('line', (line) => {
    const value = line.trim()
    if (value === 'READY') {
      clearTimeout(startupTimer)
      resolveReady?.()
      resolveReady = null
      rejectReady = null
      for (const [watcherId, watcher] of watchers) sendWatcher(child, watcherId, watcher)
      for (const [overlayWindowId, registration] of attachments) {
        child.stdin.write(`${attachCommand('0', overlayWindowId, registration)}\n`)
      }
      return
    }
    if (value.startsWith('WATCH|')) {
      const secondSeparator = value.indexOf('|', 6)
      if (secondSeparator < 7) return
      const watcherId = value.slice(6, secondSeparator)
      watchers.get(watcherId)?.onBounds(parseProcessWindowBoundsList(value.slice(secondSeparator + 1)))
      return
    }
    if (value.startsWith('CONTROL|')) {
      const [, requestId = '', result = '0'] = value.split('|', 3)
      const control = pendingControls.get(requestId)
      if (!control) return
      pendingControls.delete(requestId)
      clearTimeout(control.timer)
      control.resolve(result === '1')
      return
    }
    const separator = value.indexOf('|')
    if (separator < 1) return
    const requestId = value.slice(0, separator)
    const foreground = pendingForeground.get(requestId)
    if (foreground) {
      pendingForeground.delete(requestId)
      clearTimeout(foreground.timer)
      foreground.resolve(parseForegroundWindowInfo(value.slice(separator + 1)))
      return
    }
    const visibleWindows = pendingVisibleWindows.get(requestId)
    if (visibleWindows) {
      pendingVisibleWindows.delete(requestId)
      clearTimeout(visibleWindows.timer)
      visibleWindows.resolve(parseVisibleWindowInfos(value.slice(separator + 1)))
      return
    }
    const query = pending.get(requestId)
    if (!query) return
    pending.delete(requestId)
    clearTimeout(query.timer)
    query.resolve(parseProcessWindowBounds(value.slice(separator + 1)))
  })

  let stderr = ''
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 2_000) stderr += String(chunk)
  })
  child.once('error', (err) => {
    clearTimeout(startupTimer)
    cleanupProbeScript()
    if (probe !== child) return
    log.error('[window-probe] lancement PowerShell impossible', err)
    resetProbe(child, err)
  })
  child.once('close', (code) => {
    clearTimeout(startupTimer)
    cleanupProbeScript()
    if (probe !== child) return
    const err = new Error(
      `La sonde de fenêtre s'est arrêtée (code ${String(code)}). ${stderr.trim()}`.trim(),
    )
    log.warn('[window-probe] sonde arrêtée', err.message)
    resetProbe(child, err)
  })

  return readyPromise
}

export function prewarmProcessWindowProbe(): void {
  if (process.platform !== 'win32') return
  void startProbe().catch((err) => {
    log.warn('[window-probe] préchauffage échoué', err)
  })
}

export async function getProcessWindowBounds(
  pid: number,
  processName = '',
): Promise<ProcessWindowBounds | null> {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return null
  try {
    await startProbe()
  } catch {
    return null
  }
  const child = probe
  if (!child || child.stdin.destroyed) return null

  const requestId = String(nextRequestId++)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      resolve(null)
    }, QUERY_TIMEOUT_MS)
    pending.set(requestId, { resolve, timer })
    const safeProcessName = processName.replace(/[|\r\n]/g, '')
    child.stdin.write(`${requestId}|${pid}|${safeProcessName}\n`, (err) => {
      if (!err) return
      const query = pending.get(requestId)
      if (!query) return
      pending.delete(requestId)
      clearTimeout(query.timer)
      query.resolve(null)
    })
  })
}

export async function getForegroundWindowInfo(): Promise<ForegroundWindowInfo | null> {
  if (process.platform !== 'win32') return null
  try {
    await startProbe()
  } catch {
    return null
  }
  const child = probe
  if (!child || child.stdin.destroyed) return null

  const requestId = String(nextRequestId++)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingForeground.delete(requestId)
      resolve(null)
    }, QUERY_TIMEOUT_MS)
    pendingForeground.set(requestId, { resolve, timer })
    child.stdin.write(`FOREGROUND|${requestId}\n`, (err) => {
      if (!err) return
      const foreground = pendingForeground.get(requestId)
      if (!foreground) return
      pendingForeground.delete(requestId)
      clearTimeout(foreground.timer)
      foreground.resolve(null)
    })
  })
}

export async function getVisibleWindowInfos(): Promise<VisibleWindowInfo[]> {
  if (process.platform !== 'win32') return []
  try {
    await startProbe()
  } catch {
    return []
  }
  const child = probe
  if (!child || child.stdin.destroyed) return []

  const requestId = String(nextRequestId++)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingVisibleWindows.delete(requestId)
      resolve([])
    }, QUERY_TIMEOUT_MS)
    pendingVisibleWindows.set(requestId, { resolve, timer })
    child.stdin.write(`VISIBLE_WINDOWS|${requestId}\n`, (err) => {
      if (!err) return
      const visibleWindows = pendingVisibleWindows.get(requestId)
      if (!visibleWindows) return
      pendingVisibleWindows.delete(requestId)
      clearTimeout(visibleWindows.timer)
      visibleWindows.resolve([])
    })
  })
}

export async function watchProcessWindows(
  pid: number,
  processName: string,
  onBounds: WindowWatcher,
): Promise<() => void> {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return () => undefined
  const watcherId = String(nextWatcherId++)
  const safeProcessName = processName.replace(/[|\r\n]/g, '')
  const registration = { pid, processName: safeProcessName, onBounds }
  watchers.set(watcherId, registration)
  try {
    await startProbe()
  } catch {
    scheduleProbeRestart()
  }
  const child = probe
  if (child && !child.stdin.destroyed) sendWatcher(child, watcherId, registration)

  return () => {
    if (!watchers.delete(watcherId)) return
    const activeChild = probe
    if (activeChild && !activeChild.stdin.destroyed) activeChild.stdin.write(`STOP|${watcherId}\n`)
  }
}

export async function watchProcessWindow(
  pid: number,
  processName: string,
  onBounds: (bounds: ProcessWindowBounds | null) => void,
): Promise<() => void> {
  return watchProcessWindows(pid, processName, (bounds) => onBounds(bounds[0] ?? null))
}

export async function minimizeProcessWindow(windowId: string): Promise<boolean> {
  return sendControlCommand('MINIMIZE', [windowId])
}

export async function closeProcessWindow(windowId: string): Promise<boolean> {
  return sendControlCommand('CLOSE', [windowId])
}

export async function attachOverlayWindow(
  overlayWindowId: string,
  targetWindowId: string,
  insets: OverlayWindowInsets = {},
): Promise<boolean> {
  if (!/^\d+$/u.test(overlayWindowId) || !/^\d+$/u.test(targetWindowId)) return false
  const registration = {
    targetWindowId,
    insets: normalizeInsets(insets),
  }
  attachments.set(overlayWindowId, registration)
  return sendControlCommand('ATTACH', [
    overlayWindowId,
    targetWindowId,
    String(registration.insets.left),
    String(registration.insets.top),
    String(registration.insets.right),
    String(registration.insets.bottom),
  ])
}

export function detachOverlayWindow(overlayWindowId: string): void {
  attachments.delete(overlayWindowId)
  const child = probe
  if (!child || child.stdin.destroyed || !/^\d+$/u.test(overlayWindowId)) return
  child.stdin.write(`DETACH|${overlayWindowId}\n`)
}

export function syncOverlayWindow(overlayWindowId: string, targetWindowId: string): void {
  if (
    process.platform !== 'win32' ||
    !/^\d+$/u.test(overlayWindowId) ||
    !/^\d+$/u.test(targetWindowId)
  ) {
    return
  }
  const child = probe
  if (!child || child.stdin.destroyed) return
  child.stdin.write(`SYNC|${overlayWindowId}|${targetWindowId}\n`)
}

async function sendControlCommand(
  command: 'MINIMIZE' | 'CLOSE' | 'ATTACH',
  ids: string[],
): Promise<boolean> {
  if (process.platform !== 'win32' || ids.some((id) => !/^\d+$/u.test(id))) return false
  try {
    await startProbe()
  } catch {
    return false
  }
  const child = probe
  if (!child || child.stdin.destroyed) return false
  const requestId = String(nextRequestId++)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingControls.delete(requestId)
      resolve(false)
    }, QUERY_TIMEOUT_MS)
    pendingControls.set(requestId, { resolve, timer })
    child.stdin.write(`${command}|${requestId}|${ids.join('|')}\n`, (err) => {
      if (!err) return
      const control = pendingControls.get(requestId)
      if (!control) return
      pendingControls.delete(requestId)
      clearTimeout(control.timer)
      control.resolve(false)
    })
  })
}

export function muteAppAudio(token: string, pid: number, processName: string): void {
  if (process.platform !== 'win32' || !token || !Number.isInteger(pid) || pid <= 0) return
  const child = probe
  if (!child || child.stdin.destroyed) return
  child.stdin.write(`MUTE_APP_AUDIO|${token}|${pid}|${processName.replace(/\|/gu, ' ')}\n`)
}

export function pauseAppMediaSession(pid: number, processName: string): void {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return
  const child = probe
  if (!child || child.stdin.destroyed) return
  child.stdin.write(`PAUSE_APP_MEDIA_SESSION|${pid}|${processName.replace(/\|/gu, ' ')}\n`)
}

export function restoreAppAudio(token: string): void {
  if (process.platform !== 'win32' || !token) return
  sendProbeLine(`RESTORE_APP_AUDIO|${token}\n`, true)
}

export function restoreAppAudioForTarget(token: string, pid: number, processName: string): void {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return
  sendProbeLine(
    `RESTORE_APP_AUDIO_TARGET|${token.replace(/\|/gu, ' ')}|${pid}|${processName.replace(/\|/gu, ' ')}\n`,
    true,
  )
}

export function restoreProcessTaskbar(pid: number, processName: string): void {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return
  sendProbeLine(`RESTORE_PROCESS_TASKBAR|${pid}|${processName.replace(/\|/gu, ' ')}\n`, true)
}

function sendProbeLine(line: string, startIfNeeded = false): void {
  const child = probe
  if (child && !child.stdin.destroyed) {
    child.stdin.write(line)
    return
  }
  if (!startIfNeeded) return
  void startProbe()
    .then(() => {
      const activeChild = probe
      if (!activeChild || activeChild.stdin.destroyed) return
      activeChild.stdin.write(line)
    })
    .catch((err) => {
      log.warn('[window-probe] commande différée impossible', err)
    })
}

export function protectBlockedWindowPreview(windowId: string): void {
  if (process.platform !== 'win32' || !/^\d+$/u.test(windowId)) return
  const child = probe
  if (!child || child.stdin.destroyed) return
  child.stdin.write(`PROTECT_PREVIEW|${windowId}\n`)
}

export function restoreBlockedWindowPreview(windowId: string): void {
  if (process.platform !== 'win32' || !/^\d+$/u.test(windowId)) return
  const child = probe
  if (!child || child.stdin.destroyed) return
  child.stdin.write(`RESTORE_PREVIEW|${windowId}\n`)
}

export function stopProcessWindowProbe(): void {
  intentionallyStopped = true
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
  const child = probe
  probe = null
  readyPromise = null
  resolveReady = null
  rejectReady = null
  settlePendingAsMissing()
  watchers.clear()
  attachments.clear()
  if (child && !child.stdin.destroyed) {
    try {
      child.stdin.write('RESTORE_ALL_APP_AUDIO\n')
      child.stdin.write('RESTORE_ALL_TASKBAR\n')
    } catch {
      // La sonde est déjà en train de disparaître.
    }
  }
  setTimeout(() => child?.kill(), 80)
}
