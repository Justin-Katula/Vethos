import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import log from '@main/logging/setup'
import {
  decodeLine,
  encodeCommand,
  type SidecarCommand,
  type SidecarReply,
  type SidecarRequest,
} from './protocol'

const REQUEST_TIMEOUT_MS = 10_000

type Pending = {
  resolve: (reply: SidecarReply) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Pont vers le sidecar natif.
 *
 * Émet les événements du sidecar sous leur propre nom (`window-appeared`, ...)
 * et `exit` quand le processus meurt.
 *
 * Le sidecar est lancé avec `windowsHide: true` et sans shell : c'est ce qui
 * empêche l'apparition d'une console noire (bug 3 des notes de reprise).
 *
 * Il est aussi lancé avec `detached: true`, ce qui n'est pas optionnel : sans
 * ce réglage, libuv rattache l'enfant au Job Object global du processus avec
 * `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, et Windows tue le sidecar en cascade
 * dès que Vethos est terminé de force (Gestionnaire des tâches) — avant même
 * que son thread de death-watch ait pu restaurer quoi que ce soit ou relancer
 * Vethos. Toute l'architecture de sécurité du sidecar est inerte sans ça,
 * précisément sur le cas qu'elle existe pour couvrir.
 *
 * `detached: true` ne fait PAS réapparaître de console (vérifié : aucun
 * nouveau processus conhost.exe et aucune fenêtre de premier niveau au pid du
 * sidecar après spawn) et ne fait pas non plus attendre indéfiniment la fin
 * du sidecar avant que Vethos puisse sortir (vérifié : un script reproduisant
 * exactement la séquence de `shutdown()` ci-dessous se termine seul en
 * quelques millisecondes, sans `process.exit()`). Pas de `child.unref()` ici :
 * aucun blocage constaté qui le justifierait, et le garder rattaché garantit
 * que Node n'interrompt pas les échanges stdin/stdout en cours (la plomberie
 * requête/réponse) en sortant au milieu d'une requête en attente.
 */
export class SidecarBridge extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private reader: Interface | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  private stopped = false

  constructor(private readonly exePath: string) {
    super()
  }

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null
  }

  start(): void {
    if (this.isRunning()) return
    if (!existsSync(this.exePath)) {
      throw new Error(
        `Sidecar introuvable : ${this.exePath}\nLance "npm run build:sidecar" pour le compiler.`,
      )
    }

    this.stopped = false
    const child = spawn(this.exePath, ['--parent-pid', String(process.pid)], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      detached: true,
    })
    this.child = child

    this.reader = createInterface({ input: child.stdout })
    this.reader.on('line', (line) => this.onLine(line))

    child.stderr.on('data', (chunk: Buffer) => {
      log.debug(`[sidecar] ${chunk.toString('utf8').trimEnd()}`)
    })

    child.on('exit', (code, signal) => {
      log.info('[sidecar] processus sorti', { code, signal, voulu: this.stopped })
      this.onChildDeath(
        child,
        { code, signal, intentional: this.stopped },
        new Error('sidecar sorti avant la réponse'),
      )
    })

    child.on('error', (err) => {
      // Node émet 'error' quand le spawn lui-même échoue (chemin invalide,
      // EACCES/EPERM, antivirus qui met en quarantaine un .exe fraîchement
      // compilé — routine sous Windows). Sans ce gestionnaire, Node relance
      // l'erreur comme exception non interceptée et tue tout le processus
      // principal d'Electron, pas seulement la fonctionnalité de blocage.
      log.error('[sidecar] erreur du processus', err)
      this.onChildDeath(
        child,
        { code: null, signal: null, intentional: this.stopped },
        new Error(`sidecar en erreur avant la réponse : ${err.message}`),
      )
    })
  }

  /**
   * Nettoyage commun à `exit` et `error` : rejette les requêtes en attente
   * (et leurs timers), vide la map, abandonne les références au processus
   * mort et émet `exit` sur le pont pour que les consommateurs voient un
   * signal unique et cohérent « le sidecar a disparu ».
   *
   * Idempotent via `this.child === child` : Node documente que `exit` peut
   * se déclencher après `error` pour le même échec de spawn, donc les deux
   * gestionnaires peuvent appeler cette méthode pour la même mort de
   * processus — le second appel ne fait rien.
   */
  private onChildDeath(
    child: ChildProcessWithoutNullStreams,
    exitPayload: { code: number | null; signal: NodeJS.Signals | null; intentional: boolean },
    rejection: Error,
  ): void {
    if (this.child !== child) return
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(rejection)
    }
    this.pending.clear()
    this.child = null
    this.reader?.close()
    this.reader = null
    this.emit('exit', exitPayload)
  }

  private onLine(line: string): void {
    const message = decodeLine(line)
    if (message === null) {
      log.warn('[sidecar] ligne illisible ignorée', { line: line.slice(0, 200) })
      return
    }
    if (message.kind === 'event') {
      this.emit(message.event, message.payload)
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) {
      log.warn('[sidecar] réponse sans requête correspondante', { id: message.id })
      return
    }
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    pending.resolve(message)
  }

  request(cmd: SidecarRequest): Promise<SidecarReply> {
    const child = this.child
    if (child === null) return Promise.reject(new Error('sidecar non démarré'))

    const id = this.nextId++
    const full = { id, ...cmd } as SidecarCommand

    return new Promise<SidecarReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`sidecar sans réponse après ${REQUEST_TIMEOUT_MS} ms : ${full.cmd}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${encodeCommand(full)}\n`, (err) => {
        if (err) {
          this.pending.delete(id)
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }

  /**
   * Arrêt VOULU. Le sidecar annule ses mutations puis sort sans demander de
   * relance de Vethos — la distinction du §5.2 de la spec.
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning()) return
    this.stopped = true
    try {
      await this.request({ cmd: 'shutdown' })
    } catch (err) {
      log.warn('[sidecar] shutdown sans réponse, fermeture de stdin', err)
    }
    this.child?.stdin.end()
  }

  /** Coupe le tuyau sans prévenir. Réservé aux tests et aux cas désespérés. */
  kill(): void {
    this.child?.kill()
  }
}
