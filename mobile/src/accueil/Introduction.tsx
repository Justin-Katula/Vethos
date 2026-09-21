import { useEffect, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { Chevron } from '@/ui/icones'
import { BoutonIris, GEIST, MONO } from '@/ui/primitives'

/**
 * Le premier lancement — les mêmes trois étapes que le bureau.
 *
 * Bienvenue, ton prénom, c'est parti. Pas une de plus : tout ce qu'on
 * demanderait ici — le sommeil, les cours, un premier objectif — se déclare
 * mieux dans l'écran qui lui appartient, avec le calcul sous les yeux. Un
 * questionnaire d'installation qui pose dix questions hors contexte produit
 * dix réponses approximatives qu'on ne corrigera jamais.
 *
 * L'écran de fin ne lance pas de confettis. Le tableau d'une gare n'en lance
 * pas quand un train part : il affiche la ligne, et la ligne s'allume.
 */

type Etape = 'bienvenue' | 'prenom' | 'fini'
const VISIBLES: Etape[] = ['bienvenue', 'prenom']

export function Introduction() {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const { reglages, majReglages, chargees } = useDonnees()
  const [etape, setEtape] = useState<Etape>('bienvenue')

  // L'écran de fin se referme tout seul. Un bouton « Terminer » sur une page
  // qui ne dit que « c'est fait » demande un geste pour rien.
  useEffect(() => {
    if (etape !== 'fini') return
    const t = setTimeout(() => void majReglages({ introductionFaite: true }), 2600)
    return () => clearTimeout(t)
  }, [etape, majReglages])

  if (!chargees || reglages.introductionFaite) return null

  const rang = VISIBLES.indexOf(etape)
  const derniere = rang === VISIBLES.length - 1

  return (
    <Modal visible animationType="fade" onRequestClose={() => undefined}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: j.bg }}
      >
        <View style={{ flex: 1, paddingTop: marges.top, paddingBottom: marges.bottom + PAS[6] }}>
          {etape !== 'fini' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: PAS[3],
                paddingHorizontal: PAS[5],
                paddingVertical: PAS[4],
                borderBottomWidth: 1,
                borderBottomColor: j.line,
              }}
            >
              <Text style={{ fontFamily: GEIST.demi, fontSize: 11, color: j.text3 }}>
                Configuration
              </Text>
              <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                {VISIBLES.map((e, i) => (
                  <View
                    key={e}
                    style={{ flex: 1, height: 2, backgroundColor: i <= rang ? j.accent : j.line }}
                  />
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void majReglages({ introductionFaite: true })}
                hitSlop={10}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, minHeight: 44, justifyContent: 'center' })}
              >
                <Text style={{ fontFamily: GEIST.moyen, fontSize: 12.5, color: j.text3 }}>Passer</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: PAS[6] }}>
            {etape === 'bienvenue' ? <Bienvenue /> : null}
            {etape === 'prenom' ? <Prenom /> : null}
            {etape === 'fini' ? <Fini /> : null}
          </View>

          {etape !== 'fini' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: PAS[3],
                paddingHorizontal: PAS[5],
                paddingTop: PAS[4],
                borderTopWidth: 1,
                borderTopColor: j.line,
              }}
            >
              {rang > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setEtape(VISIBLES[rang - 1]!)}
                  style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
                >
                  <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: j.text2 }}>Retour</Text>
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }} />
              <BoutonIris onPress={() => setEtape(derniere ? 'fini' : VISIBLES[rang + 1]!)}>
                {derniere ? 'Terminer' : 'Commencer'}
              </BoutonIris>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Bienvenue() {
  const j = useJetons()
  return (
    <View style={{ alignItems: 'center', gap: PAS[6] }}>
      <Image
        source={require('../../assets/vethos-logo.png')}
        style={{ width: 104, height: 104, resizeMode: 'contain' }}
        accessibilityLabel="Vethos"
      />
      <View
        style={{
          borderWidth: 1,
          borderColor: j.line,
          borderRadius: RAYON.sm,
          paddingHorizontal: PAS[3],
          paddingVertical: 5,
        }}
      >
        <Text style={{ fontFamily: GEIST.demi, fontSize: 10, color: j.text3 }}>
          Premier lancement
        </Text>
      </View>
      <View style={{ gap: PAS[3] }}>
        <Text
          style={{
            fontFamily: GEIST.demi,
            fontSize: 34,
            lineHeight: 40,
            letterSpacing: -0.9,
            color: j.text,
            textAlign: 'center',
          }}
        >
          Bienvenue dans Vethos.
        </Text>
        <Text
          style={{
            fontFamily: GEIST.normal,
            fontSize: 15,
            lineHeight: 23,
            color: j.text2,
            textAlign: 'center',
          }}
        >
          En quelques minutes, tu poses ton emploi du temps, tes engagements protégés et ton
          premier objectif.
        </Text>
      </View>
    </View>
  )
}

