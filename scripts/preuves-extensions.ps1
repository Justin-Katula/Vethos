# Passe 2 : les TYPES DE FICHIERS qu'une application sait ouvrir.
#
# L'extension revele le MATERIAU traite, donc l'activite. Qui ouvre .psd retouche
# des images ; qui ouvre .py ecrit du code ; qui ouvre .blend modelise en 3D.
# C'est une declaration posee par l'installateur, lisible sans reseau.
#
# Passage par l'API .NET : le fournisseur de registre PowerShell mettait 88 secondes
# a parcourir HKEY_CLASSES_ROOT puis s'interrompait sans rien produire.

$ErrorActionPreference = 'Stop'

$racine = [Microsoft.Win32.Registry]::ClassesRoot
$sortie = New-Object System.Collections.ArrayList

function Get-ExeDeCommande($texte) {
  if (-not $texte) { return $null }
  $m = [regex]::Match($texte, '"([^"]+\.exe)"', 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value }
  $m = [regex]::Match($texte, '([A-Za-z]:[^\s",]+\.exe)', 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

foreach ($nom in $racine.GetSubKeyNames()) {
  if (-not $nom.StartsWith('.')) { continue }
  try {
    $k = $racine.OpenSubKey($nom)
    if (-not $k) { continue }
    # L'extension pointe vers un TYPE, et c'est le type qui porte la commande.
    $type = $k.GetValue('')
    $k.Close()
    if (-not $type) { continue }

    $tk = $racine.OpenSubKey("$type\shell\open\command")
    if (-not $tk) { continue }
    $cmd = $tk.GetValue('')
    $tk.Close()

    $exe = Get-ExeDeCommande $cmd
    if (-not $exe) { continue }

    [void]$sortie.Add([PSCustomObject]@{ extension = $nom; exe = $exe })
  } catch {
    continue
  }
}

[Console]::Error.WriteLine("associations retenues : " + $sortie.Count)
ConvertTo-Json -InputObject @($sortie) -Depth 3 -Compress
