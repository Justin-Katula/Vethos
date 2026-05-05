import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { isSafeListed } from './safe-list'

const execAsync = promisify(exec)

export async function killByImageName(imageName: string): Promise<void> {
  if (isSafeListed(imageName)) {
    throw new Error(`Refused to kill safe-listed process: ${imageName}`)
  }
  try {
    await execAsync(`taskkill /F /IM "${imageName}" /T`, { windowsHide: true })
  } catch (err) {
    const msg = (err as { stderr?: string }).stderr ?? ''
    if (/not found|introuvable|aucune/i.test(msg)) return
    throw err
  }
}
