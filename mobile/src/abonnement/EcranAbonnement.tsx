import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { A, GEIST, MONO, SORTIE } from '@/ui/app-briques'
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
        minHeight: 64,
        borderRadius: 10,
        borderWidth: choisie ? 1.5 : 1,
        borderColor: choisie ? A.t1 : A.s,
        backgroundColor: choisie ? 'rgba(242,242,242,0.06)' : 'transparent',
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: choisie ? A.t1 : A.t4,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {choisie ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: A.t1 }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 16 }}>{f.type === 'annuel' ? 'Yearly' : 'Monthly'}</Text>
          {badge ? (
            <View style={{ backgroundColor: A.rouge, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
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

/**
 * Le mur : après la connexion, sans abonnement ni essai, l'app reste fermée.
 * Les prix viennent du Store, jamais d'ici. Ce qu'Apple exige est là : prix,
 * durée, conditions de l'essai, restaurer, conditions, confidentialité.
 */
export function EcranAbonnement() {
  const marges = useSafeAreaInsets()
  const { formules, acheter, restaurer } = useAbonnement()
  const [choix, setChoix] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const apparition = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(apparition, { toValue: 1, duration: 420, easing: SORTIE, useNativeDriver: true }).start()
  }, [apparition])

  const f = formules.find((x) => x.id === choix) ?? formules[0]
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

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: apparition, zIndex: 100 }]}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Image source={require('../../assets/vethos-logo.png')} accessibilityLabel="Vethos" style={{ width: 96, height: 96 }} resizeMode="contain" />
        {f?.essaiJours ? (
          <Text accessibilityRole="header" style={{ marginTop: 24, color: A.t1, fontFamily: GEIST.demi, fontSize: 30, lineHeight: 36, letterSpacing: -0.8, textAlign: 'center' }}>
            {`${f.essaiJours} days free.`}
          </Text>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: marges.bottom + 12, gap: 10 }}>
        {formules.map((x) => (
          <Ligne
            key={x.id}
            f={x}
            choisie={x.id === f?.id}
            badge={x.type === 'annuel' && eco && eco > 0 ? `−${eco}%` : null}
            onPress={() => setChoix(x.id)}
          />
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !f || occupe }}
          disabled={!f || occupe}
          onPress={() => void payer()}
          style={({ pressed }) => ({
            marginTop: 6,
            height: 54,
            borderRadius: 10,
            backgroundColor: A.t1,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !f || occupe ? 0.5 : 1,
            transform: [{ scale: pressed ? 0.975 : 1 }],
          })}
        >
          <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 17 }}>
            {f?.essaiJours ? `Start ${f.essaiJours} days free` : 'Subscribe'}
          </Text>
        </Pressable>

        {f ? (
          <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 17, textAlign: 'center' }}>
            {f.essaiJours
              ? `Free for ${f.essaiJours} days, then ${f.prix} per ${f.type === 'annuel' ? 'year' : 'month'}. Renews automatically. Cancel anytime in Settings.`
              : `${f.prix} per ${f.type === 'annuel' ? 'year' : 'month'}. Renews automatically. Cancel anytime in Settings.`}
          </Text>
        ) : null}
        {message ? <Text style={{ color: A.rouge, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>{message}</Text> : null}

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 2 }}>
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              setMessage(null)
              if (!(await restaurer())) setMessage('No subscription found.')
            }}
            hitSlop={10}
          >
            <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 12 }}>Restore</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(CONDITIONS)} hitSlop={10}>
            <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 12 }}>Terms</Text>
          </Pressable>
          {lien ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(lien)} hitSlop={10}>
              <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 12 }}>Privacy</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  )
}
