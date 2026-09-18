# Chaîne complète : de la machine nue au catalogue classé.
#
# Aucune étape n'utilise la connaissance d'un modèle. Tout provient de la machine
# elle-même, ou d'annuaires officiels interrogés par identifiant exact — et tout
# résultat extérieur est confronté aux faits inscrits dans les binaires avant
# d'être accepté.
#
# Usage :  powershell -ExecutionPolicy Bypass -File scripts\construire-tout.ps1

$ErrorActionPreference = 'Stop'
$racine = Split-Path $PSScriptRoot -Parent
$donnees = Join-Path $env:USERPROFILE ''

function Etape($n, $titre) {
  Write-Host ""
  Write-Host ("[" + $n + "] " + $titre) -ForegroundColor Cyan
}

Etape 1 "Inventaire local — 5 sources de decouverte"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'identite-locale.ps1') `
  > (Join-Path $donnees 'identite-locale.json') 2>$null
Write-Host ("    " + ((Get-Item (Join-Path $donnees 'identite-locale.json')).Length) + " octets")

Etape 2 "Protocoles d'URL declares au systeme"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'preuves-protocoles.ps1') `
  > (Join-Path $donnees 'protocoles.json') 2>$null

Etape 3 "Types de fichiers associes"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'preuves-extensions.ps1') `
  > (Join-Path $donnees 'extensions.json') 2>$null

Etape 4 "Identifiants canoniques des paquets installes"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'identifiants-winget.ps1') `
  > (Join-Path $donnees 'winget-ids.json') 2>$null

Etape 5 "Titres et descriptions du Magasin Windows (par identite de paquet)"
& node (Join-Path $PSScriptRoot 'resoudre-store.cjs') (Join-Path $donnees 'identite-locale.json') (Join-Path $donnees 'store-titres.json')

Etape 6 "Descriptions officielles des paquets canoniques"
& node (Join-Path $PSScriptRoot 'descriptions-winget.cjs') (Join-Path $donnees 'winget-ids.json') (Join-Path $donnees 'descriptions.json')

Etape 7 "Construction et classement du catalogue"
Push-Location $racine
& npm.cmd test -- src/main/identite/catalogue-reel.test.ts
Pop-Location

Etape 8 "Recherche et VERIFICATION des applications restees inconnues"
& node (Join-Path $PSScriptRoot 'resoudre-inconnues.cjs') `
  (Join-Path $donnees 'catalogue-construit.json') `
  (Join-Path $donnees 'identite-locale.json') `
  (Join-Path $donnees 'inconnues-resolues.json')

Etape 9 "Reconstruction avec les resolutions confirmees"
Push-Location $racine
& npm.cmd test -- src/main/identite/catalogue-reel.test.ts
Pop-Location

Write-Host ""
Write-Host "Catalogue final : $donnees\catalogue-construit.json" -ForegroundColor Green
