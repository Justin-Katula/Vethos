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

/** « Later » touché sur une notification : la question à ouvrir sur « Je commence ». */
export const useDemandeReport = create<{ demande: 'tard' | null; poser: (d: 'tard' | null) => void }>((set) => ({
  demande: null,
  poser: (demande) => set({ demande }),
}))

let pret = false
/** Une fois : l'affichage au premier plan, les boutons, l'écoute des réponses. */
export async function preparerRappels(): Promise<void> {
  const N = natif()
  if (!N || pret) return
  try {
    // Vethos ouvert : « Je commence » est déjà à l'écran, la bannière ferait doublon.
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    })
    await N.setNotificationCategoryAsync(CATEGORIE, [
      // « Tomorrow » n'est jamais un bouton : il ne vient qu'après « Later », et
      // « Later » se demande avec une raison, dans Vethos.
      { identifier: 'tard', buttonTitle: 'Later', options: { opensAppToForeground: true } },
    ])
    await N.setNotificationCategoryAsync(CATEGORIE_ANCRE, [])
    N.addNotificationResponseReceivedListener((r) => {
      const a = r.actionIdentifier
      if (a === 'tard') useDemandeReport.getState().poser(a)
    })
    pret = true
  } catch {
    // Build sans le module natif : pas de rappels.
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
          categoryIdentifier: r.reportable ? CATEGORIE : CATEGORIE_ANCRE,
          data: { blocId: r.blocId },
        },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(r.quand) },
      })
    }
  } catch {
    // Module absent ou autorisation refusée : rien à programmer.
  }
}
