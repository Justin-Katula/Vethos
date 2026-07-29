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

say('=== PREUVE 3 : arret voulu, sortie propre ===')
await send({ cmd: 'shutdown' })
child.stdin.end()
await new Promise((res) => child.on('exit', res))
say(`PASS sidecar sorti avec le code ${child.exitCode}`)
