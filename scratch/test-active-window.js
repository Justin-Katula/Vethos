const { exec } = require('child_process');
const script = `
  Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;
    public class Win32 {
      [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
      [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
      [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    }
"@
  $hwnd = [Win32]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [Win32]::GetWindowText($hwnd, $sb, 512) | Out-Null
  $title = $sb.ToString()
  $processId = 0
  [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
  $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $procName = if ($proc) { $proc.ProcessName + '.exe' } else { '' }
  @{ title = $title; process = $procName } | ConvertTo-Json
`;

exec(`powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
  console.log('--- ERROR ---');
  console.error(err);
  console.log('--- STDOUT ---');
  console.log(stdout);
  console.log('--- STDERR ---');
  console.log(stderr);
});
