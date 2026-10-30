import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { A, Carte, Chevron, GEIST, MONO, useToast } from '@/ui/app-briques'
import { usePlan } from '@/plan/Plan'
import { CarteCompte } from '@/compte/CarteCompte'
import { CarteJournal } from '@/journal/CarteJournal'
import { gererAbonnement, useAbonnement } from '@/abonnement/achats'

const MOIS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Le profil : un visage, un prénom, depuis quand. Rien d'autre. */
export default function Profil() {
  const marges = useSafeAreaInsets()
  const { reglages, majReglages, taches, objectifs, ancres } = useDonnees()
  const [nom, setNom] = useState(reglages.prenom)
  const dates = [...taches.map((t) => t.creeeLe), ...objectifs.map((o) => o.creeLe), ...ancres.map((a) => a.creeeLe)]
    .filter(Boolean)
    .sort()
  const depuis = dates[0] ? new Date(dates[0]) : new Date()
  const initiale = (nom.trim()[0] ?? '?').toUpperCase()
  const { seanceActive, maintenant } = usePlan()
  const toast = useToast()
  const abonne = useAbonnement((e) => e.etat === 'actif')
  return (
    <ScrollView contentContainerStyle={{ paddingTop: marges.top + 20, paddingHorizontal: 20, paddingBottom: 120 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate('/')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 28, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
      >
        <Chevron sens="gauche" taille={14} />
        <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 16 }}>Today</Text>
      </Pressable>
      <Text accessibilityRole="header" style={{ marginTop: 8, color: A.t1, fontFamily: GEIST.demi, fontSize: 32, lineHeight: 38, letterSpacing: -0.8 }}>
        Profile
      </Text>
      <Carte style={{ marginTop: 24, paddingTop: 28, paddingHorizontal: 16, paddingBottom: 24, alignItems: 'center' }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#29405f', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#d6e4f7', fontFamily: GEIST.demi, fontSize: 38, letterSpacing: -1 }}>{initiale}</Text>
        </View>
        <TextInput
          value={nom}
          onChangeText={(v) => setNom(v.slice(0, 32))}
          onEndEditing={() => void majReglages({ prenom: nom.trim() })}
          accessibilityLabel="Your first name"
          selectionColor={A.t1}
          style={{ marginTop: 16, width: '100%', textAlign: 'center', color: A.t1, fontFamily: GEIST.demi, fontSize: 24, lineHeight: 30, letterSpacing: -0.5, padding: 0 }}
        />
        <Text style={{ marginTop: 4, color: A.t3, fontFamily: GEIST.normal, fontSize: 14 }}>
          {`On Vethos since ${MOIS[depuis.getMonth()]} ${depuis.getFullYear()}`}
        </Text>
      </Carte>

      {/* Gérer ou annuler l'abonnement : la feuille d'Apple, sans quitter l'app. */}
      {abonne ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void gererAbonnement()}
          style={({ pressed }) => ({ marginTop: 12, transform: [{ scale: pressed ? 0.985 : 1 }] })}
        >
          <Carte style={{ paddingVertical: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>Manage subscription</Text>
            <Chevron sens="droite" taille={14} />
          </Carte>
        </Pressable>
      ) : null}
      <CarteCompte />
      <CarteJournal />
    </ScrollView>
  )
}
