import { safeStorage } from 'electron'
import log from '@main/logging/setup'
import type { Coffre } from '@shared/storage/atomic'

/**
 * Chiffrement des données au repos.
 *
 * Tout ce que Vethos écrit — objectifs, plan, temps passé dans chaque application,
 * sites visités — vivait en clair dans `userData`. Le mot de passe du compte local
 * ne servait que de barrière d'écran : n'importe quel programme tournant sous la
 * même session Windows pouvait lire ces fichiers sans le connaître.
 *
 * `safeStorage` s'appuie sur DPAPI sous Windows. La clé est dérivée du compte
 * Windows de l'utilisateur et gardée par le système : il n'y a aucune clé à
 * stocker, aucun mot de passe à retenir, et un fichier copié sur une autre machine
 * ou lu depuis un autre compte devient illisible.
 *
 * Ce que cela ne protège PAS : un programme tournant déjà sous le compte de
 * l'utilisateur peut demander à DPAPI de déchiffrer, comme Vethos le fait. La
 * barrière vise la copie de fichiers et l'accès hors session, pas un logiciel
 * malveillant déjà installé — aucun chiffrement local ne le pourrait.
 */
export function creerCoffre(): Coffre | undefined {
  // Disponible partout où Vethos tourne aujourd'hui. L'absence se produit surtout
  // sur des Linux sans trousseau ; on écrit alors en clair plutôt que de refuser
  // de démarrer, et on le dit dans le journal.
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn(
      '[coffre] chiffrement indisponible sur ce système — les données seront écrites en clair',
    )
    return undefined
  }

  log.info('[coffre] chiffrement des données au repos actif')
  return {
    chiffrer: (clair) => safeStorage.encryptString(clair).toString('base64'),
    dechiffrer: (chiffre) => safeStorage.decryptString(Buffer.from(chiffre, 'base64')),
  }
}
