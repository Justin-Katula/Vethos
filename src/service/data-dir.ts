import { join } from 'node:path'

/**
 * Répertoire de données du service, partagé entre le service (SYSTEM) et l'UI
 * (utilisateur) : `C:\ProgramData\Nexus`. Voir spec §4.4.
 */
export function serviceDataDir(): string {
  const programData = process.env['ProgramData'] ?? 'C:\\ProgramData'
  return join(programData, 'Nexus')
}
