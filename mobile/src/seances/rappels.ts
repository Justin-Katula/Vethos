import { create } from 'zustand'
import type * as ModuleNotifications from 'expo-notifications'
import type { Rappel } from './rappels-plan'
import { noter } from '@/journal/journal'

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
export type DemandeNotification = { type: 'tard' } | { type: 'commencer'; blocId: string; refId?: string; a: number }

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
  const refId = r.notification.request.content.data?.refId
  // Relue au lancement : on ne sait pas QUAND le bouton a été touché. Fraîche
  // (iOS vient de réveiller Vethos pour ça), elle compte ; ancienne, on ne
  // démarre rien en douce — l'écran « Je commence » est là.
  const fraiche = enDirect || Date.now() - r.notification.date < 3 * 60_000
  const titre = r.notification.request.content.title ?? ''
  noter(
    'Notification',
    r.actionIdentifier === 'commencer'
      ? `“I’m starting” tapped on “${titre}”${fraiche ? '' : ' (too old, ignored)'}`
      : r.actionIdentifier === 'tard'
        ? `“Later” tapped on “${titre}”`
        : `Opened “${titre}”`,
  )
  if (r.actionIdentifier === 'commencer' && typeof blocId === 'string' && fraiche) {
    // L'instant du toucher : le travail compte d'ici, ni avant ni après.
    useDemandeReport.getState().poser({ type: 'commencer', blocId, ...(typeof refId === 'string' ? { refId } : {}), a: Date.now() })
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

/**
 * Fait correspondre les rappels programmés à ceux-ci.
 *
 * Une écriture à la fois, et seule la dernière demande compte : deux
 * programmations entremêlées (la minute qui change pendant qu'on écrit)
 * effaçaient les rappels de l'autre, ou les doublaient.
 */
let fileRappels: Promise<void> = Promise.resolve()
let derniereDemande = 0
export function programmerRappels(rappels: readonly Rappel[]): Promise<void> {
  const n = ++derniereDemande
  fileRappels = fileRappels.then(() => (n === derniereDemande ? ecrireRappels(rappels) : undefined))
  return fileRappels
}

/** Une empreinte courte : le même rappel (heure, texte, boutons) garde le même identifiant. */
function empreinte(texte: string): string {
  let h = 5381
  for (let i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * On ne touche qu'à ce qui change : les rappels déjà en place restent, les
 * périmés partent, les nouveaux arrivent — les plus proches d'abord. Tout
 * effacer puis tout reposer laissait iOS sans rappels si Vethos était fermé
 * au milieu de l'écriture.
 */
async function ecrireRappels(rappels: readonly Rappel[]): Promise<void> {
  const N = natif()
  if (!N) return
  try {
    const voulus = rappels.map((r) => {
      const categorie = r.avant ? (r.reportable ? CATEGORIE_AVANT : undefined) : r.reportable ? CATEGORIE : CATEGORIE_ANCRE
      return { r, categorie, id: `${r.id}|${empreinte(`${r.quand}|${r.titre}|${r.corps}|${categorie ?? ''}|${r.refId}`)}` }
    })
    const ids = new Set(voulus.map((v) => v.id))
    const enPlace = (await N.getAllScheduledNotificationsAsync()).map((n) => n.identifier)
    const dejaLa = new Set(enPlace)
    const nouveaux = voulus.filter((v) => !dejaLa.has(v.id))
    // Le ménage d'abord (iOS n'en garde que 64 : les nouveaux ne doivent pas
    // être ceux qu'il jette), puis les nouveaux, le plus proche en tête. Les
    // rappels toujours valables ne quittent jamais la file.
    const perimes = enPlace.filter((id) => !ids.has(id))
    for (const id of perimes) await N.cancelScheduledNotificationAsync(id)
    for (const { r, categorie, id } of nouveaux) {
      await N.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: r.titre,
          body: r.corps,
          sound: 'default',
          ...(categorie ? { categoryIdentifier: categorie } : {}),
          data: { blocId: r.blocId, refId: r.refId },
        },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(r.quand) },
      })
    }
    const prochain = rappels[0]
    noter(
      'Reminders',
      (rappels.length === 0 ? 'None scheduled.' : `${rappels.length} scheduled. Next ${new Date(prochain!.quand).toTimeString().slice(0, 5)} “${prochain!.titre}”.`) +
        ` (+${nouveaux.length} new, −${perimes.length} removed)`,
    )
  } catch {
    // Module absent ou autorisation refusée : rien à programmer.
  }
}
