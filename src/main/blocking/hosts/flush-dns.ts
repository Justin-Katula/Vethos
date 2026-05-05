import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function flushDns(): Promise<void> {
  await execAsync('ipconfig /flushdns', { windowsHide: true })
}
