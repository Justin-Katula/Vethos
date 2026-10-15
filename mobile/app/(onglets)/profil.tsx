import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { A, Carte, Chevron, GEIST, MONO, useToast } from '@/ui/app-briques'
import { effectiveContract, requestModeChange, signContract, type Mode } from '@shared/contract'
import { usePlan } from '@/plan/Plan'
import { coach } from '@/coach/client'
import { CarteCompte } from '@/compte/CarteCompte'
import { gererAbonnement, useAbonnement } from '@/abonnement/achats'
import { useRetrait } from '@/engagements/useRetrait'
import { minutesRestantes } from '@/engagements/retrait'

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
  const contrat = reglages.contrat ? effectiveContract(reglages.contrat, maintenant) : null
  const choisirMode = (m: Mode) => {
    if (!contrat) {
      void majReglages({ contrat: signContract(m, new Date()) })
      return
    }
    const r = requestModeChange(contrat, m, new Date(), !!seanceActive)
    if (!r.ok) {
      if (r.reason === 'during-block') toast('Not during a block.')
      return
    }
    void majReglages({ contrat: r.contract })
  }
  const effetLe = contrat?.pending ? new Date(contrat.pending.effectiveAt) : null
  // Les demandes de retrait : une heure ici, puis elles disparaissent.
  const retrait = useRetrait()
  const abonne = useAbonnement((e) => e.etat === 'actif')
  const NATURE = { TASK: 'Task', GOAL: 'Goal', ANCHOR: 'Anchor' } as const
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

      {retrait.demandes.length ? (
        <Carte style={{ marginTop: 12, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>Removal requests</Text>
          {retrait.demandes.map((x) => (
            <View key={x.id} style={{ marginTop: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: A.ligne, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <Text numberOfLines={1} style={{ flexShrink: 1, color: A.t1, fontFamily: GEIST.demi, fontSize: 16 }}>{x.nom}</Text>
                <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12 }}>{`${NATURE[x.nature]} · ${minutesRestantes(x, maintenant.getTime())} min left`}</Text>
              </View>
              <Text numberOfLines={2} style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{`“${x.texte}”`}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void retrait.oublier(x.id)}
                  style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 10, backgroundColor: 'rgba(242,242,242,0.1)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 14 }}>Keep</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void retrait.retirer(x)}
                  style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 10, backgroundColor: 'rgba(240,82,95,0.16)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ color: A.rouge, fontFamily: GEIST.demi, fontSize: 14 }}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Carte>
      ) : null}

      <Carte style={{ marginTop: 12, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>Contract</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {(['ally', 'sergeant'] as const).map((m) => {
            const actuel = (contrat?.pending?.mode ?? contrat?.mode) === m
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected: actuel }}
                onPress={() => choisirMode(m)}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: actuel ? 'rgba(242,242,242,0.14)' : 'rgba(242,242,242,0.05)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Text style={{ color: actuel ? A.t1 : A.t3, fontFamily: GEIST.demi, fontSize: 15 }}>{m === 'ally' ? 'Ally' : 'Sergeant'}</Text>
              </Pressable>
            )
          })}
        </View>
        {contrat ? (
          <Text style={{ marginTop: 10, color: A.t3, fontFamily: MONO.normal, fontSize: 12 }}>
            {effetLe
              ? `From ${effetLe.getDate()} ${MOIS[effetLe.getMonth()]!.slice(0, 3)}, ${String(effetLe.getHours()).padStart(2, '0')}:${String(effetLe.getMinutes()).padStart(2, '0')}`
              : `Signed ${new Date(contrat.signedAt).getDate()} ${MOIS[new Date(contrat.signedAt).getMonth()]!.slice(0, 3)}`}
          </Text>
        ) : null}
      </Carte>

      {/* Le Coach n'a pas d'entrée à lui : il ne sert qu'aux moments de justification (Stop, Later). */}
      {coach().disponible ? (
        // L'accord pour que l'IA examine les demandes de Stop et de Later — changeable à tout moment.
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: reglages.consentementIA === 'oui' }}
          onPress={() => void majReglages({ consentementIA: reglages.consentementIA === 'oui' ? 'non' : 'oui' })}
          style={({ pressed }) => ({ marginTop: 12, transform: [{ scale: pressed ? 0.985 : 1 }] })}
        >
          <Carte style={{ paddingVertical: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>AI review</Text>
              <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>Reviews your justifications</Text>
            </View>
            <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: reglages.consentementIA === 'oui' ? A.t1 : 'rgba(242,242,242,0.16)', alignItems: reglages.consentementIA === 'oui' ? 'flex-end' : 'flex-start' }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: reglages.consentementIA === 'oui' ? '#000' : A.t2 }} />
            </View>
          </Carte>
        </Pressable>
      ) : null}
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
    </ScrollView>
  )
}
