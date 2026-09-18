import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app as electronApp } from 'electron'
import log from '@main/logging/setup'
import { discoverInstalledApps, type DiscoveredApp } from './app-discovery'
import { getOrRefreshInventory } from './app-inventory'
import { isProtectedApp, isNonUserSystemHelper } from '@main/blocking/system-guard'
import { resolveAppClassificationSync } from './classification-resolver'

const CATALOG_VERSION = 8

type Catalogue = {
  version: number
  scannedAt: string
  apps: DiscoveredApp[]
}

function cheminCatalogue(): string {
  if (electronApp && typeof electronApp.getPath === 'function') {
    try {
      return join(electronApp.getPath('userData'), 'nexus_app_catalog.json')
    } catch {
      // fallback below
    }
  }
  const appData = process.env['APPDATA']
  if (appData) {
    const vethosDir = join(appData, 'vethos')
    return join(vethosDir, 'nexus_app_catalog.json')
  }
  return join(process.cwd(), 'nexus_app_catalog.json')
}

export async function invalidateAppCatalogCache(): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises')
    await unlink(cheminCatalogue()).catch(() => undefined)
    log.info('[app-catalog] cache invalidé')
  } catch {
    // Ignorer si le fichier n'existait pas
  }
}

async function lire(): Promise<Catalogue | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cheminCatalogue(), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const catalogue = parsed as Partial<Catalogue>
    if (catalogue.version !== CATALOG_VERSION) return null
    if (!Array.isArray(catalogue.apps) || catalogue.apps.length === 0) return null
    return catalogue as Catalogue
  } catch {
    // Absent, illisible ou d'une version inconnue : on rescannera.
    return null
  }
}

async function ecrire(apps: DiscoveredApp[]): Promise<void> {
  const catalogue: Catalogue = {
    version: CATALOG_VERSION,
    scannedAt: new Date().toISOString(),
    apps,
  }
  try {
    await writeFile(cheminCatalogue(), JSON.stringify(catalogue), 'utf8')
  } catch (err) {
    log.warn('[app-catalog] écriture impossible', err)
  }
}

/**
 * Applications installées, issues du catalogue unifié AppInventory (shell:AppsFolder).
 *
 * Le catalogue est lu depuis le disque par défaut, et reconstruit via shell:AppsFolder
 * en quelques centaines de millisecondes sans balayage récursif de disques.
 */
export async function getAppCatalog(options: { force?: boolean } = {}): Promise<DiscoveredApp[]> {
  if (options.force !== true) {
    const cache = await lire()
    if (cache !== null) {
      log.info(`[app-catalog] ${cache.apps.length} application(s) depuis le cache (v${CATALOG_VERSION})`)
      return cache.apps
    }
  }

  log.info(`[app-catalog] scan AppsFolder${options.force === true ? ' (demandé)' : ' (aucun cache ou version obsolète)'}`)
  try {
    const records = await getOrRefreshInventory(options)
    if (records && records.length > 0) {
      const apps: DiscoveredApp[] = records
        .filter((r) => !r.isProtected && !isProtectedApp(r) && !isNonUserSystemHelper(r.name, r.exeName))
        .map((r) => ({
          name: r.name,
          exeName: r.exeName,
          exePath: r.exePath,
          publisher: r.publisher,
          category: r.category,
          classificationState: r.classificationState,
          classificationSource: r.classificationSource,
          classificationReasonCode: r.classificationReasonCode,
          classifierVersion: r.classifierVersion,
          source: r.source,
          packageId: r.packageFamilyName,
          hasExecutablePath: Boolean(r.exePath),
          iconDataUrl: r.iconDataUrl,
          id: r.id,
          isProtected: false,
        }))
      await ecrire(apps)
      return apps
    }
  } catch (err) {
    log.warn('[app-catalog] échec getOrRefreshInventory, fallback discoverInstalledApps', err)
  }

  const fallbackApps = await discoverInstalledApps()
  const sanitizedFallback = fallbackApps
    .filter((a) => !a.isProtected && !isProtectedApp({ name: a.name, exeName: a.exeName, targetPath: a.exePath }) && !isNonUserSystemHelper(a.name, a.exeName))
    .map((a) => {
      const cl = resolveAppClassificationSync({
        name: a.name,
        exeName: a.exeName,
        exePath: a.exePath,
        publisher: a.publisher,
      })
      return {
        ...a,
        category: cl.category,
        classificationState: cl.classificationState,
        classificationSource: cl.classificationSource,
        classificationReasonCode: cl.classificationReasonCode,
        classifierVersion: cl.classifierVersion,
      }
    })
  await ecrire(sanitizedFallback)
  return sanitizedFallback
}
