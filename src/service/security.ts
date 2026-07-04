import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

const ACL_SENTINEL = '.acl-v1'
const SID_SYSTEM = '*S-1-5-18'
const SID_ADMINISTRATORS = '*S-1-5-32-544'
const SID_USERS = '*S-1-5-32-545'
const SID_EVERYONE = '*S-1-1-0'
const SID_AUTHENTICATED_USERS = '*S-1-5-11'
const SID_INTERACTIVE = '*S-1-5-4'

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

function dataDirAclCommands(dataDir: string): string[][] {
  return [
    [dataDir, '/inheritance:r', '/T', '/C'],
    [
      dataDir,
      '/grant:r',
      `${SID_SYSTEM}:(OI)(CI)F`,
      `${SID_ADMINISTRATORS}:(OI)(CI)F`,
      `${SID_USERS}:(OI)(CI)RX`,
      '/T',
      '/C',
    ],
    [dataDir, '/remove:g', SID_EVERYONE, SID_AUTHENTICATED_USERS, SID_INTERACTIVE, '/T', '/C'],
  ]
}

async function runIcacls(args: string[]): Promise<void> {
  await execFile('icacls.exe', args, { windowsHide: true })
}

export async function ensureServiceDataDirSecurity(dataDir: string): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true })

  if (process.platform !== 'win32' || process.env.VETHOS_DEV === 'true') return

  const sentinel = join(dataDir, ACL_SENTINEL)
  if (await fileExists(sentinel)) return

  for (const args of dataDirAclCommands(dataDir)) {
    await runIcacls(args)
  }
  await fs.writeFile(sentinel, new Date().toISOString(), 'utf8')
}
