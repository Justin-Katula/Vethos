import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

/**
 * Fichiers de blocage migrés de `%APPDATA%\Nexus` (ancien emplacement, quand le
 * blocage tournait dans le main) vers `C:\ProgramData\Nexus` (emplacement du
 * service). `hosts.nexus.staging` n'y figure pas : c'est un fichier transitoire
 * d'écriture atomique, recréé à la volée — rien à migrer.
 */
const BLOCKING_FILES = [
  'nexus_blocking.json',
  'nexus_blocking_history.json',
  'nexus_blocking_active.json',
  'hosts.nexus.backup',
] as const

async function fileExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Copie les fichiers de blocage de `fromDir` vers `toDir`, **sans écraser** : un
 * fichier déjà présent dans `toDir` est laissé tel quel (le service en est
 * propriétaire après la 1ʳᵉ migration). Crée `toDir` au besoin. Idempotent —
 * ré-appelée, elle ne fait rien de plus.
 */
export async function migrateBlockingData(fromDir: string, toDir: string): Promise<void> {
  await fsp.mkdir(toDir, { recursive: true })
  for (const name of BLOCKING_FILES) {
    const dest = join(toDir, name)
    if (await fileExists(dest)) continue
    const src = join(fromDir, name)
    if (!(await fileExists(src))) continue
    await fsp.copyFile(src, dest)
  }
}
