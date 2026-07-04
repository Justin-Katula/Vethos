import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as path from 'node:path'

const execAsync = promisify(exec)

export function ruleNameFor(sessionId: string, exePath: string): string {
  const base = path.basename(exePath)
  return `Vethos_Block_${sessionId}_${base}`
}

export function parseNetshShowRules(stdout: string): string[] {
  const out: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^Rule Name:\s+(.+?)\s*$/.exec(line)
    if (m && m[1]) out.push(m[1])
  }
  return out
}

export async function addBlockRule(args: {
  sessionId: string
  exePath: string
}): Promise<string> {
  const name = ruleNameFor(args.sessionId, args.exePath)
  const cmd = `netsh advfirewall firewall add rule name="${name}" dir=out action=block program="${args.exePath}" enable=yes`
  await execAsync(cmd, { windowsHide: true })
  return name
}

export async function deleteRuleByName(name: string): Promise<void> {
  const cmd = `netsh advfirewall firewall delete rule name="${name}"`
  try {
    await execAsync(cmd, { windowsHide: true })
  } catch (err) {
    const msg = (err as { stderr?: string }).stderr ?? ''
    if (/No rules match|aucune règle/i.test(msg)) return
    throw err
  }
}

/** Liste tous les noms de règles existantes (pour drift / cleanup). */
export async function listRuleNames(): Promise<string[]> {
  const { stdout } = await execAsync('netsh advfirewall firewall show rule name=all', {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  })
  return parseNetshShowRules(stdout)
}
