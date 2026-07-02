const { execFile } = require('child_process');
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

const buffer = Buffer.from(script, 'utf16le');
const encoded = buffer.toString('base64');

execFile('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-EncodedCommand',
  encoded
], (err, stdout, stderr) => {
  console.log('Error:', err);
  console.log('Stdout:', stdout.trim());
  console.log('Stderr:', stderr.trim());
});
