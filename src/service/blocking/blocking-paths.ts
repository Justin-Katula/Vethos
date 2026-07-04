import { serviceDataDir } from '../data-dir'

// Répertoire des fichiers de blocage (backup du hosts, staging, fichier de
// session active). Par défaut : le data dir du service. Le `main` le surcharge
// au démarrage via setBlockingDataDir() pour conserver son comportement actuel
// (userData de l'app) tant que le blocage tourne dans le main — jusqu'au Lot 4.
let dataDir = serviceDataDir()

export function setBlockingDataDir(dir: string): void {
  dataDir = dir
}

export function blockingDataDir(): string {
  return dataDir
}
