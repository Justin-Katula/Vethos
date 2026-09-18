// Audit : quels symboles sont exportes sans que personne ne les importe ?
//
// Un export mort est souvent le reste d'une version precedente : la nouvelle a pris
// sa place, l'ancienne est restee en place sans plus jamais etre appelee.
//
// On ignore les points d'entree et les fichiers de types purs, et on distingue ce qui
// n'est utilise QUE par des tests — c'est du code que l'application n'execute jamais.
//
// Usage : node scripts/audit-exports-morts.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const racine = process.cwd()
const court = (p) => p.replace(racine, '').replace(/\\/g, '/').replace(/^\//, '')

const ENTREES = new Set([
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/renderer/src/main.tsx',
])

function sources() {
  const out = []
  const parcourir = (d) => {
    for (const e of readdirSync(d)) {
      if (e === 'node_modules' || e === 'out' || e === '.git') continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) parcourir(p)
      else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p)
    }
  }
  parcourir(join(racine, 'src'))
  return out
}

const tous = sources()
const estTest = (f) => /\.test\.tsx?$/.test(f)
const contenu = new Map(tous.map((f) => [f, readFileSync(f, 'utf8')]))

// --- Les symboles exportes par chaque fichier ------------------------------
const EXPORTS = [
  /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  /export\s+class\s+([A-Za-z_$][\w$]*)/g,
  /export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/g,
  /export\s+enum\s+([A-Za-z_$][\w$]*)/g,
]

const declarations = [] // { fichier, nom, type }
for (const f of tous) {
  if (estTest(f)) continue
  const t = contenu.get(f)
  for (const re of EXPORTS) {
    for (const m of t.matchAll(re)) {
      const estType = /interface|type|enum/.test(re.source)
      declarations.push({ fichier: f, nom: m[1], type: estType ? 'type' : 'valeur' })
    }
  }
}

// --- Qui mentionne chaque symbole, hors de son fichier d'origine ? ---------
function compteUsages(nom, origine) {
  const motif = new RegExp(`\\b${nom.replace(/\$/g, '\\$')}\\b`)
  let appli = 0
  let tests = 0
  for (const f of tous) {
    if (f === origine) continue
    if (!motif.test(contenu.get(f))) continue
    if (estTest(f)) tests++
    else appli++
  }
  return { appli, tests }
}

const morts = []
const testsSeulement = []
for (const d of declarations) {
  if (ENTREES.has(court(d.fichier))) continue
  const { appli, tests } = compteUsages(d.nom, d.fichier)
  if (appli === 0 && tests === 0) morts.push(d)
  else if (appli === 0) testsSeulement.push(d)
}

// `--valeurs` : ne garder que les fonctions et constantes. Un type exporte sans
// consommateur est une facade documentaire, pas du code mort.
const VALEURS_SEULEMENT = process.argv.includes('--valeurs')

const grouper = (liste) => {
  const m = {}
  for (const d of liste) {
    if (VALEURS_SEULEMENT && d.type === 'type') continue
    ;(m[court(d.fichier)] ||= []).push(`${d.nom}${d.type === 'type' ? ' (type)' : ''}`)
  }
  return m
}

console.log('='.repeat(72))
console.log('EXPORTS QUE PERSONNE N IMPORTE')
console.log('='.repeat(72))
console.log(`symboles exportes analyses : ${declarations.length}`)
console.log(`jamais mentionnes ailleurs : ${morts.length}`)
console.log(`mentionnes SEULEMENT par des tests : ${testsSeulement.length}\n`)

console.log('--- jamais mentionnes nulle part ---')
for (const [f, noms] of Object.entries(grouper(morts)).sort()) {
  console.log(`  ${f}`)
  console.log(`      ${noms.join(', ')}`)
}

console.log('\n--- utilises uniquement par des tests ---')
for (const [f, noms] of Object.entries(grouper(testsSeulement)).sort()) {
  console.log(`  ${f}`)
  console.log(`      ${noms.join(', ')}`)
}
