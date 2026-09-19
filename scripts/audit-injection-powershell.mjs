// Audit : du texte JavaScript entre-t-il dans un script PowerShell sans protection ?
//
// Une chaine PowerShell entre guillemets DOUBLES evalue ses sous-expressions :
// `"$(calc.exe)"` lance le programme. Un nom de dossier Windows peut legalement
// contenir `$`, `(` et `)`. Interpoler un chemin dans une telle chaine transforme
// donc un fichier pose sur le disque en code execute.
//
// Entre guillemets SIMPLES, rien n'est evalue : il suffit de doubler les apostrophes.
//
// Usage : node scripts/audit-injection-powershell.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const racine = process.cwd()
const fichiers = []
const parcourir = (d) => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === 'out' || e === '.git' || e === 'release') continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) parcourir(p)
    else if (/\.(tsx?|mjs|cjs)$/.test(e) && !/\.test\./.test(e)) fichiers.push(p)
  }
}
parcourir(join(racine, 'src'))
parcourir(join(racine, 'scripts'))

// Un `${...}` place a l'interieur d'une chaine PowerShell entre guillemets doubles.
const DANGEREUX = /"\s*\$\{[^}]+\}[^"]*"|\$[A-Za-z_]\w*\s*=\s*"\$\{/
// Marqueurs indiquant que le bloc alentour est bien du PowerShell.
const POWERSHELL = /Add-Type|Get-\w+|New-Object|\[Console\]|\$ErrorActionPreference|-EncodedCommand|powershell\.exe/

let suspects = 0
for (const f of fichiers) {
  const texte = readFileSync(f, 'utf8')
  if (!POWERSHELL.test(texte)) continue
  texte.split('\n').forEach((ligne, i) => {
    const nue = ligne.trim()
    if (nue.startsWith('//') || nue.startsWith('*')) return
    if (!DANGEREUX.test(ligne)) return
    // Les messages de journal ne sont pas du PowerShell.
    if (/log\.|console\.|throw new Error|`\[/.test(ligne)) return
    suspects++
    console.log(`  ${f.replace(racine, '').replace(/\\/g, '/')}:${i + 1}`)
    console.log(`      ${nue.slice(0, 100)}`)
  })
}

console.log(
  suspects === 0
    ? 'Aucune interpolation JavaScript dans une chaine PowerShell a guillemets doubles.'
    : `${suspects} interpolation(s) a revoir.`,
)
