# Inventaire d'identite PUREMENT LOCAL, toutes sources.
#
# Contrainte : aucune requete reseau, aucune API, aucune liste de noms ecrite a
# l'avance. Tout ce qui est produit ici provient de la machine elle-meme.
#
# Cinq sources de DECOUVERTE, parce qu'aucune n'est complete a elle seule :
#   1. Registre de desinstallation (ARP) — les installations classiques
#   2. Paquets MSIX                      — le Magasin Windows, totalement absent de l'ARP
#   3. Manifestes Steam                  — les jeux, avec leur App ID
#   4. Raccourcis du menu Demarrer       — ce que l'utilisateur voit vraiment
#   5. Processus en cours                — ce qui tourne sans etre declare nulle part
#
# Cinq sources de PREUVE, par ordre de force :
#   1. Identite de paquet     — PFN MSIX, App ID Steam
#   2. Metadonnees du binaire — VERSIONINFO ecrit par l'editeur
#   3. Signature Authenticode — qui a signe, et la signature tient-elle
#   4. Structure d'installation
#   5. Fichiers voisins       — bibliotheques de boutique laissees dans le dossier
#
# Sortie : un JSON par application sur la sortie standard.

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

# ---------------------------------------------------------------- outils communs

$MARQUEURS = @{
  'steam_api64.dll'        = 'STEAM_SDK'
  'steam_api.dll'          = 'STEAM_SDK'
  'steamclient64.dll'      = 'STEAM_SDK'
  'steam_emu.ini'          = 'EMULATEUR_STEAM'
  'steamclient_loader.exe' = 'EMULATEUR_STEAM'
  'Galaxy64.dll'           = 'GOG_SDK'
  'Galaxy.dll'             = 'GOG_SDK'
  'EOSSDK-Win64-Shipping.dll' = 'EPIC_SDK'
}

