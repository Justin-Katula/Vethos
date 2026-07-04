import { join } from 'node:path'

/**
 * Répertoire de données du service, partagé entre le service (SYSTEM) et l'UI
 * (utilisateur) : `C:\ProgramData\Vethos`. Voir spec §4.4.
 */
export function serviceDataDir(): string {
  if (process.env.VETHOS_DEV === 'true') {
    const base = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd()
    return join(base, 'VethosDev')
  }
  const programData = process.env['ProgramData'] ?? 'C:\\ProgramData'
  return join(programData, 'Vethos')
}
