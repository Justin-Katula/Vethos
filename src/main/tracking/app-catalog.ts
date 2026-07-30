import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app as electronApp } from 'electron'
import log from '@main/logging/setup'
import { discoverInstalledApps, type DiscoveredApp } from './app-discovery'

/**
 * Catalogue des applications installées, conservé sur disque.
 *
 * Le scan est coûteux : sept sources, dont un balayage de `Program Files`, un
 * appel `winget` et l'extraction d'une icône par application. Le refaire à
 * chaque ouverture de page — ou à chaque lancement de Vethos — n'a aucun sens :
 * la liste des logiciels installés ne change pas d'une minute à l'autre.
 *
 * Le catalogue est donc lu depuis le disque par défaut, et n'est reconstruit
 * que sur demande explicite de l'utilisateur, ou lorsqu'il n'existe pas encore.
 */

const CATALOG_VERSION = 1

type Catalogue = {
  version: number
  scannedAt: string
  apps: DiscoveredApp[]
}

function cheminCatalogue(): string {
  return join(electronApp.getPath('userData'), 'nexus_app_catalog.json')
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
    // Un catalogue non écrit coûte un rescan au prochain lancement, rien de
    // plus : on ne fait pas échouer la découverte pour autant.
    log.warn('[app-catalog] écriture impossible', err)
  }
}

/**
 * Applications installées, depuis le cache si possible.
 *
 * `force: true` relance le scan complet — c'est le bouton Rafraîchir. Même
 * dans ce cas l'IA n'est pas rappelée pour les applications déjà jugées : son
 * cache lui est propre et survit au rafraîchissement.
 */
export async function getAppCatalog(options: { force?: boolean } = {}): Promise<DiscoveredApp[]> {
  if (options.force !== true) {
    const cache = await lire()
    if (cache !== null) {
      log.info(`[app-catalog] ${cache.apps.length} application(s) depuis le cache`)
      return cache.apps
    }
  }

  log.info(`[app-catalog] scan complet${options.force === true ? ' (demandé)' : ' (aucun cache)'}`)
  const apps = await discoverInstalledApps()
  await ecrire(apps)
  return apps
}

/** Date du dernier scan, pour l'afficher à côté du bouton Rafraîchir. */
export async function getCatalogScannedAt(): Promise<string | null> {
  return (await lire())?.scannedAt ?? null
}
