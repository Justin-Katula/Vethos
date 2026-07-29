// Preuve reelle du pont natif. Sortie horodatee, a coller dans le rapport.
//
//   node scripts/sidecar-smoke.mjs
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXE = join(ROOT, 'resources', 'sidecar', 'vethos-probe.exe')

if (!existsSync(EXE)) {
  console.error(`Sidecar absent : ${EXE}\nLance d'abord "npm run build:sidecar".`)
  process.exit(1)
}

const t0 = Date.now()
const stamp = () => `+${String(Date.now() - t0).padStart(5, ' ')}ms`
const say = (msg) => console.log(`${stamp()}  ${msg}`)

const child = spawn(EXE, ['--parent-pid', String(process.pid)], {
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: false,
})

const replies = new Map()
let nextId = 1

createInterface({ input: child.stdout }).on('line', (line) => {
  say(`<- ${line}`)
  try {
    const msg = JSON.parse(line)
    if (typeof msg.id === 'number' && replies.has(msg.id)) {
      replies.get(msg.id)(msg)
      replies.delete(msg.id)
    }
  } catch {
    /* trace uniquement */
  }
})
createInterface({ input: child.stderr }).on('line', (line) => say(`   ${line}`))

function send(cmd) {
  const id = nextId++
  const payload = JSON.stringify({ id, ...cmd })
  say(`-> ${payload}`)
  return new Promise((res) => {
    replies.set(id, res)
    child.stdin.write(`${payload}\n`)
  })
}

say('=== PREUVE 1 : le sidecar repond ===')
const pong = await send({ cmd: 'ping' })
say(pong.ok && pong.pong === 'vethos-probe' ? 'PASS ping' : 'ECHEC ping')

say('=== PREUVE 2 : commande inconnue refusee proprement, sans crash ===')
const bad = await send({ cmd: 'nawak' })
say(!bad.ok && typeof bad.error === 'string' ? 'PASS commande inconnue' : 'ECHEC')
const stillAlive = await send({ cmd: 'ping' })
say(stillAlive.ok ? 'PASS toujours vivant apres commande inconnue' : 'ECHEC processus mort')

say('=== PREUVE 3 : enumeration reelle des fenetres ===')
const snap = await send({ cmd: 'snapshot' })
const windows = snap.windows ?? []
say(`${windows.length} fenetre(s) de premier niveau enumerees`)

// window-filter.ts n'est pas importable depuis un .mjs sans transpilation, et
// il est deja couvert par vitest. Ce qu'on prouve ici est complementaire : que
// le sidecar fournit reellement TOUS les attributs dont le filtre a besoin.
const REQUIRED = [
  'hwnd', 'pid', 'exeName', 'title', 'className', 'exStyle', 'style',
  'hasOwner', 'cloaked', 'visible', 'elevated', 'processCreatedAt',
  'showState', 'bounds',
]
const first = windows[0]
const missing = first ? REQUIRED.filter((k) => !(k in first)) : REQUIRED
say(missing.length === 0 ? 'PASS tous les attributs presents' : `ECHEC champs manquants : ${missing}`)

const withTitle = windows.filter((w) => w.title.trim().length > 0)
say(`${withTitle.length} fenetre(s) avec un titre`)
for (const w of withTitle.slice(0, 5)) {
  say(`   ${w.exeName} | "${w.title}" | ${w.className} | ${w.showState} | ` +
      `${w.bounds.left},${w.bounds.top} ${w.bounds.right - w.bounds.left}x${w.bounds.bottom - w.bounds.top}` +
      `${w.elevated ? ' | ELEVEE' : ''}`)
}

// Preuve du bug 5 : aucune fenetre non minimisee ne doit rapporter -32000.
const sentinels = withTitle.filter(
  (w) => w.showState !== 'minimized' && (w.bounds.left <= -30000 || w.bounds.top <= -30000),
)
say(sentinels.length === 0
  ? 'PASS aucune bounds sentinelle sur une fenetre non minimisee'
  : `ATTENTION ${sentinels.length} fenetre(s) suspecte(s)`)

// Preuve du hwnd en chaine : une valeur numerique perdrait de la precision.
say(typeof first?.hwnd === 'string' ? 'PASS hwnd transporte en chaine' : 'ECHEC hwnd numerique')
say(typeof first?.processCreatedAt === 'string'
  ? 'PASS processCreatedAt transporte en chaine'
  : 'ECHEC processCreatedAt numerique')

say('=== PREUVE 4 : arret voulu, sortie propre ===')
const shutdownReply = await send({ cmd: 'shutdown' })
say(
  shutdownReply.ok === true
    ? 'PASS shutdown accepte (ok: true)'
    : `ECHEC shutdown refuse : ${JSON.stringify(shutdownReply)}`,
)
child.stdin.end()
const { code, signal } = await new Promise((res) => child.on('exit', (code, signal) => res({ code, signal })))
const cleanExit = code === 0 && signal === null
say(
  cleanExit
    ? `PASS sidecar sorti proprement (code ${code}, signal ${signal})`
    : `ECHEC sortie non propre (code ${code}, signal ${signal})`,
)
