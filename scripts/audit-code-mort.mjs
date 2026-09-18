// Audit : quel code n'est plus atteint par personne ?
//
// Une application Electron a TROIS points d'entree independants — le processus
// principal, le preload et le rendu. Un fichier n'est vivant que si l'un des trois
// finit par l'importer. Chercher depuis un seul entrainerait a declarer mort tout ce
// qui sert aux deux autres.
//
// Usage : node scripts/audit-code-mort.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve as resoudre } from 'node:path'

const racine = process.cwd()
const ALIAS = {
  '@main': join(racine, 'src/main'),
  '@shared': join(racine, 'src/shared'),
  '@': join(racine, 'src/renderer/src'),
}
const ENTREES = [
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/renderer/src/main.tsx',
]
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json']

const court = (p) => p.replace(racine, '').replace(/\\/g, '/').replace(/^\//, '')

/** Tous les fichiers source du projet, tests et scripts exclus. */
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

/** Resout un specificateur d'import vers un chemin de fichier reel. */
function resoudreImport(specificateur, depuis) {
  let base = null
  if (specificateur.startsWith('.')) {
    base = resoudre(dirname(depuis), specificateur)
  } else {
    for (const [a, cible] of Object.entries(ALIAS)) {
      if (specificateur === a || specificateur.startsWith(a + '/')) {
        base = join(cible, specificateur.slice(a.length))
        break
      }
    }
  }
  if (base === null) return null // paquet externe

  for (const ext of ['', ...EXTENSIONS]) {
    const essai = base + ext
    if (existsSync(essai) && statSync(essai).isFile()) return essai
  }
  for (const ext of EXTENSIONS) {
    const essai = join(base, 'index' + ext)
    if (existsSync(essai)) return essai
  }
  return null
}

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g

function importsDe(fichier) {
  const texte = readFileSync(fichier, 'utf8')
  const out = new Set()
  for (const m of texte.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3]
    if (!spec) continue
    const cible = resoudreImport(spec, fichier)
    if (cible) out.add(cible)
  }
  return [...out]
}

// --- 1. Atteignabilite depuis les trois entrees -----------------------------
const atteints = new Set()
const origine = new Map()
for (const e of ENTREES) {
  const depart = join(racine, e)
  if (!existsSync(depart)) {
    console.log(`ATTENTION : point d'entree introuvable — ${e}`)
    continue
  }
  const pile = [depart]
  while (pile.length) {
    const f = pile.pop()
    if (atteints.has(f)) continue
    atteints.add(f)
    if (!origine.has(f)) origine.set(f, e)
    for (const dep of importsDe(f)) if (!atteints.has(dep)) pile.push(dep)
  }
}

const tous = sources()
const tests = tous.filter((f) => /\.test\.tsx?$/.test(f))
const nonTests = tous.filter((f) => !/\.test\.tsx?$/.test(f))

// Un fichier importe UNIQUEMENT par des tests n'est pas vivant dans l'application.
const importesParTests = new Set()
for (const t of tests) for (const d of importsDe(t)) importesParTests.add(d)

const morts = nonTests.filter((f) => !atteints.has(f))

console.log('='.repeat(72))
console.log('CODE NON ATTEINT DEPUIS LES TROIS POINTS D ENTREE')
console.log('='.repeat(72))
console.log(`fichiers source (hors tests) : ${nonTests.length}`)
console.log(`atteints par l'application   : ${nonTests.filter((f) => atteints.has(f)).length}`)
console.log(`NON atteints                 : ${morts.length}\n`)

const categorie = (f) => {
  const c = court(f)
  if (/\.manual\.(runner|test)\./.test(c)) return 'outil manuel'
  if (importesParTests.has(f)) return 'utilise SEULEMENT par des tests'
  return 'orphelin complet'
}

const parCat = {}
for (const f of morts) {
  const c = categorie(f)
  ;(parCat[c] ||= []).push(court(f))
}
for (const [cat, liste] of Object.entries(parCat).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`--- ${cat} (${liste.length}) ---`)
  for (const f of liste.sort()) console.log(`    ${f}`)
  console.log()
}
