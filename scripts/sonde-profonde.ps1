# Sonde exploratoire : TOUT ce que la machine dit d'une application, au-dela des
# quatre champs deja lus.
#
# Sources examinees, toutes ecrites par l'editeur, toutes locales :
#   1. champs etendus de l'entree de desinstallation (Comments, URLInfoAbout, HelpLink)
#   2. commentaire du raccourci du menu Demarrer
#   3. table de chaines COMPLETE de la ressource VERSIONINFO
#   4. manifeste AppxManifest.xml des paquets MSIX
#   5. noms des executables et bibliotheques du dossier
#
# Usage : powershell -ExecutionPolicy Bypass -File scripts\sonde-profonde.ps1 "C:\chemin"

param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Chemins)

$ErrorActionPreference = 'SilentlyContinue'

function Champs-Desinstallation($chemin) {
  $racines = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
  )
  foreach ($r in $racines) {
    foreach ($k in (Get-ChildItem $r -ErrorAction SilentlyContinue)) {
      $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
      if (-not $p.InstallLocation) { continue }
      $loc = $p.InstallLocation.TrimEnd('\')
      if ($loc -and $chemin.TrimEnd('\').ToLower() -eq $loc.ToLower()) {
        return [ordered]@{
          nom          = $p.DisplayName
          commentaires = $p.Comments
          urlProduit   = $p.URLInfoAbout
          urlAide      = $p.HelpLink
          urlMaj       = $p.URLUpdateInfo
          lisezMoi     = $p.Readme
          icone        = $p.DisplayIcon
          contact      = $p.Contact
        }
      }
    }
  }
  return $null
}

function Commentaires-Raccourcis($chemin) {
  $dossiers = @(
    [Environment]::GetFolderPath('CommonStartMenu'),
    [Environment]::GetFolderPath('StartMenu')
  )
  $shell = New-Object -ComObject WScript.Shell
  $out = @()
  foreach ($d in $dossiers) {
    if (-not $d -or -not (Test-Path $d)) { continue }
    foreach ($lnk in (Get-ChildItem $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue)) {
      $sc = $shell.CreateShortcut($lnk.FullName)
      if (-not $sc.TargetPath) { continue }
      if ($sc.TargetPath.ToLower().StartsWith($chemin.TrimEnd('\').ToLower())) {
        $out += [ordered]@{
          raccourci   = $lnk.BaseName
          commentaire = $sc.Description
          cible       = $sc.TargetPath
          arguments   = $sc.Arguments
        }
      }
    }
  }
  return $out
}

# La table de chaines complete : Windows en expose bien plus que ProductName.
function Table-Versioninfo($exe) {
  if (-not $exe -or -not (Test-Path $exe)) { return $null }
  $v = (Get-Item $exe).VersionInfo
  $t = [ordered]@{}
  foreach ($champ in 'CompanyName', 'FileDescription', 'ProductName', 'InternalName',
    'OriginalFilename', 'Comments', 'LegalCopyright', 'LegalTrademarks',
    'PrivateBuild', 'SpecialBuild', 'ProductVersion') {
    $val = $v.$champ
    if ($val -and $val.ToString().Trim()) { $t[$champ] = $val.ToString().Trim() }
  }
  return $t
}

function Manifeste-Msix($chemin) {
  $m = Join-Path $chemin 'AppxManifest.xml'
  if (-not (Test-Path $m)) { return $null }
  try {
    [xml]$x = Get-Content $m -Raw -ErrorAction Stop
    $ve = $x.Package.Applications.Application.VisualElements
    $cat = @()
    foreach ($e in $x.Package.Applications.Application.Extensions.Extension) {
      if ($e.Category) { $cat += $e.Category }
    }
    return [ordered]@{
      description = if ($ve) { $ve.Description } else { $null }
      nomAffiche  = if ($ve) { $ve.DisplayName } else { $null }
      categories  = $cat
    }
  } catch { return $null }
}

# Les noms des binaires voisins disent souvent ce que fait le produit.
function Voisinage($chemin) {
  if (-not (Test-Path $chemin)) { return @() }
  Get-ChildItem $chemin -Recurse -Include *.exe, *.dll -ErrorAction SilentlyContinue |
    Select-Object -First 40 |
    ForEach-Object { $_.BaseName }
}

$resultats = @()
foreach ($c in $Chemins) {
  $c = $c.TrimEnd('\')
  $exe = Get-ChildItem $c -Filter *.exe -Recurse -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending | Select-Object -First 1
  $resultats += [ordered]@{
    emplacement    = $c
    desinstallation = Champs-Desinstallation $c
    raccourcis     = @(Commentaires-Raccourcis $c)
    versioninfo    = Table-Versioninfo $(if ($exe) { $exe.FullName } else { $null })
    msix           = Manifeste-Msix $c
    voisinage      = @(Voisinage $c)
  }
}

$resultats | ConvertTo-Json -Depth 6 -Compress:$false