function Get-Preuves {
  param([string]$emplacement, [string]$exe)

  $p = [ordered]@{
    exeAnalyse = $null; editeurBinaire = $null; produitBinaire = $null
    descriptionBinaire = $null; nomOriginal = $null; droits = $null
    signature = 'ABSENTE'; signataire = $null
    marqueurs = @(); nbExe = 0; nbFichiers = 0; poidsMax = 0
    # Preuves profondes : tout ce que l'editeur a ecrit et que l'on ne lisait pas.
    commentaires = $null; marqueDeposee = $null; versionProduit = $null
    nomInterne = $null; voisinage = @(); piloteEmbarque = $false
  }
  if (-not $emplacement -or -not (Test-Path $emplacement)) { return $p }

  $fichiers = Get-ChildItem $emplacement -File -Recurse -Depth 2
  $p.nbFichiers = $fichiers.Count
  if ($p.nbFichiers -eq 0) { return $p }

  foreach ($f in $fichiers) {
    if ($MARQUEURS.ContainsKey($f.Name)) { $p.marqueurs += $MARQUEURS[$f.Name] }
  }
  $p.marqueurs = @($p.marqueurs | Select-Object -Unique)

  # Les dossiers de redistribuables contiennent de gros installateurs tiers
  # (DirectX, Visual C++, .NET) qui seraient pris a tort pour le binaire principal.
  $segmentsExclus = @('\_commonredist\', '\redist\', '\directx\', '\vcredist', '\dotnet', '\extras\', '\prerequisites\')
  # Les installateurs et desinstallateurs sont souvent les plus gros fichiers du
  # dossier, et se trouvent a sa racine : l'heuristique du binaire principal les
  # retenait a tort. Mesure du 2026-09-17 : « unins000.exe » etait pris pour Ollama,
  # « uninstall.exe » pour MSI Afterburner, « itch-setup.exe » pour itch — et ces
  # fichiers ne portent evidemment aucune association de type ni protocole.
  $motifsOutillage = @('unins', 'uninstall', 'uninst', 'setup', 'install', 'updater', 'update.exe', 'crashhandler', 'crashpad', 'vcredist', 'dxsetup')

  # ... sauf quand l'executable porte le nom de son propre dossier. Un produit qui
  # s'appelle « AMD Install Manager » vit dans « AMDInstallManager\ » et s'ouvre par
  # « AMDInstallManager.exe » : le filtre d'outillage le rejetait sur le mot
  # « install », et « 7z.exe », simple utilitaire embarque, devenait le binaire
  # principal — l'application entiere se retrouvait nommee « 7-Zip ».
  $nomDossier = (Split-Path $emplacement.TrimEnd('\') -Leaf)
  $cleDossier = ($nomDossier -replace '[^a-zA-Z0-9]', '').ToLower()

  $exes = @()
  foreach ($f in $fichiers) {
    if ($f.Extension -ne '.exe') { continue }
    $chemin = $f.FullName.ToLower()
    $rejete = $false
    foreach ($seg in $segmentsExclus) { if ($chemin.Contains($seg)) { $rejete = $true; break } }
    if (-not $rejete) {
      $nomFichier = $f.Name.ToLower()
      $cleFichier = ($f.BaseName -replace '[^a-zA-Z0-9]', '').ToLower()
      if ($cleDossier -and $cleFichier -eq $cleDossier) {
        $rejete = $false
      } else {
        foreach ($m in $motifsOutillage) { if ($nomFichier.Contains($m)) { $rejete = $true; break } }
      }
    }
    if (-not $rejete) { $exes += $f }
  }
  # Si le dossier ne contient QUE de l'outillage, on reprend tout plutot que rien.
  if ($exes.Count -eq 0) {
    foreach ($f in $fichiers) { if ($f.Extension -eq '.exe') { $exes += $f } }
  }

  $p.nbExe = $exes.Count
  if ($exes.Count -eq 0) { return $p }

  # On privilegie l'executable nomme par la source, puis celui pose a la racine du
  # dossier, puis le plus volumineux : dans cet ordre, c'est presque toujours le
  # binaire principal et non un utilitaire annexe.
  $principal = $null
  if ($exe) { $principal = $exes | Where-Object { $_.Name -ieq $exe } | Select-Object -First 1 }
  # L'executable qui porte le nom du dossier passe avant le plus volumineux.
  if (-not $principal -and $cleDossier) {
    $principal = $exes |
      Where-Object { ($_.BaseName -replace '[^a-zA-Z0-9]', '').ToLower() -eq $cleDossier } |
      Select-Object -First 1
  }
  if (-not $principal) {
    $racine = $exes | Where-Object { (Split-Path $_.FullName -Parent) -eq $emplacement.TrimEnd('\') }
    if ($racine) { $principal = $racine | Sort-Object Length -Descending | Select-Object -First 1 }
  }
  if (-not $principal) { $principal = $exes | Sort-Object Length -Descending | Select-Object -First 1 }

  $p.exeAnalyse = $principal.FullName
  $p.poidsMax = $principal.Length
  $v = $principal.VersionInfo
  $p.editeurBinaire     = $v.CompanyName
  $p.produitBinaire     = $v.ProductName
  $p.descriptionBinaire = $v.FileDescription
  $p.nomOriginal        = $v.OriginalFilename
  $p.droits             = $v.LegalCopyright

  # La ressource VERSIONINFO porte bien plus que ProductName. « AMD Settings » ne dit
  # nulle part ce qu'il fait, sauf dans sa version : « AMD-Radeon-Driver/drivers ».
  $p.commentaires   = $v.Comments
  $p.marqueDeposee  = $v.LegalTrademarks
  $p.versionProduit = $v.ProductVersion
  $p.nomInterne     = $v.InternalName

  # Les binaires voisins nomment ce que le produit contient. Les noms d'assets d'un
  # jeu (« Achievement_1 », « DestroyMode_1 ») en disent plus que sa fiche.
  $p.voisinage = @(
    $fichiers |
      Where-Object { $_.Extension -in '.exe', '.dll' } |
      Select-Object -First 60 |
      ForEach-Object { $_.BaseName }
  )
  # Un paquet qui embarque un pilote noyau installe du materiel : les fichiers .sys et
  # les co-installateurs du Windows Driver Framework le disent sans ambiguite.
  $p.piloteEmbarque = [bool]($fichiers | Where-Object {
      $_.Extension -eq '.sys' -or $_.BaseName -like 'WdfCoinstaller*'
    } | Select-Object -First 1)

  $s = Get-AuthenticodeSignature $principal.FullName
  $p.signature = $s.Status.ToString()
  if ($s.SignerCertificate) { $p.signataire = $s.SignerCertificate.Subject }

  return $p
}

# ---------------------------------------------------------- 1. registre (ARP)

$candidats = @()

$racinesArp = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
foreach ($r in $racinesArp) {
  Get-ItemProperty $r | Where-Object { $_.DisplayName } | ForEach-Object {
    $emplacement = $_.InstallLocation
    $exeIndice = $null
    if ($_.DisplayIcon) {
      $c = ($_.DisplayIcon -split ',')[0].Trim('"')
      if ($c -like '*.exe') {
        $exeIndice = Split-Path $c -Leaf
        if (-not $emplacement -and (Test-Path $c)) { $emplacement = Split-Path $c -Parent }
      }
    }
    $candidats += [PSCustomObject]@{
      source = 'ARP'; nom = $_.DisplayName; cle = $_.PSChildName
      editeurDeclare = $_.Publisher; version = $_.DisplayVersion
      emplacement = $emplacement; exeIndice = $exeIndice
      identitePaquet = $null; steamAppId = $null; steamNom = $null
    }
  }
}

# ------------------------------------------------------------- 2. paquets MSIX

foreach ($pk in (Get-AppxPackage)) {
  if ($pk.IsFramework) { continue }
  $candidats += [PSCustomObject]@{
    source = 'MSIX'; nom = $pk.Name; cle = $pk.PackageFullName
    editeurDeclare = $pk.Publisher; version = $pk.Version
    emplacement = $pk.InstallLocation; exeIndice = $null
    identitePaquet = $pk.PackageFamilyName; steamAppId = $null; steamNom = $null
  }
}

# ---------------------------------------------------------- 3. manifestes Steam

function Get-SteamLibraries {
  $steam = (Get-ItemProperty 'HKCU:\SOFTWARE\Valve\Steam' -Name SteamPath).SteamPath
  if (-not $steam) { return @() }
  $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
  if (-not (Test-Path $vdf)) { return @($steam) }
  $chemins = @($steam)
  foreach ($ligne in (Get-Content $vdf)) {
    if ($ligne -match '"path"\s+"([^"]+)"') { $chemins += ($matches[1] -replace '\\\\', '\') }
  }
  return $chemins | Select-Object -Unique
}

$steamApps = @{}
foreach ($lib in (Get-SteamLibraries)) {
  $dossier = Join-Path $lib 'steamapps'
  if (-not (Test-Path $dossier)) { continue }
  foreach ($m in (Get-ChildItem $dossier -Filter 'appmanifest_*.acf')) {
    $texte = Get-Content $m.FullName -Raw
    $id  = if ($texte -match '"appid"\s+"(\d+)"') { $matches[1] } else { $null }
    $nom = if ($texte -match '"name"\s+"([^"]+)"') { $matches[1] } else { $null }
    $rep = if ($texte -match '"installdir"\s+"([^"]+)"') { $matches[1] } else { $null }
    if ($id -and $rep) {
      $chemin = Join-Path (Join-Path $dossier 'common') $rep
      $steamApps[$chemin.ToLower().TrimEnd('\')] = @{ appid = $id; nom = $nom }
      if (Test-Path $chemin) {
        $candidats += [PSCustomObject]@{
          source = 'STEAM'; nom = $nom; cle = "steam_$id"
          editeurDeclare = $null; version = $null
          emplacement = $chemin; exeIndice = $null
          identitePaquet = $null; steamAppId = $id; steamNom = $nom
        }
      }
    }
  }
}

# ------------------------------------------------- 4. raccourcis du menu Demarrer

$shell = New-Object -ComObject WScript.Shell
$dossiersMenu = @(
  "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
)
foreach ($d in $dossiersMenu) {
  if (-not (Test-Path $d)) { continue }
  foreach ($lnk in (Get-ChildItem $d -Filter '*.lnk' -Recurse)) {
    $cible = $shell.CreateShortcut($lnk.FullName).TargetPath
    if (-not $cible -or $cible -notlike '*.exe' -or -not (Test-Path $cible)) { continue }
    $candidats += [PSCustomObject]@{
      source = 'MENU_DEMARRER'; nom = $lnk.BaseName; cle = $null
      editeurDeclare = $null; version = $null
      emplacement = (Split-Path $cible -Parent); exeIndice = (Split-Path $cible -Leaf)
      identitePaquet = $null; steamAppId = $null; steamNom = $null
    }
  }
}

# ----------------------------------------------------------- 5. processus en cours

foreach ($pr in (Get-Process | Where-Object { $_.Path })) {
  $candidats += [PSCustomObject]@{
    source = 'PROCESSUS'; nom = $pr.ProcessName; cle = $null
    editeurDeclare = $null; version = $null
    emplacement = (Split-Path $pr.Path -Parent); exeIndice = (Split-Path $pr.Path -Leaf)
    identitePaquet = $null; steamAppId = $null; steamNom = $null
  }
}

# ------------------------------------------ fusion par emplacement, puis analyse

$parEmplacement = @{}
foreach ($c in $candidats) {
  if (-not $c.emplacement) { continue }
  $cle = $c.emplacement.ToLower().TrimEnd('\')
  if (-not $parEmplacement.ContainsKey($cle)) {
    $parEmplacement[$cle] = [PSCustomObject]@{
      emplacement = $c.emplacement; sources = @(); noms = @()
      editeurDeclare = $null; version = $null; exeIndice = $null
      identitePaquet = $null; steamAppId = $null; steamNom = $null; cle = $null
    }
  }
  $e = $parEmplacement[$cle]
  $e.sources += $c.source
  if ($c.nom) { $e.noms += $c.nom }
  if ($c.editeurDeclare -and -not $e.editeurDeclare) { $e.editeurDeclare = $c.editeurDeclare }
  if ($c.version -and -not $e.version)               { $e.version = $c.version }
  if ($c.exeIndice -and -not $e.exeIndice)           { $e.exeIndice = $c.exeIndice }
  if ($c.identitePaquet -and -not $e.identitePaquet) { $e.identitePaquet = $c.identitePaquet }
  if ($c.steamAppId -and -not $e.steamAppId)         { $e.steamAppId = $c.steamAppId; $e.steamNom = $c.steamNom }
  if ($c.cle -and -not $e.cle)                       { $e.cle = $c.cle }
}

$resultats = @()
foreach ($cle in $parEmplacement.Keys) {
  $e = $parEmplacement[$cle]
  # Un App ID Steam s'applique meme si l'entree a ete decouverte autrement.
  if (-not $e.steamAppId -and $steamApps.ContainsKey($cle)) {
    $e.steamAppId = $steamApps[$cle].appid
    $e.steamNom   = $steamApps[$cle].nom
  }
  $resultats += [PSCustomObject]@{
    nomRegistre    = ($e.noms | Select-Object -First 1)
    nomsObserves   = @($e.noms | Select-Object -Unique)
    cleRegistre    = $e.cle
    ruche          = (@($e.sources | Select-Object -Unique) -join '+')
    editeurDeclare = $e.editeurDeclare
    version        = $e.version
    emplacement    = $e.emplacement
    identitePaquet = $e.identitePaquet
    steamAppId     = $e.steamAppId
    steamNom       = $e.steamNom
    preuves        = (Get-Preuves -emplacement $e.emplacement -exe $e.exeIndice)
  }
}

$resultats | ConvertTo-Json -Depth 6 -Compress
