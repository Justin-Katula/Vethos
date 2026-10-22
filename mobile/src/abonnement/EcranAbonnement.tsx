import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useReduit } from '@/accueil/briques-introduction'
import { FondLumiere } from '@/ui/FondLumiere'
import { A, GEIST, MONO, SORTIE, useLumiere } from '@/ui/app-briques'
import { deconnecter } from '@/compte/compte'
import { economie, useAbonnement, type Formule } from './achats'

/** Les conditions d'Apple (EULA standard) et la politique de confidentialité de Vethos. */
const CONDITIONS = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const confidentialite = () =>
  (Constants.expoConfig?.extra as { liens?: { confidentialite?: string } } | undefined)?.liens?.confidentialite

function Ligne({ f, choisie, badge, onPress }: { f: Formule; choisie: boolean; badge: string | null; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: choisie }}
      accessibilityLabel={`${f.type === 'annuel' ? 'Yearly' : 'Monthly'}, ${f.prix}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 68,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: choisie ? A.t1 : 'transparent',
        backgroundColor: choisie ? 'rgba(242,242,242,0.09)' : 'transparent',
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 1.5,
          borderColor: choisie ? A.t1 : A.t4,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {choisie ? <View style={{ width: 11, height: 11, borderRadius: 5.5, backgroundColor: A.t1 }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 17 }}>{f.type === 'annuel' ? 'Yearly' : 'Monthly'}</Text>
          {badge ? (
            <View style={{ backgroundColor: A.rouge, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ color: '#fff', fontFamily: GEIST.demi, fontSize: 11 }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {f.parMois ? <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12 }}>{`${f.parMois} / month`}</Text> : null}
      </View>
      <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 16, fontVariant: ['tabular-nums'] }}>
        {`${f.prix}${f.type === 'annuel' ? ' / year' : ' / month'}`}
      </Text>
    </Pressable>
  )
}

/** Monte de 14 pt en apparaissant ; avec Réduire les animations, apparaît seulement. */
function useEntree(n: number, reduit: boolean) {
  const v = useRef(Array.from({ length: n }, () => new Animated.Value(0))).current
  useEffect(() => {
    Animated.stagger(
      70,
      v.map((x) => Animated.timing(x, { toValue: 1, duration: reduit ? 200 : 520, easing: SORTIE, useNativeDriver: true })),
    ).start()
  }, [v, reduit])
  return (k: number) => {
    const x = v[k] as Animated.Value
    return { opacity: x, transform: [{ translateY: reduit ? 0 : x.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }
  }
}

/**
 * Le mur : après la connexion, sans abonnement ni essai, l'app reste fermée.
 * Les prix viennent du Store, jamais d'ici. Ce qu'Apple exige est là : prix,
 * durée, conditions de l'essai, restaurer, conditions, confidentialité.
 * La lueur de l'heure est celle de l'app : on est déjà chez Vethos.
 */
export function EcranAbonnement() {
  const marges = useSafeAreaInsets()
  const { lueur } = useLumiere(true)
  const reduit = useReduit()
  const { formules, acheter, restaurer, reessayer } = useAbonnement()
  const [choix, setChoix] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const entree = useEntree(3, reduit)

  // L'annuel d'abord : c'est lui qui porte l'essai.
  const f = formules.find((x) => x.id === choix) ?? formules.find((x) => x.type === 'annuel') ?? formules[0]
  const eco = economie(formules)
  const lien = confidentialite()

  const payer = async () => {
    if (!f || occupe) return
    setOccupe(true)
    setMessage(null)
    const r = await acheter(f.id)
    setOccupe(false)
    if (r === 'erreur') setMessage('Purchase didn’t go through.')
  }

  const lienBas = { color: A.t2, fontFamily: GEIST.moyen, fontSize: 12 } as const

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: 100 }]}>
      <FondLumiere lueur={lueur} reduit={reduit} />

      <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: marges.top }, entree(0)]}>
        <Image source={require('../../assets/vethos-logo-argent.png')} accessibilityLabel="Vethos" style={{ width: 120, height: 120 }} resizeMode="contain" />

        <Text
          accessibilityRole="header"
          style={{ marginTop: 28, color: A.t1, fontFamily: GEIST.demi, fontSize: 36, lineHeight: 42, letterSpacing: -1.1, textAlign: 'center' }}
        >
          Vethos Pro
        </Text>

        <View style={{ height: 40, marginTop: 14, justifyContent: 'center' }}>
          {f?.essaiJours ? (
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(242,242,242,0.16)',
                backgroundColor: 'rgba(242,242,242,0.06)',
                paddingHorizontal: 14,
                paddingVertical: 7,
              }}
            >
              <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 13, letterSpacing: 0.4 }}>{`${f.essaiJours} days free`}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      <View style={{ paddingHorizontal: 16, paddingBottom: marges.bottom + 12, gap: 12 }}>
        <Animated.View
          style={[
            {
              borderRadius: 20,
              borderWidth: 1,
              borderColor: 'rgba(242,242,242,0.08)',
              backgroundColor: 'rgba(12,12,12,0.72)',
              padding: 6,
              gap: 4,
            },
            entree(1),
          ]}
        >
          {formules.map((x) => (
            <Ligne
              key={x.id}
              f={x}
              choisie={x.id === f?.id}
              badge={x.type === 'annuel' && eco && eco > 0 ? `−${eco}%` : null}
              onPress={() => setChoix(x.id)}
            />
          ))}
        </Animated.View>

        <Animated.View style={[{ gap: 10 }, entree(2)]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: occupe }}
            disabled={occupe}
            onPress={() => {
              // Aucune formule reçue du Store : le bouton redemande au lieu de rester éteint.
              if (!f) {
                setOccupe(true)
                void reessayer().finally(() => setOccupe(false))
                return
              }
              void payer()
            }}
            style={({ pressed }) => ({
              height: 56,
              borderRadius: 16,
              backgroundColor: A.t1,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: occupe ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.975 : 1 }],
            })}
          >
            <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 17 }}>
              {!f ? 'Try again' : f.essaiJours ? `Start ${f.essaiJours} days free` : 'Subscribe'}
            </Text>
          </Pressable>

          {f ? (
            <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 }}>
              {f.essaiJours
                ? `Free for ${f.essaiJours} days, then ${f.prix} per ${f.type === 'annuel' ? 'year' : 'month'}. Renews automatically. Cancel anytime in Settings.`
                : `${f.prix} per ${f.type === 'annuel' ? 'year' : 'month'}. Renews automatically. Cancel anytime in Settings.`}
            </Text>
          ) : null}
          {message ? <Text style={{ color: A.rouge, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>{message}</Text> : null}

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22 }}>
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                setMessage(null)
                if (!(await restaurer())) setMessage('No subscription found.')
              }}
              hitSlop={12}
            >
              <Text style={lienBas}>Restore</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(CONDITIONS)} hitSlop={12}>
              <Text style={lienBas}>Terms</Text>
            </Pressable>
            {lien ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(lien)} hitSlop={12}>
                <Text style={lienBas}>Privacy</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => void deconnecter()} hitSlop={12}>
              <Text style={lienBas}>Sign out</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  )
}
