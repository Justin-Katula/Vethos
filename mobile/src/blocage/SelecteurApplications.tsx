import { useState } from 'react'
import { Modal, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBlocage } from './etat'
import { IDENTIFIANT_GARDEE, IDENTIFIANT_SELECTION, IDENTIFIANT_URGENCE, type Selection } from './contrat'
import { pontEcran } from './ecran-natif'
import { useJetons } from '@/theme/Theme'
import { PAS } from '@/theme/jetons'
import { BoutonPlat, Texte } from '@/ui/primitives'

/**
 * Le sélecteur d'Apple.
 *
 * **Ce n'est pas une fonction, c'est une VUE.** `FamilyActivityPicker` doit être
 * montée à l'écran ; il n'existe aucun appel qui ouvre une liste et rend un
 * résultat. C'est pour ça que le pont natif ne peut pas, à lui seul, faire
 * choisir quoi que ce soit — et pourquoi ce composant existe.
 *
 * Ce qui en ressort n'est jamais une liste d'applications : Apple rend des
 * NOMBRES, et un jeton opaque qu'il garde. Vethos ne sait donc pas, et ne saura
 * jamais, ce que son utilisateur a écarté. Ce n'est pas une promesse de notre
 * part — c'est une garantie du système, et elle est plus solide que n'importe
 * quelle promesse.
 *
 * La version persistée (`…Persisted`) est celle qu'il faut : elle range la
 * sélection sous un identifiant qu'iOS conserve, et c'est cet identifiant —
 * jamais le jeton — que Vethos manipule pour lever un bouclier.
 */

type Comptes = {
  applicationCount: number
  categoryCount: number
  webDomainCount: number
}

/** La vue native, chargée paresseusement : elle n'existe que sur iOS 16+. */
function chargerFeuille(): React.ComponentType<Record<string, unknown>> | null {
  if (Platform.OS !== 'ios' || !pontEcran().estReel) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const natif = require('react-native-device-activity') as typeof import('react-native-device-activity')
    return natif.DeviceActivitySelectionSheetViewPersisted as unknown as React.ComponentType<
      Record<string, unknown>
    >
  } catch {
    return null
  }
}

/**
 * Les deux listes, et pourquoi elles passent par le même sélecteur.
 *
 * `ecarte` : ce qu'une séance masque. `garde` : ce qu'une séance PROFONDE
 * laisse passer quand tout le reste est masqué. Même feuille d'Apple, même
 * ignorance de notre côté — seul l'identifiant sous lequel iOS range le jeton
 * change, et c'est lui seul que Vethos manipule.
 */
export type RoleSelecteur = 'ecarte' | 'garde' | 'urgence'

const TEXTES: Record<RoleSelecteur, { identifiant: string; entete: string; pied: string }> = {
  ecarte: {
    identifiant: IDENTIFIANT_SELECTION,
    entete: 'What Vethos sets aside during a session',
    pied: 'Vethos only sees the count. Not the names, not the icons.',
  },
  garde: {
    identifiant: IDENTIFIANT_GARDEE,
    entete: 'What stays reachable in deep focus',
    pied: 'Everything else is set aside. Keep Vethos itself here, or you will have to lift from iOS Settings.',
  },
  urgence: {
    identifiant: IDENTIFIANT_URGENCE,
    entete: 'Up to 3 apps',
    pied: '',
  },
}

export function SelecteurApplications({ ouvert, surFermeture, role = 'ecarte', surChoix }: {
  ouvert: boolean
  surFermeture: () => void
  role?: RoleSelecteur
  /** Pour l'urgence : le choix revient à l'appelant, il n'est pas rangé. */
  surChoix?: (s: Selection) => void
}) {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const poserSelection = useBlocage((e) => e.poserSelection)
  const poserGardee = useBlocage((e) => e.poserGardee)
  const [comptes, setComptes] = useState<Comptes | null>(null)

  const textes = TEXTES[role]
  const Feuille = chargerFeuille()
  if (!ouvert) return null

  const enregistrer = async () => {
    // Rien de choisi : on referme sans toucher à la sélection précédente.
    // L'effacer parce que l'utilisateur a hésité serait une punition.
    if (comptes && surChoix) {
      surChoix({
        identifiant: textes.identifiant,
        nbApplications: comptes.applicationCount,
        nbCategories: comptes.categoryCount,
        nbSitesWeb: comptes.webDomainCount,
        libelle: '',
        creeeLe: new Date().toISOString(),
      })
    } else if (comptes) {
      const poser = role === 'garde' ? poserGardee : poserSelection
      await poser({
        identifiant: textes.identifiant,
        nbApplications: comptes.applicationCount,
        nbCategories: comptes.categoryCount,
        nbSitesWeb: comptes.webDomainCount,
        libelle:
          role === 'garde' ? 'What I keep in deep focus' : 'What I set aside during a session',
        creeeLe: new Date().toISOString(),
      })
    }
    surFermeture()
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={surFermeture}>
      <View style={{ flex: 1, backgroundColor: j.bg, paddingTop: marges.top }}>
        {Feuille ? (
          <Feuille
            style={{ flex: 1 }}
            familyActivitySelectionId={textes.identifiant}
            // Sans ce drapeau, une CATÉGORIE cochée dans la liste gardée est
            // ignorée : le mode profond masquerait alors tout ce que
            // l'utilisateur croyait s'être gardé, sans un mot pour le dire.
            includeEntireCategory={role === 'garde'}
            headerText={textes.entete}
            footerText={textes.pied}
            onSelectionChange={(e: { nativeEvent: Comptes }) => setComptes(e.nativeEvent)}
            onDismissRequest={() => void enregistrer()}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: PAS[6], gap: PAS[4] }}>
            <Texte ton="doux">
              Apple’s picker only exists on an iPhone, in a build signed with the Family
              Controls entitlement. Here, the selection is simulated.
            </Texte>
            <BoutonPlat
              onPress={() => {
                // Le simulateur : trois apps, pour que le parcours se regarde.
                if (surChoix) surChoix({ identifiant: textes.identifiant, nbApplications: 3, nbCategories: 0, nbSitesWeb: 0, libelle: '', creeeLe: new Date().toISOString() })
                surFermeture()
              }}
            >
              {surChoix ? 'Choose 3 apps' : 'Close'}
            </BoutonPlat>
          </View>
        )}
      </View>
    </Modal>
  )
}
