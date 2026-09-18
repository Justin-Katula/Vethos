import log from '@main/logging/setup'
import { listProcesses } from '@main/tracking/enumerator'
import {
  closeAppBlockOverlay,
  closeSiteBlockOverlayWindow,
  closeSiteBlockOverlayWindowsExcept,
  restoreBlockedAppResources,
  showBlockOverlayWindow,
} from '@main/tracking/strict-block-window'
import { createSiteTracker, type SiteTracker } from '@main/tracking/site-tracker'
import type { SessionSnapshot } from './clock'
import { getProtectionLevel, BLOCK_REJECTED_PROTECTED } from './system-guard'
import {
  createNetworkController,
  type InternetBlockLease,
  type NetworkController,
} from './network-controller'

/**
 * Applique une session de blocage sur le monde réel.
 *
 * L'horloge (`clock.ts`) décide *qu'il faut bloquer* ; cet exécuteur *bloque*.
 * La séparation compte : l'horloge est pure et testée, l'exécuteur est
 * entièrement fait d'effets de bord sur des fenêtres qui ne nous appartiennent
 * pas.
 *
 * Le moteur sous-jacent (`strict-block-window` + `process-window-probe`) cache
 * la fenêtre et coupe le son sans jamais tuer le processus. Il passe par
 * PowerShell + `Add-Type`, qui compile son pont Win32 **en mémoire** : aucun
 * exécutable sur le disque, donc rien que Smart App Control puisse refuser.
 *
 * Deux garanties portées ici :
 *
 * - **Aucun processus n'est jamais tué.** L'exécuteur n'appelle rien qui
 *   termine quoi que ce soit ; seul le bouton Fermer de l'overlay le fait, à
 *   la demande explicite de l'utilisateur.
 * - **Tout est rendu à la fin.** `stop()` restaure barre des tâches et son de
 *   chaque application touchée, même si la session s'est terminée par une
 *   erreur.
 */

/** Cadence de recherche des applications bloquées nouvellement lancées. */
const SCAN_INTERVAL_MS = 2_000

type Suivi = {
  pid: number
  exeName: string
  attemptToken: string
  /** Le processus tournait-il AVANT le début de la session ? */
  preexisting: boolean
  networkLease: InternetBlockLease | null
}

export type Enforcer = {
  /** Aligne le monde réel sur l'instantané de session. Idempotent. */
  apply: (snapshot: SessionSnapshot) => Promise<void>
  /** Lève tout : overlays fermés, barre des tâches et son restaurés. */
  stop: () => Promise<void>
  /** Arrêt définitif de Vethos : lève la session puis ferme l'assistant pare-feu. */
  shutdown: () => Promise<void>
  /** PIDs actuellement bloqués — pour l'interface et les tests. */
  blockedPids: () => number[]
}

