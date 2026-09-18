// Audit affine : separer ce qui est VRAIMENT mort de ce qui est seulement trop expose.
//
// Un symbole exporte que personne n'importe peut tout de meme etre utilise a
// l'interieur de son propre fichier. Ce n'est alors pas du code mort : c'est un
// `export` de trop. Les supprimer serait casser du code vivant.
//
// Trois verdicts :
//   MORT              — declare, jamais utilise, ni dedans ni dehors. A supprimer.
//   EXPORT_SUPERFLU   — utilise chez lui seulement. L'`export` peut tomber.
//   TESTS_SEULEMENT   — l'application ne l'execute jamais, seuls les tests le font.
//
// Usage : node scripts/audit-symboles.mjs [--mort]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const racine = process.cwd()
const court = (p) => p.replace(racine, '').replace(/\\/g, '/').replace(/^\//, '')
const ENTREES = new Set(['src/main/index.ts', 'src/preload/index.ts', 'src/renderer/src/main.tsx'])

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

const EXPORTS = [
  [/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, 'valeur'],
  [/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, 'valeur'],
  [/export\s+class\s+([A-Za-z_$][\w$]*)/g, 'valeur'],
  [/export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/g, 'type'],
  [/export\s+enum\s+([A-Za-z_$][\w$]*)/g, 'type'],
]

const declarations = []
for (const f of tous) {
  if (estTest(f)) continue
  for (const [re, type] of EXPORTS) {
    for (const m of contenu.get(f).matchAll(re)) declarations.push({ fichier: f, nom: m[1], type })
  }
}

/** Occurrences du symbole DANS son propre fichier, hors sa ligne de declaration. */
function usagesInternes(nom, fichier) {
  const motif = new RegExp(`\\b${nom.replace(/\$/g, '\\$')}\\b`, 'g')
  const decl = new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|let|var|class|interface|type|enum)\\s+${nom.replace(/\$/g, '\\$')}\\b`,
  )
  let n = 0
  for (const ligne of contenu.get(fichier).split('\n')) {
    if (decl.test(ligne)) continue
    n += (ligne.match(motif) || []).length
  }
  return n
}

function usagesExternes(nom, origine) {
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

const seulementMorts = process.argv.includes('--mort')
const verdicts = { MORT: [], EXPORT_SUPERFLU: [], TESTS_SEULEMENT: [] }

for (const d of declarations) {
  if (ENTREES.has(court(d.fichier))) continue
  const { appli, tests } = usagesExternes(d.nom, d.fichier)
  if (appli > 0) continue
  const interne = usagesInternes(d.nom, d.fichier)
  if (tests > 0) verdicts.TESTS_SEULEMENT.push(d)
  else if (interne > 0) verdicts.EXPORT_SUPERFLU.push(d)
  else verdicts.MORT.push(d)
}

const afficher = (titre, liste, explication) => {
  console.log(`\n${'='.repeat(72)}\n${titre} — ${liste.length}\n${explication}\n${'='.repeat(72)}`)
  const parFichier = {}
  for (const d of liste) (parFichier[court(d.fichier)] ||= []).push(d)
  for (const [f, items] of Object.entries(parFichier).sort()) {
    const valeurs = items.filter((i) => i.type === 'valeur').map((i) => i.nom)
    const types = items.filter((i) => i.type === 'type').map((i) => i.nom)
    console.log(`  ${f}`)
    if (valeurs.length) console.log(`      fonctions/constantes : ${valeurs.join(', ')}`)
    if (types.length && !seulementMorts) console.log(`      types                : ${types.join(', ')}`)
  }
}

afficher(
  'MORT',
  seulementMorts ? verdicts.MORT.filter((d) => d.type === 'valeur') : verdicts.MORT,
  'Declare, jamais utilise — ni dans son fichier, ni ailleurs, ni par un test.',
)
if (!seulementMorts) {
  afficher(
    'EXPORT SUPERFLU',
    verdicts.EXPORT_SUPERFLU,
    "Vivant chez lui, mais personne d'autre ne l'importe : l'`export` est de trop.",
  )
  afficher(
    'TESTS SEULEMENT',
    verdicts.TESTS_SEULEMENT,
    "L'application ne l'execute jamais ; seuls les tests l'appellent.",
  )
}
