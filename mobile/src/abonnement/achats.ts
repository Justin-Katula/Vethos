import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { create } from 'zustand'

/**
 * L'abonnement Vethos, par RevenueCat (au-dessus des achats Apple et Google).
 * Une seule chose compte : le droit « pro » est-il actif ? Un essai gratuit
 * en cours compte comme actif.
 *
 * La clé RevenueCat de l'app (`extra.revenuecat.ios` / `.android`) est une clé
 * PUBLIQUE, faite pour vivre dans l'app. Sans elle — ou sur le web — l'état est
 * « indisponible » et rien n'est bloqué : un mur sans caisse enfermerait tout
 * le monde dehors.
 */

export const DROIT = 'pro'

export type Formule = {
  id: string
  type: 'annuel' | 'mensuel'
  /** Le prix tel que le Store l'affiche, dans la devise de l'utilisateur. */
  prix: string
  /** Pour l'annuel : le même prix ramené au mois, dans la même devise. */
  parMois: string | null
  montant: number
  /** Jours d'essai gratuit, si l'utilisateur y a encore droit. */
  essaiJours: number | null
}

type Etat = {
  etat: 'chargement' | 'actif' | 'inactif' | 'indisponible'
  formules: Formule[]
  initialiser: (utilisateur: string) => Promise<void>
  acheter: (id: string) => Promise<'ok' | 'annule' | 'erreur'>
  restaurer: () => Promise<boolean>
}

const cle = (): string | undefined => {
  const r = (Constants.expoConfig?.extra as { revenuecat?: { ios?: string; android?: string } } | undefined)?.revenuecat
  return Platform.OS === 'ios' ? r?.ios : Platform.OS === 'android' ? r?.android : undefined
}

/** Le prix d'un mois, écrit comme le Store écrit ses prix (devise, séparateur). */
function formater(montant: number, devise: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: devise }).format(montant)
  } catch {
    return montant.toFixed(2)
  }
}

type Paquets = Array<{
  identifier: string
  packageType: string
  product: {
    identifier: string
    priceString: string
    price: number
    currencyCode: string
    introPrice: { price: number; periodUnit: string; periodNumberOfUnits: number } | null
  }
}>

let paquets: Paquets = []
const actif = (info: { entitlements: { active: Record<string, unknown> } }) => !!info.entitlements.active[DROIT]

export const useAbonnement = create<Etat>((set, get) => ({
  etat: cle() ? 'chargement' : 'indisponible',
  formules: [],

  async initialiser(utilisateur) {
    const k = cle()
    if (!k) return set({ etat: 'indisponible' })
    try {
      const { default: Purchases, INTRO_ELIGIBILITY_STATUS } = await import('react-native-purchases')
      // L'abonné RevenueCat EST le compte Vethos : l'abonnement suit la
      // personne d'un téléphone à l'autre, pas l'appareil.
      if (await Purchases.isConfigured()) await Purchases.logIn(utilisateur)
      else Purchases.configure({ apiKey: k, appUserID: utilisateur })
      Purchases.addCustomerInfoUpdateListener((info) => set({ etat: actif(info) ? 'actif' : 'inactif' }))

      const [info, offres] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()])
      paquets = (offres.current?.availablePackages ?? []) as unknown as Paquets
      // L'essai ne s'affiche qu'à qui y a encore droit : Apple le refuse à qui l'a déjà eu.
      const eligibles =
        Platform.OS === 'ios'
          ? await Purchases.checkTrialOrIntroductoryPriceEligibility(paquets.map((p) => p.product.identifier))
          : {}
      const formules: Formule[] = paquets
        .filter((p) => p.packageType === 'ANNUAL' || p.packageType === 'MONTHLY')
        .map((p) => {
          const intro = p.product.introPrice
          const essai = intro && intro.price === 0 && intro.periodUnit === 'DAY' ? intro.periodNumberOfUnits
            : intro && intro.price === 0 && intro.periodUnit === 'WEEK' ? intro.periodNumberOfUnits * 7 : null
          const eligible = Platform.OS !== 'ios' || (eligibles as Record<string, { status: number }>)[p.product.identifier]?.status ===
              INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
          const annuel = p.packageType === 'ANNUAL'
          return {
            id: p.identifier,
            type: annuel ? 'annuel' : 'mensuel',
            prix: p.product.priceString,
            parMois: annuel ? formater(Math.floor((p.product.price / 12) * 100) / 100, p.product.currencyCode) : null,
            montant: p.product.price,
            essaiJours: essai && eligible ? essai : null,
          } satisfies Formule
        })
        .sort((a, b) => (a.type === b.type ? 0 : a.type === 'annuel' ? -1 : 1))
      set({ formules, etat: actif(info) ? 'actif' : 'inactif' })
    } catch {
      // Le Store injoignable ne ferme pas l'app de quelqu'un qui a peut-être payé :
      // on retentera au prochain lancement.
      if (get().etat === 'chargement') set({ etat: 'indisponible' })
    }
  },

  async acheter(id) {
    const p = paquets.find((x) => x.identifier === id)
    if (!p) return 'erreur'
    try {
      const { default: Purchases } = await import('react-native-purchases')
      const { customerInfo } = await Purchases.purchasePackage(p as never)
      set({ etat: actif(customerInfo) ? 'actif' : 'inactif' })
      return 'ok'
    } catch (e) {
      return (e as { userCancelled?: boolean }).userCancelled ? 'annule' : 'erreur'
    }
  },

  async restaurer() {
    try {
      const { default: Purchases } = await import('react-native-purchases')
      const info = await Purchases.restorePurchases()
      set({ etat: actif(info) ? 'actif' : 'inactif' })
      return actif(info)
    } catch {
      return false
    }
  },
}))

/** L'économie de l'annuel sur douze mois de mensuel, en pour cent entier. */
export function economie(formules: readonly Formule[]): number | null {
  const a = formules.find((f) => f.type === 'annuel')
  const m = formules.find((f) => f.type === 'mensuel')
  if (!a || !m || m.montant <= 0) return null
  return Math.round((1 - a.montant / (m.montant * 12)) * 100)
}
