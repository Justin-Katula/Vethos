// Audit : chaque `setInterval` du processus principal est-il arrete quelque part ?
//
// Un intervalle jamais efface continue de battre apres la fermeture d'une fenetre ou
// l'arret d'une session : la machine travaille pour rien, et les rappels agissent sur
// un etat qui n'existe plus.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const fichiers = []
const parcourir = (d) => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === 'out' || e === '.git') continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) parcourir(p)
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) fichiers.push(p)
  }
}
parcourir(join(process.cwd(), 'src'))

let total = 0
const suspects = []
for (const f of fichiers) {
  const lignes = readFileSync(f, 'utf8').split('\n')
  const texte = lignes.join('\n')
  const clears = (texte.match(/clearInterval/g) || []).length
  const sets = []
  lignes.forEach((l, i) => {
    if (/setInterval\(/.test(l)) sets.push(i + 1)
  })
  total += sets.length
  if (sets.length > clears) {
    suspects.push({
      f: f.replace(process.cwd(), '').replace(/\\/g, '/'),
      sets: sets.length,
      clears,
      lignes: sets,
    })
  }
}

console.log(`setInterval trouves : ${total}`)
console.log(`fichiers ou les arrets sont moins nombreux que les demarrages : ${suspects.length}\n`)
for (const s of suspects) {
  console.log(`  ${s.f}`)
  console.log(`      ${s.sets} setInterval (lignes ${s.lignes.join(', ')})  /  ${s.clears} clearInterval`)
}
