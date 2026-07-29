// Preuve du death-watch : la relance ne se declenche QUE sur une mort subie.
//
//   node scripts/sidecar-deathwatch-smoke.mjs
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXE = join(ROOT, 'resources', 'sidecar', 'vethos-probe.exe')
if (!existsSync(EXE)) {
  console.error(`Sidecar absent : ${EXE}\nLance d'abord "npm run build:sidecar".`)
  process.exit(1)
}

const t0 = Date.now()
const say = (m) => console.log(`+${String(Date.now() - t0).padStart(5, ' ')}ms  ${m}`)

// Cible de relance inoffensive : un .bat qui ecrit un fichier temoin.
const work = mkdtempSync(join(tmpdir(), 'vethos-dw-'))
const witness = join(work, 'temoin.txt')
const fakeApp = join(work, 'fausse-vethos.bat')
writeFileSync(fakeApp, `@echo off\r\necho relance>"${witness}"\r\n`, 'utf8')

function launchProbe(label) {
  const child = spawn(EXE, ['--parent-pid', String(process.pid)], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
  })
  createInterface({ input: child.stderr }).on('line', (l) => say(`   [${label}] ${l}`))
  const replies = new Map()
  let nextId = 1
  createInterface({ input: child.stdout }).on('line', (line) => {
    say(`<- [${label}] ${line}`)
    try {
      const msg = JSON.parse(line)
      if (replies.has(msg.id)) { replies.get(msg.id)(msg); replies.delete(msg.id) }
    } catch { /* trace */ }
  })
  const send = (cmd) => {
    const id = nextId++
    child.stdin.write(`${JSON.stringify({ id, ...cmd })}\n`)
    return new Promise((res) => replies.set(id, res))
  }
  return { child, send }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const witnessExists = () => existsSync(witness)

say('=== PREUVE A : shutdown => restauration, PAS de relance ===')
{
  const { child, send } = launchProbe('A')
  await send({ cmd: 'ping' })
  await send({ cmd: 'arm-relaunch', exePath: fakeApp })
  await send({ cmd: 'shutdown' })
  child.stdin.end()
  await new Promise((r) => child.on('exit', r))
  await sleep(700)
  say(witnessExists() ? 'ECHEC relance declenchee sur un arret voulu' : 'PASS aucune relance sur shutdown')
}

say('=== PREUVE B : relance desarmee => EOF ne relance rien ===')
{
  const { child, send } = launchProbe('B')
  await send({ cmd: 'ping' })
  await send({ cmd: 'arm-relaunch', exePath: null })
  child.stdin.end()
  await new Promise((r) => child.on('exit', r))
  await sleep(700)
  say(witnessExists() ? 'ECHEC relance sur desarme' : 'PASS aucune relance quand desarme')
}

say('=== PREUVE C : mort subie du parent => restauration ET relance ===')
{
  // Un parent intermediaire qu'on tue brutalement, pour reproduire un kill
  // depuis le Gestionnaire des taches.
  //
  // Deux details Windows non negociables ici, verifies empiriquement :
  //  - `detached: true` sur le spawn du sidecar : sans ca, Node rattache le
  //    sidecar au Job Object du parent avec kill-on-close, et Windows tue le
  //    sidecar en cascade des que le parent meurt — avant meme que son
  //    thread de death-watch ait pu reagir. Ce n'est pas optionnel.
  //  - `taskkill` SANS `/T` : `/T` tue l'arbre entier des descendants (le
  //    sidecar, et meme la relance qu'il vient de lancer), ce qui invalide
  //    la preuve. Un vrai kill depuis le Gestionnaire des taches ne tue que
  //    le processus vise, pas ses descendants — c'est ce qu'on reproduit.
  // stdout/stderr du sidecar sont rediriges vers des fichiers (pas des
  // pipes relayees par le parent intermediaire) : ce parent meurt, donc son
  // boucle Node ne peut plus rien relayer une fois mort, mais les fichiers
  // survivent et restent lisibles apres coup.
  const probeOut = join(work, 'probe-out.log')
  const probeErr = join(work, 'probe-err.log')
  const runner = join(work, 'parent.mjs')
  writeFileSync(runner, `
import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
const outFd = openSync(${JSON.stringify(probeOut)}, 'w')
const errFd = openSync(${JSON.stringify(probeErr)}, 'w')
const child = spawn(${JSON.stringify(EXE)}, ['--parent-pid', String(process.pid)], {
  windowsHide: true, stdio: ['pipe', outFd, errFd], shell: false, detached: true,
})
child.stdin.write(JSON.stringify({ id: 1, cmd: 'arm-relaunch', exePath: ${JSON.stringify(fakeApp)} }) + '\\n')
setTimeout(() => {}, 60000)
`, 'utf8')

  const parent = spawn(process.execPath, [runner], { windowsHide: true, stdio: 'ignore' })
  await sleep(1200)
  say(`parent intermediaire pid=${parent.pid}, on le tue brutalement (sans /T : seul le parent direct)`)
  spawn('taskkill', ['/PID', String(parent.pid), '/F'], { windowsHide: true })
  await sleep(2500)
  say(witnessExists() ? 'PASS relance declenchee sur mort subie' : 'ECHEC aucune relance sur mort subie')
  if (existsSync(probeErr)) {
    for (const l of readFileSync(probeErr, 'utf8').split('\n').filter((l) => l.trim().length > 0)) {
      say(`   [C] ${l}`)
    }
  }
}

say(`dossier de travail : ${work}`)
