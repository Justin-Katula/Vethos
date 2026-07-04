const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);

async function run() {
  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $paths = @(
      'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    $apps = foreach ($p in $paths) {
      Get-ItemProperty $p -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match 'Git|Sky|GIMP|Discord|Outlook|Teams|WhatsApp' } |
        Select-Object DisplayName, InstallLocation, DisplayIcon, Publisher, SystemComponent, NoDisplay, PSChildName
    }
    $apps | ConvertTo-Json -Depth 2
  `;

  try {
    const { stdout } = await execFilePromise(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    console.log(stdout);
  } catch (err) {
    console.error(err);
  }
}

run();