export function createEnforcer(deps: { network?: NetworkController } = {}): Enforcer {
  const network = deps.network ?? createNetworkController()
  const suivis = new Map<number, Suivi>()
  let scanTimer: NodeJS.Timeout | null = null
  let actif = false
  let sitesBloques = new Set<string>()
  let tracker: SiteTracker | null = null
  /** PIDs vivants au démarrage de la session, pour la distinction préexistante. */
  let pidsAuDemarrage = new Set<number>()
  let appsBloquees = new Set<string>()

  /**
   * File d'exécution : tout ce qui touche `actif`, `suivis`, `appsBloquees` ou
   * `pidsAuDemarrage` y passe, un seul à la fois.
   *
   * Sans elle, deux chemins se croisent pour de vrai. L'horloge appelle `apply` sans
   * l'attendre (`void enforcer.apply(...)` dans index.ts) : deux transitions
   * rapprochées voient toutes deux `actif === false`, prennent chacune l'instantané
   * des processus lancés, et la seconde écrase la première — or c'est cet instantané
   * qui décide si le bouton Fermer avertit d'un travail non sauvegardé. En parallèle,
   * `scanner` bat sur un intervalle et parcourt `suivis` que `apply` est en train de
   * modifier.
   */
  let file: Promise<unknown> = Promise.resolve()
  function enFile<T>(travail: () => Promise<T>): Promise<T> {
    const suivant = file.then(travail, travail)
    // La file ne doit jamais rester rompue : un échec ne bloque pas les suivants.
    file = suivant.catch(() => undefined)
    return suivant
  }

  async function libererUn(suivi: Suivi): Promise<void> {
    // Rend la barre des tâches, le son et les overlays. Appelé sur CHAQUE
    // chemin de sortie : une application laissée muette et absente de la barre
    // des tâches serait le pire défaut possible.
    let overlayFerme = false
    try {
      overlayFerme = await closeAppBlockOverlay(suivi.attemptToken)
    } catch (err) {
      log.warn('[enforcer] fermeture du groupe overlay impossible', { pid: suivi.pid, err })
    }
    if (!overlayFerme) {
      await restoreBlockedAppResources(suivi.attemptToken, suivi.pid, suivi.exeName)
    }
    if (suivi.networkLease) {
      try {
        await network.unblockProcess(suivi.networkLease)
      } catch (err) {
        log.warn('[enforcer] restauration réseau impossible', { pid: suivi.pid, err })
      }
      // eslint-disable-next-line require-atomic-updates -- `suivi` n'est plus dans `suivis` à ce stade : personne d'autre ne le voit.
      suivi.networkLease = null
    }
  }

  async function bloquer(pid: number, exeName: string): Promise<void> {
    if (suivis.has(pid)) return
    if (getProtectionLevel(exeName) === 'NEVER_BLOCK') {
      log.warn(
        `[enforcer] [SystemGuard] ${BLOCK_REJECTED_PROTECTED}: interception au niveau processus pour "${exeName}" (pid=${pid}). Blocage refusé.`,
      )
      return
    }

    const attemptToken = `${pid}-${Date.now()}`
    const preexisting = pidsAuDemarrage.has(pid)

    // Le groupe d'overlay possède l'unique watcher de fenêtres. L'ancien
    // double watcher créait une course où deux callbacks tentaient de créer et
    // rattacher le même overlay, d'où les apparitions intermittentes.
    showBlockOverlayWindow({
      targetName: exeName,
      type: 'app',
      mode: 'work',
      pid,
      attemptToken,
    })

    const suivi: Suivi = { pid, exeName, attemptToken, preexisting, networkLease: null }
    suivis.set(pid, suivi)
    const lease = await network.blockProcess(pid, exeName)
    if (suivis.get(pid) === suivi && actif) suivi.networkLease = lease
    else if (lease) await network.unblockProcess(lease)
    log.info('[enforcer] application bloquée', { pid, exeName, preexisting })
  }

  async function scanner(): Promise<void> {
    if (!actif || appsBloquees.size === 0) return
    let processus: Array<{ name: string; pid: number }>
    try {
      processus = await listProcesses()
    } catch (err) {
      log.warn('[enforcer] énumération des processus impossible', err)
      return
    }

    const vivants = new Set(processus.map((p) => p.pid))

    // Nouvelles cibles.
    for (const p of processus) {
      if (appsBloquees.has(p.name) && !suivis.has(p.pid)) {
        await bloquer(p.pid, p.name)
      }
    }

    // Cibles disparues : le processus s'est terminé de lui-même.
    for (const [pid, suivi] of [...suivis]) {
      if (!vivants.has(pid)) {
        await libererUn(suivi)
        suivis.delete(pid)
        log.info('[enforcer] processus disparu, suivi retiré', { pid })
      }
    }
  }

  /**
   * Un domaine bloqué correspond-il au site consulté ?
   *
   * Comparaison par suffixe de domaine, pas par sous-chaîne : bloquer
   * « youtube.com » doit attraper « m.youtube.com » sans attraper
   * « notyoutube.com ».
   */
  function siteEstBloque(domaine: string): boolean {
    const vu = domaine.toLowerCase().replace(/^www\./u, '')
    for (const brut of sitesBloques) {
      const cible = brut.toLowerCase().replace(/^www\./u, '')
      if (vu === cible || vu.endsWith(`.${cible}`)) return true
    }
    return false
  }

  function demarrerTrackerSites(): void {
    if (tracker !== null) return
    tracker = createSiteTracker({
      hasActiveSession: async () => actif && sitesBloques.size > 0,
      // Le navigateur n'affiche plus de site bloqué dans cette fenêtre : son
      // overlay disparaît. C'est ce qui fait que changer d'onglet lève le
      // recouvrement, sans toucher aux autres fenêtres.
      onVisibleBrowserWindows: (windowIds) => {
        if (!actif) return
        closeSiteBlockOverlayWindowsExcept(windowIds)
      },
    })
    tracker.on('site-detected', (event) => {
      if (!actif || !siteEstBloque(event.domain)) return
      showBlockOverlayWindow({
        targetName: event.domain,
        type: 'site',
        mode: 'work',
        ...(event.pid !== undefined ? { pid: event.pid } : {}),
        ...(event.windowId !== undefined ? { windowId: event.windowId } : {}),
      })
    })
    tracker.start()
    log.info('[enforcer] surveillance des sites démarrée')
  }

  function arreterTrackerSites(): void {
    if (tracker === null) return
    tracker.stop()
    tracker = null
    closeSiteBlockOverlayWindow()
    log.info('[enforcer] surveillance des sites arrêtée')
  }

  async function lever(): Promise<void> {
    actif = false
    arreterTrackerSites()
    sitesBloques = new Set()
    if (scanTimer !== null) {
      clearInterval(scanTimer)
      scanTimer = null
    }
    await Promise.all([...suivis.values()].map((suivi) => libererUn(suivi)))
    suivis.clear()
    closeSiteBlockOverlayWindow()
    appsBloquees = new Set()
    pidsAuDemarrage = new Set()
    log.info('[enforcer] session levée, ressources restaurées')
  }

  async function appliquer(snapshot: SessionSnapshot): Promise<void> {
    if (!snapshot.active) {
      if (actif) await lever()
      return
    }

    const nouvelleListe = new Set<string>()
    for (const rawId of snapshot.blockedAppIds) {
      const lower = rawId.toLowerCase().trim()
      if (!lower) continue
      if (getProtectionLevel(lower) === 'NEVER_BLOCK') {
        log.warn(
          `[enforcer] [SystemGuard] ${BLOCK_REJECTED_PROTECTED}: "${rawId}" est sous protection NEVER_BLOCK. Aucune opération de blocage ne sera exécutée.`,
        )
        continue
      }
      nouvelleListe.add(lower)
    }

    if (!actif) {
      // Démarrage : on note qui tourne déjà, avant de bloquer quoi que ce soit.
      // Ce fait décide plus tard si le bouton Fermer avertit d'un travail non
      // sauvegardé — il doit être établi maintenant, pas reconstitué après.
      try {
        pidsAuDemarrage = new Set((await listProcesses()).map((p) => p.pid))
      } catch (err) {
        log.warn('[enforcer] instantané de démarrage impossible', err)
        pidsAuDemarrage = new Set()
      }
      // eslint-disable-next-line require-atomic-updates -- `apply` est sérialisé par `enFile` : un seul passage à la fois.
      actif = true
      log.info('[enforcer] session démarrée', {
        apps: [...nouvelleListe],
        dejaLances: pidsAuDemarrage.size,
      })
    }

    // Applications retirées de la session en cours : on les libère.
    for (const [pid, suivi] of [...suivis]) {
      if (!nouvelleListe.has(suivi.exeName.toLowerCase())) {
        await libererUn(suivi)
        suivis.delete(pid)
      }
    }

    appsBloquees = nouvelleListe
    sitesBloques = new Set(snapshot.blockedSites)
    if (sitesBloques.size > 0) demarrerTrackerSites()
    else arreterTrackerSites()
    await scanner()

    if (scanTimer === null) {
      // Le balayage passe par la file comme le reste, et saute un battement quand il
      // est déjà en cours : énumérer les processus puis poser des overlays peut durer
      // plus longtemps que l'intervalle, et les passages empilés se marcheraient
      // dessus — ou s'accumuleraient sans fin dans la file.
      let balayageEnCours = false
      scanTimer = setInterval(() => {
        if (balayageEnCours) return
        balayageEnCours = true
        void enFile(() => scanner())
          .catch((err) => log.warn('[enforcer] balayage interrompu', err))
          .finally(() => {
            balayageEnCours = false
          })
      }, SCAN_INTERVAL_MS)
    }
  }

  return {
    // Toutes les entrées publiques sont sérialisées : l'horloge appelle `apply` sans
    // l'attendre, et rien ne garantit qu'un appel soit fini quand le suivant arrive.
    apply: (snapshot) => enFile(() => appliquer(snapshot)),
    stop: () => enFile(() => lever()),
    async shutdown() {
      await enFile(() => lever())
      await network.stop()
    },
    blockedPids: () => [...suivis.keys()],
  }
}
