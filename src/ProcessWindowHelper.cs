using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;

public class ProcessWindowHelper {
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hwndParent, EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr hProcess, int dwFlags, StringBuilder lpExeName, ref int lpdwSize);

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private static IntPtr foundHwnd = IntPtr.Zero;

    private static string GetProcessPath(int pid) {
        IntPtr hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (hProcess == IntPtr.Zero) return "";
        try {
            int capacity = 2048;
            StringBuilder sb = new StringBuilder(capacity);
            if (QueryFullProcessImageName(hProcess, 0, sb, ref capacity)) {
                return sb.ToString();
            }
        } finally {
            CloseHandle(hProcess);
        }
        return "";
    }

    public static void Main(string[] args) {
        if (args.Length < 2) {
            Console.WriteLine("Usage: ProcessWindowHelper.exe [bounds|visible] [pid]");
            return;
        }

        string mode = args[0].ToLower();
        int targetPid;
        if (!int.TryParse(args[1], out targetPid)) {
            Console.WriteLine("Invalid PID");
            return;
        }

        // Try to verify if the process exists
        try {
            Process.GetProcessById(targetPid);
        } catch {
            if (mode == "visible") Console.WriteLine("hidden");
            return;
        }

        // Find visible window associated with this PID
        foundHwnd = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);

            // Check if top-level window belongs directly to process and is visible
            if (pid == targetPid && IsWindowVisible(hWnd)) {
                // Ignore zero-size windows or invisible containers
                RECT rect;
                if (GetWindowRect(hWnd, out rect)) {
                    if (rect.Right > rect.Left && rect.Bottom > rect.Top) {
                        foundHwnd = hWnd;
                        return false; // Stop enumeration
                    }
                }
            }

            // Check child windows (for UWP apps hosted in ApplicationFrameHost)
            EnumChildWindows(hWnd, (childHwnd, childLParam) => {
                uint childPid;
                GetWindowThreadProcessId(childHwnd, out childPid);
                if (childPid == targetPid && IsWindowVisible(childHwnd)) {
                    RECT rect;
                    if (GetWindowRect(childHwnd, out rect)) {
                        if (rect.Right > rect.Left && rect.Bottom > rect.Top) {
                            foundHwnd = childHwnd;
                            return false; // Stop child enumeration
                        }
                    }
                }
                return true;
            }, IntPtr.Zero);

            if (foundHwnd != IntPtr.Zero) return false; // Stop top-level enumeration
            return true;
        }, IntPtr.Zero);

        if (foundHwnd != IntPtr.Zero) {
            if (mode == "visible") {
                Console.WriteLine("visible");
            } else if (mode == "bounds") {
                RECT rect;
                if (GetWindowRect(foundHwnd, out rect)) {
                    Console.WriteLine(string.Format("{0},{1},{2},{3}", rect.Left, rect.Top, rect.Right, rect.Bottom));
                }
            }
        } else {
            // Fallback for Session 0 or UWP apps visibility check
            if (mode == "visible") {
                try {
                    Process p = Process.GetProcessById(targetPid);
                    if (p.MainWindowHandle != IntPtr.Zero) {
                        Console.WriteLine("visible");
                        return;
                    }
                    string path = GetProcessPath(targetPid);
                    if (!string.IsNullOrEmpty(path) && path.ToLower().Contains("\\windowsapps\\")) {
                        Console.WriteLine("visible");
                        return;
                    }
                } catch {
                    // Ignore errors
                }
                Console.WriteLine("hidden");
            }
        }
    }
}

