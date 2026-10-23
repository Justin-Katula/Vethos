import { useState } from 'react'
import { Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { A, Carte, GEIST, Plus } from '@/ui/app-briques'
import { idAjout, selectionEstVide, type Selection } from './contrat'
import { useBlocage } from './etat'
import { SelecteurApplications, type RoleSelecteur } from './SelecteurApplications'
import { ApercuSelection } from './ApercuSelection'
import { jetons, vueJetons } from '../../modules/vethos-jetons'

/**
 * Une liste de blocage, à la Opal : ce qu'elle contient (icônes et noms
 * dessinés par iOS), un « × » par élément, un « + ». Le « + » ouvre le
 * sélecteur d'Apple VIDE : on n'y fait qu'ajouter. Pendant une séance, rien ne
 * se modifie.
 */
const Vue = vueJetons()

export function ListeBlocage({
  role,
  titre,
  sous,
  selection,
  verrou,
  pret,
  pleineHauteur = false,
}: {
  role: Exclude<RoleSelecteur, 'urgence'>
  titre: string
  sous?: string
  selection: Selection | null
  /** Toute la hauteur de l'écran : la liste défile au lieu d'être une petite boîte. */
  pleineHauteur?: boolean
  /** Une séance est en cours : ni ajout, ni retrait. */
  verrou: boolean
  /** Temps d'écran est autorisé. */
  pret: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const poser = useBlocage((e) => (role === 'garde' ? e.poserGardee : role === 'jamais' ? e.poserJamais : e.poserSelection))
  const total = selection ? selection.nbApplications + selection.nbCategories + selection.nbSitesWeb : 0
  const vide = !selection || selectionEstVide(selection)

  const ajouter = () => {
    if (verrou || !pret) return
    if (selection) jetons.vider(idAjout(selection.identifiant))
    setOuvert(true)
  }

  // Un « × » touché dans la vue native : la liste a changé sur l'appareil, on range les nouveaux comptes.
  const retire = (c: { applicationCount: number; categoryCount: number; webDomainCount: number }) => {
    if (!selection) return
    void poser({ ...selection, nbApplications: c.applicationCount, nbCategories: c.categoryCount, nbSitesWeb: c.webDomainCount })
  }

  // La ligne d'iOS (icône + nom) est plus haute que le texte : 1,9 × la police.
  const { height: hauteurEcran } = useWindowDimensions()
  const marges = useSafeAreaInsets()
  const naturelle = Math.max(0, total * Math.round(16 * 1.9) + (total - 1) * 12)
  const hauteur = pleineHauteur ? Math.min(naturelle, Math.max(200, hauteurEcran - marges.top - 300)) : naturelle

  return (
    <Carte style={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>{titre}</Text>
            <Text style={{ color: A.t4, fontFamily: GEIST.moyen, fontSize: 15 }}>{total}</Text>
          </View>
          {sous ? <Text style={{ marginTop: 2, color: A.t3, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{sous}</Text> : null}
        </View>
        {pret && !verrou ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add to ${titre}`}
            onPress={ajouter}
            style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: A.s, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }] })}
          >
            <Plus taille={13} />
          </Pressable>
        ) : null}
      </View>

      {!vide && selection ? (
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: A.ligne }}>
          {Vue ? (
            <Vue
              selectionId={selection.identifiant}
              version={selection.nbCategories * 10_000 + selection.nbApplications * 100 + selection.nbSitesWeb}
              couleur={A.t1}
              taillePolice={16}
              modifiable={!verrou}
              onRetrait={(e) => retire(e.nativeEvent)}
              style={{ width: '100%', height: hauteur }}
            />
          ) : (
            <ApercuSelection selection={selection} couleur={A.t1} />
          )}
        </View>
      ) : null}

      {verrou ? <Text style={{ marginTop: 12, color: A.t4, fontFamily: GEIST.moyen, fontSize: 12 }}>Locked during a session</Text> : null}

      <SelecteurApplications ouvert={ouvert} surFermeture={() => setOuvert(false)} role={role} ajout />
    </Carte>
  )
}
