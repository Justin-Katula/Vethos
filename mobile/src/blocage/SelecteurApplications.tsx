import { useState } from 'react'
import { Modal, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBlocage } from './etat'
import { IDENTIFIANT_SELECTION } from './contrat'
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

export function SelecteurApplications({ ouvert, surFermeture }: {
  ouvert: boolean
  surFermeture: () => void
}) {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const poserSelection = useBlocage((e) => e.poserSelection)
  const [comptes, setComptes] = useState<Comptes | null>(null)

  const Feuille = chargerFeuille()
  if (!ouvert) return null

  const enregistrer = async () => {
    // Rien de choisi : on referme sans toucher à la sélection précédente.
    // L'effacer parce que l'utilisateur a hésité serait une punition.
    if (comptes) {
      await poserSelection({
        identifiant: IDENTIFIANT_SELECTION,
        nbApplications: comptes.applicationCount,
        nbCategories: comptes.categoryCount,
        nbSitesWeb: comptes.webDomainCount,
        libelle: 'What I set aside during a session',
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
            familyActivitySelectionId={IDENTIFIANT_SELECTION}
            headerText="What Vethos sets aside during a session"
            footerText="Vethos only sees the count. Not the names, not the icons."
            onSelectionChange={(e: { nativeEvent: Comptes }) => setComptes(e.nativeEvent)}
            onDismissRequest={() => void enregistrer()}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: PAS[6], gap: PAS[4] }}>
            <Texte ton="doux">
              Apple’s picker only exists on an iPhone, in a build signed with the Family
              Controls entitlement. Here, the selection is simulated.
            </Texte>
            <BoutonPlat onPress={surFermeture}>Close</BoutonPlat>
          </View>
        )}
      </View>
    </Modal>
  )
}
