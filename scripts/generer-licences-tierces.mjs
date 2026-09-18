// Rassemble les licences des dependances de production en un seul fichier.
//
// MIT, ISC et OFL-1.1 exigent toutes que leur avis accompagne le logiciel
// distribue. Electron et Chromium livrent deja les leurs ; les paquets npm, non.
//
// Usage : node scripts/generer-licences-tierces.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const racine = process.cwd()
const paquet = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'))

const lire = (nom) => {
  const p = join(racine, 'node_modules', nom, 'package.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** Le texte de licence tel que le paquet le livre, s'il le livre. */
const texteLicence = (nom) => {
  const dossier = join(racine, 'node_modules', nom)
  if (!existsSync(dossier)) return null
  let fichiers = []
  try {
    fichiers = readdirSync(dossier)
  } catch {
    return null
  }
  const candidat = fichiers.find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f))
  if (!candidat) return null
  try {
    return readFileSync(join(dossier, candidat), 'utf8').trim()
  } catch {
    return null
  }
}

const vus = new Set()
const collectes = []
const visiter = (nom) => {
  if (vus.has(nom)) return
  vus.add(nom)
  const m = lire(nom)
  if (!m) return
  const licence = (typeof m.license === 'string' ? m.license : m.license?.type) || 'non declaree'
  collectes.push({
    nom,
    version: m.version || '',
    licence,
    auteur: typeof m.author === 'string' ? m.author : m.author?.name || '',
    texte: texteLicence(nom),
  })
  for (const d of Object.keys(m.dependencies || {})) visiter(d)
}
for (const d of Object.keys(paquet.dependencies || {})) visiter(d)

collectes.sort((a, b) => a.nom.localeCompare(b.nom))

const lignes = [
  `Avis relatifs aux logiciels tiers — ${paquet.productName || paquet.name} ${paquet.version}`,
  '',
  "Ce produit inclut les logiciels ci-dessous. Chacun reste soumis a sa propre",
  'licence, dont le texte est reproduit ici lorsque le paquet le fournit.',
  '',
  `${collectes.length} paquets, regroupes par licence :`,
  '',
]

const parLicence = {}
for (const c of collectes) (parLicence[c.licence] ||= []).push(c)
for (const [licence, items] of Object.entries(parLicence).sort()) {
  lignes.push(`  ${licence} — ${items.map((i) => i.nom).join(', ')}`)
}
lignes.push('', '='.repeat(78), '')

for (const c of collectes) {
  lignes.push('-'.repeat(78))
  lignes.push(`${c.nom} ${c.version}`)
  lignes.push(`Licence : ${c.licence}${c.auteur ? ` — ${c.auteur}` : ''}`)
  lignes.push('')
  lignes.push(c.texte || '(Le paquet ne livre pas le texte de sa licence.)')
  lignes.push('')
}

const sortie = join(racine, 'build', 'THIRD-PARTY-NOTICES.txt')
writeFileSync(sortie, lignes.join('\n'), 'utf8')
console.log(`${collectes.length} paquets -> ${sortie.replace(racine, '.')}`)