function Prenom() {
  const j = useJetons()
  const { reglages, majReglages } = useDonnees()
  const [nom, setNom] = useState(reglages.prenom)

  // Enregistré en différé : une écriture par frappe userait la mémoire du
  // téléphone pour rien, et la valeur ne sert qu'à la sortie de l'écran.
  useEffect(() => {
    if (nom === reglages.prenom) return
    const t = setTimeout(() => void majReglages({ prenom: nom.trim() }), 400)
    return () => clearTimeout(t)
  }, [nom, reglages.prenom, majReglages])

  const propre = nom.trim()

  return (
    <View style={{ alignItems: 'center', gap: PAS[6] }}>
      <View style={{ gap: PAS[2] }}>
        <Text
          style={{
            fontFamily: GEIST.demi,
            fontSize: 26,
            letterSpacing: -0.6,
            color: j.text,
            textAlign: 'center',
          }}
        >
          {propre ? `Bienvenue, ${propre}.` : 'Comment tu t’appelles ?'}
        </Text>
        <Text
          style={{ fontFamily: GEIST.normal, fontSize: 13.5, color: j.text2, textAlign: 'center' }}
        >
          Ton prénom apparaît dans l’interface. Tu peux le laisser vide.
        </Text>
      </View>

      <TextInput
        autoFocus
        value={nom}
        onChangeText={setNom}
        placeholder="Alex"
        placeholderTextColor={j.text3}
        maxLength={40}
        accessibilityLabel="Ton prénom"
        style={{
          alignSelf: 'stretch',
          backgroundColor: j.champBg,
          borderWidth: 1,
          borderColor: j.lineForte,
          borderRadius: RAYON.md,
          paddingHorizontal: PAS[5],
          paddingVertical: PAS[4],
          textAlign: 'center',
          fontFamily: GEIST.demi,
          fontSize: 22,
          color: j.text,
        }}
      />
    </View>
  )
}

function Fini() {
  const j = useJetons()
  return (
    <View style={{ gap: PAS[5] }}>
      <View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottomWidth: 1,
            borderBottomColor: j.line,
            paddingBottom: PAS[3],
          }}
        >
          <Text style={{ fontFamily: MONO.normal, fontSize: 13, color: j.text3 }}>Départ</Text>
          <Text style={{ fontFamily: MONO.normal, fontSize: 13, color: j.accentEncre }}>
            à l’heure
          </Text>
        </View>
        {/* La seule chose qui bouge. Elle dit que le réglage est fait, pas
            qu'il faut applaudir. */}
        <View style={{ height: 2, backgroundColor: j.accent }} />
      </View>

      <Text style={{ fontFamily: GEIST.moyen, fontSize: 26, letterSpacing: -0.6, color: j.text }}>
        Le tableau est en service.
      </Text>
      <Text style={{ fontFamily: GEIST.normal, fontSize: 15, lineHeight: 23, color: j.text2 }}>
        Déclare ton temps une fois dans « Mon temps ». À partir de là, l’application place le
        travail elle-même et ne te demande plus rien.
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[2] }}>
        <Text style={{ fontFamily: GEIST.normal, fontSize: 12.5, color: j.text3 }}>
          Ouverture de l’application
        </Text>
        <Chevron couleur={j.text3} taille={12} />
      </View>
    </View>
  )
}
