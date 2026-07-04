$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== AppX non-framework packages (ALL) ==="
$appxApps = Get-AppxPackage | Where-Object { -not $_.IsFramework } | ForEach-Object {
    $pkg = $_
    $displayName = $pkg.Name
    $manifestPath = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
    if (Test-Path -LiteralPath $manifestPath -ErrorAction SilentlyContinue) {
        try {
            [xml]$manifest = Get-Content -LiteralPath $manifestPath -ErrorAction SilentlyContinue
            $dn = $manifest.Package.Properties.DisplayName
            if ($dn -and $dn -notmatch '^ms-resource:') {
                $displayName = $dn
            }
        } catch {}
    }
    [pscustomobject]@{
        DisplayName = $displayName
        PackageFamily = $pkg.PackageFamilyName
    }
}
$appxApps | Sort-Object DisplayName | Format-Table -AutoSize

Write-Host "`n=== Program Files exes with suspicious/short names ==="
$roots = @(
    $env:ProgramFiles,
    [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'),
    (Join-Path $env:LOCALAPPDATA 'Programs')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$progExes = @()
foreach ($root in $roots) {
    $exes = Get-ChildItem -LiteralPath $root -Filter *.exe -File -Recurse -Depth 3 -ErrorAction SilentlyContinue
    foreach ($exe in $exes) {
        $version = $exe.VersionInfo
        $name = $version.FileDescription
        if (-not $name) { $name = $exe.Directory.Name }
        if (-not $name) { $name = $exe.BaseName }
        $progExes += [pscustomobject]@{
            Name = $name
            ExePath = $exe.FullName
            Publisher = $version.CompanyName
        }
    }
}

$junkExes = $progExes | Where-Object {
    ($_.Name -match '^\d') -or
    ($_.Name.Length -le 3) -or
    ($_.Name -match '(64|32)bit') -or
    ($_.Name -match '^(host|worker|agent|server|client|proxy|bridge|wrapper|stub|shim|loader|launcher|monitor|watcher|tray|icon)$') -or
    ($_.Name -match '^lib') -or
    ($_.Name -match '(crashpad|crashreporter|minidump|gpu.process|renderer|zygote|nacl|pnacl|mojo)') -or
    ($_.Name -match '(elevat|privileg|admin)') -or
    ($_.Name -match '^\w+_')
}
$junkExes | Sort-Object Name | Format-Table Name, ExePath -AutoSize

Write-Host "`n=== Registry apps with suspicious names ==="
$regPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$regApps = @()
foreach ($p in $regPaths) {
    $items = Get-ItemProperty $p -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and ($_.InstallLocation -or $_.DisplayIcon) }
    $regApps += $items
}
$junkReg = $regApps | Where-Object {
    ($_.DisplayName -match '^\d') -or
    ($_.DisplayName -match '(64|32).?bit') -or
    ($_.DisplayName -match '(driver|runtime|redist|component|framework|\.net|vcredist|msvc|visual c\+\+)') -or
    ($_.DisplayName.Length -le 3)
}
$junkReg | Select-Object DisplayName, Publisher | Sort-Object DisplayName | Format-Table -AutoSize
