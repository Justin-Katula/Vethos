// Audit : chaque canal IPC invoque-t-il un gestionnaire qui existe vraiment ?
//
// Un canal invoque sans `ipcMain.handle` correspondant leve a l'execution
// « No handler registered for ... » — l'appel echoue silencieusement dans une
// promesse rejetee, et la fonctionnalite ne marche pas sans que rien ne le dise.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const racine = process.cwd()
const fichiers = []
const parcourir = (d) => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === 'out' || e === 'dist' || e === '.git') continue
    const p = join(d, e)
    const s = statSync(p)
    if (s.isDirectory()) parcourir(p)
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) fichiers.push(p)
  }
}
parcourir(join(racine, 'src'))

const lire = (p) => readFileSync(p, 'utf8')
const court = (p) => p.replace(racine, '').replace(/\\/g, '/')

// 1. Les constantes declarees : NOM: 'valeur'
const declares = new Map()
for (const f of fichiers) {
  if (!/ipc-channels|channels/i.test(f)) continue
  for (const m of lire(f).matchAll(/([A-Z0-9_]+)\s*:\s*'([^']+)'/g)) declares.set(m[1], m[2])
}

// 2. Les gestionnaires enregistres
const geres = new Set()
for (const f of fichiers) {
  for (const m of lire(f).matchAll(/ipcMain\.(?:handle|on)\(\s*(?:IPC_CHANNELS\.)?([A-Za-z0-9_]+)/g)) geres.add(m[1])
  for (const m of lire(f).matchAll(/ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)) geres.add(m[1])
}

// 3. Les canaux invoques depuis le preload ou le renderer
const invoques = new Map()
for (const f of fichiers) {
  const t = lire(f)
  for (const m of t.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*(?:IPC_CHANNELS\.)?([A-Za-z0-9_]+)/g)) {
    if (!invoques.has(m[1])) invoques.set(m[1], court(f))
  }
  for (const m of t.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*'([^']+)'/g)) {
    if (!invoques.has(m[1])) invoques.set(m[1], court(f))
  }
}

const nomVersValeur = (n) => declares.get(n) || n
const geresValeurs = new Set([...geres].map(nomVersValeur))

console.log(`constantes declarees : ${declares.size}`)
console.log(`gestionnaires        : ${geres.size}`)
console.log(`canaux invoques      : ${invoques.size}`)

const orphelins = []
for (const [nom, ou] of invoques) {
  const val = nomVersValeur(nom)
  if (!geresValeurs.has(val) && !geres.has(nom)) orphelins.push({ nom, val, ou })
}

console.log(`\n=== INVOQUES SANS GESTIONNAIRE : ${orphelins.length} ===`)
for (const o of orphelins) console.log(`  ${o.nom}  (${o.val})  <- ${o.ou}`)

const jamais = [...declares.keys()].filter((n) => !geres.has(n) && !invoques.has(n))
console.log(`\n=== DECLARES MAIS NI GERES NI INVOQUES : ${jamais.length} ===`)
console.log('  ' + jamais.join(', '))
