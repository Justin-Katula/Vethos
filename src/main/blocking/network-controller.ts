import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import log from '@main/logging/setup'

export type InternetBlockLease = {
  id: string
  executablePath: string
}

type FirewallTransport = {
  blockPid: (pid: number) => Promise<string>
  unblockPath: (executablePath: string) => Promise<void>
  stop: () => Promise<void>
}

export type NetworkController = {
  blockProcess: (pid: number, processName: string) => Promise<InternetBlockLease | null>
  unblockProcess: (lease: InternetBlockLease) => Promise<void>
  stop: () => Promise<void>
}

type PendingRequest = {
  resolve: (fields: string[]) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const CONNECT_TIMEOUT_MS = 20_000
const REQUEST_TIMEOUT_MS = 8_000

function encodeUtf8(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function decodeUtf8(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8')
}

function elevatedFirewallScript(pipeName: string, secret: string): string {
  return String.raw`
$ErrorActionPreference = 'Stop'
$client = [System.IO.Pipes.NamedPipeClientStream]::new('.', '${pipeName}', [System.IO.Pipes.PipeDirection]::InOut)
$reader = $null
$writer = $null
$rules = @{}

function Remove-VethosFirewallRules {
  Get-NetFirewallRule -DisplayName 'Vethos-Net-Block-*' -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
}

function Rule-Base([string]$path) {
  $sha = [System.Security.Cryptography.SHA1]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($path.ToLowerInvariant())
    $hash = -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
    return 'Vethos-Net-Block-' + $hash.Substring(0, 16)
  } finally { $sha.Dispose() }
}

function Encode([string]$value) {
  return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($value))
}

function Decode([string]$value) {
  return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))
}

try {
  $client.Connect(15000)
  $reader = [System.IO.StreamReader]::new($client, [System.Text.Encoding]::UTF8, $false, 4096, $true)
  $writer = [System.IO.StreamWriter]::new($client, [System.Text.UTF8Encoding]::new($false), 4096, $true)
  $writer.AutoFlush = $true
  $writer.WriteLine('HELLO|${secret}')
  Remove-VethosFirewallRules

  while (($line = $reader.ReadLine()) -ne $null) {
    $parts = $line.Split('|')
    if ($parts.Length -lt 2) { continue }
    $command = $parts[0]
    $requestId = $parts[1]
    try {
      if ($command -eq 'BLOCK' -and $parts.Length -ge 3) {
        $pidValue = 0
        if (-not [int]::TryParse($parts[2], [ref]$pidValue)) { throw 'PID invalide' }
        $path = (Get-Process -Id $pidValue -ErrorAction Stop).Path
        if ([string]::IsNullOrWhiteSpace($path)) { throw 'Chemin exécutable introuvable' }
        $key = $path.ToLowerInvariant()
        if (-not $rules.ContainsKey($key)) {
          $base = Rule-Base $path
          New-NetFirewallRule -DisplayName ($base + '-Out') -Direction Outbound -Program $path -Action Block -Profile Any | Out-Null
          New-NetFirewallRule -DisplayName ($base + '-In') -Direction Inbound -Program $path -Action Block -Profile Any | Out-Null
          $rules[$key] = $base
        }
        $writer.WriteLine('OK|' + $requestId + '|' + (Encode $path))
        continue
      }
      if ($command -eq 'UNBLOCK' -and $parts.Length -ge 3) {
        $path = Decode $parts[2]
        $key = $path.ToLowerInvariant()
        if ($rules.ContainsKey($key)) {
          $base = $rules[$key]
          Remove-NetFirewallRule -DisplayName ($base + '-Out') -ErrorAction SilentlyContinue
          Remove-NetFirewallRule -DisplayName ($base + '-In') -ErrorAction SilentlyContinue
          $rules.Remove($key)
        }
        $writer.WriteLine('OK|' + $requestId)
        continue
      }
      if ($command -eq 'STOP') {
        Remove-VethosFirewallRules
        $rules.Clear()
        $writer.WriteLine('OK|' + $requestId)
        break
      }
      throw 'Commande inconnue'
    } catch {
      $writer.WriteLine('ERR|' + $requestId + '|' + (Encode $_.Exception.Message))
    }
  }
} finally {
  Remove-VethosFirewallRules
  if ($writer) { $writer.Dispose() }
  if ($reader) { $reader.Dispose() }
  $client.Dispose()
}
`
}

function createElevatedFirewallTransport(): FirewallTransport {
  let server: Server | null = null
  let socket: Socket | null = null
  let connecting: Promise<void> | null = null
  let buffer = ''
  const pending = new Map<string, PendingRequest>()

  function rejectPending(error: Error): void {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
  }

  async function connect(): Promise<void> {
    if (socket && !socket.destroyed) return
    if (connecting) return connecting
    connecting = new Promise<void>((resolve, reject) => {
      const pipeName = `vethos-firewall-${process.pid}-${randomUUID()}`
      const pipePath = `\\\\.\\pipe\\${pipeName}`
      const secret = randomUUID()
      let settled = false
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(connectTimer)
        server?.close()
        server = null
        reject(error)
      }
      const connectTimer = setTimeout(
        () => fail(new Error("L'autorisation administrateur du pare-feu a expiré.")),
        CONNECT_TIMEOUT_MS,
      )

      server = createServer((candidate) => {
        let authenticated = false
        candidate.setEncoding('utf8')
        candidate.on('data', (chunk: string) => {
          buffer += chunk
          let newline = buffer.indexOf('\n')
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            newline = buffer.indexOf('\n')
            const fields = line.split('|')
            if (!authenticated) {
              if (fields[0] !== 'HELLO' || fields[1] !== secret) {
                candidate.destroy()
                fail(new Error('Assistant pare-feu non authentifié.'))
                return
              }
              authenticated = true
              socket = candidate
              if (!settled) {
                settled = true
                clearTimeout(connectTimer)
                server?.close()
                server = null
                resolve()
              }
              continue
            }
            const requestId = fields[1] ?? ''
            const request = pending.get(requestId)
            if (!request) continue
            pending.delete(requestId)
            clearTimeout(request.timer)
            if (fields[0] === 'OK') request.resolve(fields.slice(2))
            else request.reject(new Error(decodeUtf8(fields[2] ?? '')))
          }
        })
        candidate.once('close', () => {
          if (socket === candidate) socket = null
          rejectPending(new Error('Assistant pare-feu arrêté.'))
        })
        candidate.once('error', (error) => {
          if (!authenticated) fail(error)
        })
      })
      server.once('error', fail)
      server.listen(pipePath, () => {
        const encoded = Buffer.from(elevatedFirewallScript(pipeName, secret), 'utf16le').toString(
          'base64',
        )
        const command = `Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}')`
        const launcher = spawn(
          'powershell.exe',
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
          { windowsHide: true, stdio: 'ignore' },
        )
        launcher.once('error', fail)
        launcher.once('close', (code) => {
          if (!settled && code !== 0) {
            fail(new Error("L'autorisation administrateur du pare-feu a été refusée."))
          }
        })
      })
    }).finally(() => {
      connecting = null
    })
    return connecting
  }

  async function request(command: string, args: string[] = []): Promise<string[]> {
    await connect()
    const active = socket
    if (!active || active.destroyed) throw new Error('Assistant pare-feu indisponible.')
    const requestId = randomUUID()
    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error(`Commande pare-feu expirée : ${command}`))
      }, REQUEST_TIMEOUT_MS)
      pending.set(requestId, { resolve, reject, timer })
      active.write([command, requestId, ...args].join('|') + '\n', (error) => {
        if (!error) return
        const waiting = pending.get(requestId)
        if (!waiting) return
        pending.delete(requestId)
        clearTimeout(waiting.timer)
        waiting.reject(error)
      })
    })
  }

  return {
    async blockPid(pid) {
      const [encodedPath] = await request('BLOCK', [String(pid)])
      if (!encodedPath) throw new Error('Le pare-feu n’a pas renvoyé le chemin de l’application.')
      return decodeUtf8(encodedPath)
    },
    async unblockPath(executablePath) {
      await request('UNBLOCK', [encodeUtf8(executablePath)])
    },
    async stop() {
      if (socket && !socket.destroyed) {
        await request('STOP').catch((error) => {
          log.warn('[network-block] arrêt du pare-feu non confirmé', error)
        })
        socket.end()
      }
      server?.close()
      server = null
      socket = null
      rejectPending(new Error('Contrôleur réseau arrêté.'))
    },
  }
}

export function createNetworkController(
  transport: FirewallTransport = createElevatedFirewallTransport(),
): NetworkController {
  const references = new Map<string, number>()

  return {
    async blockProcess(pid, processName) {
      if (process.platform !== 'win32') return null
      try {
        const executablePath = await transport.blockPid(pid)
        const key = executablePath.toLowerCase()
        references.set(key, (references.get(key) ?? 0) + 1)
        log.info('[network-block] Internet coupé', { pid, processName, executablePath })
        return { id: randomUUID(), executablePath }
      } catch (error) {
        log.error('[network-block] coupure Internet impossible', { pid, processName, error })
        return null
      }
    },

    async unblockProcess(lease) {
      const key = lease.executablePath.toLowerCase()
      const remaining = Math.max(0, (references.get(key) ?? 1) - 1)
      if (remaining > 0) {
        references.set(key, remaining)
        return
      }
      references.delete(key)
      await transport.unblockPath(lease.executablePath)
      log.info('[network-block] Internet restauré', { executablePath: lease.executablePath })
    },

    async stop() {
      references.clear()
      await transport.stop()
    },
  }
}
