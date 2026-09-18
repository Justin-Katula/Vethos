# Passe 1 : les PROTOCOLES d'URL declares par les applications.
#
# « steam:// » n'existe que parce que Steam s'est declare a Windows capable de
# demarrer des jeux. C'est une capacite AUTO-DECLAREE par l'installateur,
# verifiable localement, sans reseau et sans connaitre le produit.
#
# Passage par l'API .NET plutot que par le fournisseur de registre PowerShell :
# le parcours des 6 060 cles de HKEY_CLASSES_ROOT via Get-ChildItem prenait plus
# d'une minute puis s'interrompait sans rien produire.

$ErrorActionPreference = 'Stop'

$racine = [Microsoft.Win32.Registry]::ClassesRoot
$sortie = New-Object System.Collections.ArrayList

foreach ($nom in $racine.GetSubKeyNames()) {
  try {
    $k = $racine.OpenSubKey($nom)
    if (-not $k) { continue }
    # Un protocole se reconnait a la presence de la valeur « URL Protocol ».
    if ($k.GetValueNames() -notcontains 'URL Protocol') { $k.Close(); continue }

    $cmdKey = $k.OpenSubKey('shell\open\command')
    if (-not $cmdKey) { $k.Close(); continue }
    $c = $cmdKey.GetValue('')
    $cmdKey.Close(); $k.Close()
    if (-not $c) { continue }

    $exe = $null
    $m = [regex]::Match($c, '"([^"]+\.exe)"', 'IgnoreCase')
    if ($m.Success) { $exe = $m.Groups[1].Value }
    else {
      $m = [regex]::Match($c, '([A-Za-z]:[^\s",]+\.exe)', 'IgnoreCase')
      if ($m.Success) { $exe = $m.Groups[1].Value }
    }
    if (-not $exe) { continue }

    [void]$sortie.Add([PSCustomObject]@{ protocole = $nom; exe = $exe })
  } catch {
    continue
  }
}

[Console]::Error.WriteLine("protocoles retenus : " + $sortie.Count)
ConvertTo-Json -InputObject @($sortie) -Depth 3 -Compress
