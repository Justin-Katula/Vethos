# Identifiants de paquets connus de Windows pour les applications INSTALLEES.
#
# `winget list` ne fait aucune recherche : il lit ce qui est installe et donne,
# quand il le connait, l'identifiant CANONIQUE du paquet. Ce n'est donc pas une
# devinette mais une correspondance deja etablie par le systeme.
#
# Trois formes d'identifiant, par ordre de force :
#   Editeur.Produit   — identifiant canonique du depot winget
#   MSIX\...          — identite de paquet du Magasin Windows
#   ARP\...           — cle de desinstallation locale, stable mais non canonique

$ErrorActionPreference = 'SilentlyContinue'
$sortie = New-Object System.Collections.ArrayList

$lignes = winget list --accept-source-agreements 2>$null
$enTete = $null

foreach ($ligne in $lignes) {
  if (-not $ligne -or $ligne -match '^\s*$') { continue }
  # La ligne d'en-tete fixe les colonnes ; tout est aligne par position.
  if ($ligne -match '^Name\s+Id\s') { $enTete = $ligne; continue }
  if ($ligne -match '^-+$') { continue }
  if (-not $enTete) { continue }

  $posId = $enTete.IndexOf('Id')
  $posVersion = $enTete.IndexOf('Version')
  if ($posId -lt 0 -or $ligne.Length -le $posId) { continue }

  $nom = $ligne.Substring(0, $posId).Trim()
  $reste = $ligne.Substring($posId)
  $finId = if ($posVersion -gt $posId -and $reste.Length -gt ($posVersion - $posId)) { $posVersion - $posId } else { $reste.Length }
  $id = $reste.Substring(0, [Math]::Min($finId, $reste.Length)).Trim()
  if (-not $nom -or -not $id) { continue }

  $forme = if ($id -like 'MSIX\*') { 'MSIX' }
           elseif ($id -like 'ARP\*') { 'ARP' }
           elseif ($id -match 'Steam App (\d+)') { 'STEAM' }
           else { 'CANONIQUE' }

  [void]$sortie.Add([PSCustomObject]@{ nom = $nom; id = $id; forme = $forme })
}

[Console]::Error.WriteLine("entrees lues : " + $sortie.Count)
ConvertTo-Json -InputObject @($sortie) -Depth 3 -Compress
