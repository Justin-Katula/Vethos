import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type Process = { name: string; pid: number }

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuote = !inQuote
    } else if (c === ',' && !inQuote) {
      cells.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur)
  return cells
}

export function parseTasklistCsv(csv: string): Process[] {
  const out: Process[] = []
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells = parseCsvLine(line)
    if (cells.length < 2) continue
    const name = cells[0]
    const pidRaw = cells[1]
    if (!name || !pidRaw) continue
    const pid = Number(pidRaw)
    if (!Number.isFinite(pid)) continue
    out.push({ name: name.toLowerCase(), pid })
  }
  return out
}

export async function listProcesses(): Promise<Process[]> {
  try {
    const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true })
    return parseTasklistCsv(stdout)
  } catch (err) {
    console.error('[processes] listProcesses error:', err)
    return []
  }
}
