import { create } from 'zustand'
import type * as ModuleNotifications from 'expo-notifications'
import type { Rappel } from './rappels-plan'

/**
 * Les notifications de rappel — le seul endroit qui parle au module natif.
 *
 * Le module n'existe que dans une build qui l'embarque : chargé à la demande,
 * et chaque appel est gardé. Une build plus ancienne continue de tourner, sans
 * rappels, au lieu de planter à l'ouverture.
 */

const CATEGORIE = 'vethos-commencer'
const CATEGORIE_ANCRE = 'vethos-commencer-ancre'
/** Le préavis (5 min avant) : rien à commencer encore, seulement « Later ». */
const CATEGORIE_AVANT = 'vethos-avant'

let module: typeof ModuleNotifications | null | undefined
function natif(): typeof ModuleNotifications | null {
  if (module !== undefined) return module
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('expo-notifications') as typeof ModuleNotifications
  } catch {
    module = null
  }
  return module
}

/**
 * Un bouton touché sur une notification, en attente d'être traité par
 * « Je commence » (qui a le plan sous la main) :
 * - `tard` : « Later » → la justification s'ouvre dans Vethos ;
 * - `commencer` : « I'm starting » → la séance démarre, sans ouvrir l'app,
 *   à l'instant `a` où le bouton a été touché.
 */
export type DemandeNotification = { type: 'tard' } | { type: 'commencer'; blocId: string; a: number }

export const useDemandeReport = create<{ demande: DemandeNotification | null; poser: (d: DemandeNotification | null) => void }>((set) => ({
  demande: null,
  poser: (demande) => set({ demande }),
}))

const traitees = new Set<string>()
function recevoir(r: ModuleNotifications.NotificationResponse, enDirect = true) {
  const cle = `${r.notification.request.identifier}|${r.actionIdentifier}|${r.notification.date}`
  if (traitees.has(cle)) return
  traitees.add(cle)
  try {
    natif()?.clearLastNotificationResponse()
  } catch {
    // Rien à effacer.
  }
  const blocId = r.notification.request.content.data?.blocId
  // Relue au lancement : on ne sait pas QUAND le bouton a été touché. Fraîche
  // (iOS vient de réveiller Vethos pour ça), elle compte ; ancienne, on ne
  // démarre rien en douce — l'écran « Je commence » est là.
  const fraiche = enDirect || Date.now() - r.notification.date < 3 * 60_000
  if (r.actionIdentifier === 'commencer' && typeof blocId === 'string' && fraiche) {
    // L'instant du toucher : le travail compte d'ici, ni avant ni après.
    useDemandeReport.getState().poser({ type: 'commencer', blocId, a: Date.now() })
  } else if (r.actionIdentifier === 'tard') {
    useDemandeReport.getState().poser({ type: 'tard' })
  }
}

let ecoute = false
/**
 * Dès le lancement — même quand iOS réveille Vethos en arrière-plan pour un
 * bouton touché —, avant que le plan soit chargé : la réponse attend dans le
 * magasin que « Je commence » puisse la traiter.
 */
export function ecouterReponses(): void {
  const N = natif()
  if (!N || ecoute) return
  ecoute = true
  try {
    N.addNotificationResponseReceivedListener((r) => recevoir(r))
    const derniere = N.getLastNotificationResponse()
    if (derniere) recevoir(derniere, false)
  } catch {
    // Build sans le module natif.
  }
}

let pret = false
/** Une fois : l'affichage au premier plan et les boutons. */
export async function preparerRappels(): Promise<void> {
  const N = natif()
  if (!N || pret) return
  try {
    // Vethos ouvert : « Je commence » est déjà à l'écran, la bannière ferait doublon.
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    })
    // « I'm starting » démarre sans ouvrir l'app ; « Later » s'ouvre dans Vethos,
    // parce qu'il se justifie. « Tomorrow » n'est jamais un bouton.
    const commencer = { identifier: 'commencer', buttonTitle: 'I’m starting', options: { opensAppToForeground: false } }
    const tard = { identifier: 'tard', buttonTitle: 'Later', options: { opensAppToForeground: true } }
    await N.setNotificationCategoryAsync(CATEGORIE, [commencer, tard])
    await N.setNotificationCategoryAsync(CATEGORIE_ANCRE, [commencer])
    await N.setNotificationCategoryAsync(CATEGORIE_AVANT, [tard])
    ecouterReponses()
    pret = true
  } catch {
    // Build sans le module natif : pas de rappels.
  }
}

/**
 * Une notification tout de suite : la séance démarrée depuis une notification
 * se confirme, pour qu'on ne croie jamais avoir commencé quand ce n'est pas le cas.
 */
export async function annoncer(titre: string, corps: string): Promise<void> {
  const N = natif()
  if (!N) return
  try {
    await N.scheduleNotificationAsync({ content: { title: titre, body: corps, sound: 'default' }, trigger: null })
  } catch {
    // Autorisation refusée : rien à dire.
  }
}

/** Demande l'autorisation une fois ; iOS ne la redemande plus ensuite. */
export async function demanderAutorisation(): Promise<boolean> {
  const N = natif()
  if (!N) return false
  try {
    const actuel = await N.getPermissionsAsync()
    if (actuel.granted) return true
    if (!actuel.canAskAgain) return false
    return (await N.requestPermissionsAsync()).granted
  } catch {
    return false
  }
}

/** Remplace tous les rappels programmés par ceux-ci. */
export async function programmerRappels(rappels: readonly Rappel[]): Promise<void> {
  const N = natif()
  if (!N) return
  try {
    await N.cancelAllScheduledNotificationsAsync()
    for (const r of rappels) {
      await N.scheduleNotificationAsync({
        identifier: r.id,
        content: {
          title: r.titre,
          body: r.corps,
          sound: 'default',
          ...(r.avant
            ? r.reportable
              ? { categoryIdentifier: CATEGORIE_AVANT }
              : {}
            : { categoryIdentifier: r.reportable ? CATEGORIE : CATEGORIE_ANCRE }),
          data: { blocId: r.blocId },
        },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(r.quand) },
      })
    }
  } catch {
    // Module absent ou autorisation refusée : rien à programmer.
  }
}
