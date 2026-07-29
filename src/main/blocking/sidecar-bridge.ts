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
    })
    this.child = child

    this.reader = createInterface({ input: child.stdout })
    this.reader.on('line', (line) => this.onLine(line))

    child.stderr.on('data', (chunk: Buffer) => {
      log.debug(`[sidecar] ${chunk.toString('utf8').trimEnd()}`)
    })

    child.on('exit', (code, signal) => {
      log.info('[sidecar] processus sorti', { code, signal, voulu: this.stopped })
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error('sidecar sorti avant la réponse'))
      }
      this.pending.clear()
      this.child = null
      this.reader?.close()
      this.reader = null
      this.emit('exit', { code, signal, intentional: this.stopped })
    })
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
