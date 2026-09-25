import { useRef, useState } from 'react'
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import { STOP_REASONS, type StopReason } from '@shared/schemas'
import { RAISONS } from '@shared/planning/arrets'
import { usePlan } from '@/plan/Plan'
import { A, Feuille, GEIST } from '@/ui/app-briques'
import { vibrer } from '@/accueil/briques-introduction'

const pilule = (pressed: boolean) => ({
  height: 32,
  paddingHorizontal: 14,
  borderRadius: 16,
  backgroundColor: 'rgba(242,242,242,0.1)',
  justifyContent: 'center' as const,
  transform: [{ scale: pressed ? 0.95 : 1 }],
})

/**
 * « Stop » pendant une séance (spec moteur 2026-09-25). Une raison en un seul
 * tap — sinon on choisit la réponse la plus rapide et la donnée ment —, un
 * texte optionnel. Le temps de réponse est mesuré : une réponse mécanique
 * pèse moins.
 */
export function ArretSeance({ titre }: { titre: string }) {
  const { arreter } = usePlan()
  const [ouverte, setOuverte] = useState(false)
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const depuis = useRef(0)

  const choisir = async (raison: StopReason) => {
    if (occupe) return
    setOccupe(true)
    vibrer('medium')
    await arreter(raison, texte.trim() || undefined, Date.now() - depuis.current)
    Keyboard.dismiss()
    setOccupe(false)
    setOuverte(false)
    setTexte('')
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          depuis.current = Date.now()
          vibrer('light')
          setOuverte(true)
        }}
        style={({ pressed }) => pilule(pressed)}
      >
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>Stop</Text>
      </Pressable>
      <Feuille ouverte={ouverte} fermer={() => setOuverte(false)} style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}>
          {`Stop ${titre}?`}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {STOP_REASONS.map((r) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              disabled={occupe}
              onPress={() => void choisir(r)}
              style={({ pressed }) => ({
                width: '48.5%',
                minHeight: 52,
                borderRadius: 12,
                backgroundColor: A.s,
                paddingHorizontal: 14,
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{RAISONS[r].libelle}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={texte}
          onChangeText={(v) => setTexte(v.slice(0, 500))}
          placeholder="Anything else? (optional)"
          placeholderTextColor={A.t4}
          accessibilityLabel="Anything else"
          selectionColor={A.t1}
          style={{ marginTop: 12, height: 44, borderRadius: 8, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 14, color: A.t1, fontFamily: GEIST.normal, fontSize: 15 }}
        />
      </Feuille>
    </>
  )
}

/** Le raccourci des habitudes autonomes (phases 3-4) : démarrer sans attendre l'overlay. */
export function DemarrerSeance() {
  const { demarrable, confirmer } = usePlan()
  const [occupe, setOccupe] = useState(false)
  if (!demarrable) return null
  return (
    <Pressable
      accessibilityRole="button"
      disabled={occupe}
      onPress={async () => {
        setOccupe(true)
        vibrer('medium')
        await confirmer(demarrable)
        setOccupe(false)
      }}
      style={({ pressed }) => ({ ...pilule(pressed), backgroundColor: A.t1 })}
    >
      <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 13 }}>Start</Text>
    </Pressable>
  )
}
