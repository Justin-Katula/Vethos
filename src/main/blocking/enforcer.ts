import log from '@main/logging/setup'
import { listProcesses } from '@main/tracking/enumerator'
import {
  closeSiteBlockOverlayWindow,
  closeSiteBlockOverlayWindowsExcept,
  restoreBlockedAppResources,
  showBlockOverlayWindow,
} from '@main/tracking/strict-block-window'
import { createSiteTracker, type SiteTracker } from '@main/tracking/site-tracker'
import { watchProcessWindows } from '@main/tracking/process-window-probe'
import type { SessionSnapshot } from './clock'

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
  unwatch: () => void
}

export type Enforcer = {
  /** Aligne le monde réel sur l'instantané de session. Idempotent. */
  apply: (snapshot: SessionSnapshot) => Promise<void>
  /** Lève tout : overlays fermés, barre des tâches et son restaurés. */
  stop: () => Promise<void>
  /** PIDs actuellement bloqués — pour l'interface et les tests. */
  blockedPids: () => number[]
}

export function createEnforcer(): Enforcer {
  const suivis = new Map<number, Suivi>()
  let scanTimer: NodeJS.Timeout | null = null
  let actif = false
  let sitesBloques = new Set<string>()
  let tracker: SiteTracker | null = null
  /** PIDs vivants au démarrage de la session, pour la distinction préexistante. */
  let pidsAuDemarrage = new Set<number>()
  let appsBloquees = new Set<string>()

  function libererUn(suivi: Suivi): void {
    try {
      suivi.unwatch()
    } catch (err) {
      log.warn('[enforcer] arrêt de surveillance impossible', { pid: suivi.pid, err })
    }
    // Rend la barre des tâches et le son. Appelé sur CHAQUE chemin de sortie :
    // une application laissée muette et absente de la barre des tâches serait
    // le pire défaut possible.
    restoreBlockedAppResources(suivi.attemptToken, suivi.pid, suivi.exeName)
  }

  async function bloquer(pid: number, exeName: string): Promise<void> {
    if (suivis.has(pid)) return

    const attemptToken = `${pid}-${Date.now()}`
    const preexisting = pidsAuDemarrage.has(pid)

    // La surveillance des fenêtres du processus déclenche l'overlay dès qu'une
    // fenêtre existe. Une application peut mettre plusieurs secondes à en
    // ouvrir une : on ne peut pas se contenter d'un instantané.
    // Le watcher rend TOUTES les fenêtres du processus, pas une seule : une
    // application peut en avoir plusieurs, et chacune doit être recouverte.
    const unwatch = await watchProcessWindows(pid, exeName, (fenetres) => {
      if (!actif) return
      for (const fenetre of fenetres) {
        // Une fenêtre minimisée n'a rien à recouvrir, et ses bounds sont la
        // sentinelle -32000 : la recouvrir placerait l'overlay hors écran.
        if (fenetre.minimized === true || fenetre.windowId === undefined) continue
        showBlockOverlayWindow({
          targetName: exeName,
          type: 'app',
          mode: 'work',
          pid,
          attemptToken,
          windowId: fenetre.windowId,
        })
      }
    })

    suivis.set(pid, { pid, exeName, attemptToken, preexisting, unwatch })
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
        libererUn(suivi)
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

  async function stop(): Promise<void> {
    actif = false
    arreterTrackerSites()
    sitesBloques = new Set()
    if (scanTimer !== null) {
      clearInterval(scanTimer)
      scanTimer = null
    }
    for (const suivi of suivis.values()) libererUn(suivi)
    suivis.clear()
    closeSiteBlockOverlayWindow()
    appsBloquees = new Set()
    pidsAuDemarrage = new Set()
    log.info('[enforcer] session levée, ressources restaurées')
  }

  async function apply(snapshot: SessionSnapshot): Promise<void> {
    if (!snapshot.active) {
      if (actif) await stop()
      return
    }

    const nouvelleListe = new Set(snapshot.blockedAppIds.map((id) => id.toLowerCase()))

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
      actif = true
      log.info('[enforcer] session démarrée', {
        apps: [...nouvelleListe],
        dejaLances: pidsAuDemarrage.size,
      })
    }

    // Applications retirées de la session en cours : on les libère.
    for (const [pid, suivi] of [...suivis]) {
      if (!nouvelleListe.has(suivi.exeName.toLowerCase())) {
        libererUn(suivi)
        suivis.delete(pid)
      }
    }

    appsBloquees = nouvelleListe
    sitesBloques = new Set(snapshot.blockedSites)
    if (sitesBloques.size > 0) demarrerTrackerSites()
    else arreterTrackerSites()
    await scanner()

    if (scanTimer === null) {
      scanTimer = setInterval(() => void scanner(), SCAN_INTERVAL_MS)
    }
  }

  return {
    apply,
    stop,
    blockedPids: () => [...suivis.keys()],
  }
}
