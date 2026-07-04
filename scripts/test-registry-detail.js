const { execFile } = require('child_process');
const util = require('util');
const fs = require('fs');
const execFilePromise = util.promisify(execFile);

async function run() {
  const registryScript = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $paths = @(
      'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    $apps = foreach ($p in $paths) {
      Get-ItemProperty $p -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentDisplayName -and -not $_.NoDisplay } |
        Select-Object DisplayName, InstallLocation, DisplayIcon, Publisher, UninstallString
    }
    @($apps) | ConvertTo-Json -Depth 2
  `;

  try {
    const { stdout } = await execFilePromise(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', registryScript],
      { maxBuffer: 15 * 1024 * 1024 }
    );
    fs.writeFileSync('registry-details.json', stdout, 'utf-8');
    console.log('Saved registry-details.json');
  } catch (err) {
    console.error(err);
  }
}

run();
