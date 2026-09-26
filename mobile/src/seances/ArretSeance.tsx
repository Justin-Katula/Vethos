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
  const { arreter, enProlongation } = usePlan()
  const [ouverte, setOuverte] = useState(false)
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [aide, setAide] = useState<string | null>(null)
  const depuis = useRef(0)

  const choisir = async (raison: StopReason) => {
    if (occupe) return
    setOccupe(true)
    vibrer('medium')
    try {
      const r = await arreter(raison, texte.trim() || undefined, Date.now() - depuis.current)
      Keyboard.dismiss()
      setTexte('')
      // Une détresse lue dans le texte : on le dit, et on reste là.
      if (r.ok && r.aide) setAide(r.aide)
      else setOuverte(false)
    } finally {
      setOccupe(false)
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          depuis.current = Date.now()
          vibrer('light')
          // Dans la prolongation, le bloc prévu est fait : « Stop » est la
          // fin, sans raison à donner.
          if (enProlongation) void arreter(null)
          else setOuverte(true)
        }}
        style={({ pressed }) => pilule(pressed)}
      >
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>Stop</Text>
      </Pressable>
      <Feuille ouverte={ouverte} fermer={() => (setOuverte(false), setAide(null))} style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {aide ? (
          <Text accessibilityLiveRegion="polite" style={{ color: A.t1, fontFamily: GEIST.normal, fontSize: 16, lineHeight: 23 }}>
            {aide}
          </Text>
        ) : null}
        {aide ? null : (
        <>
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
        </>
        )}
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

/**
 * Prolongation : une bannière discrète dans les 2 dernières minutes, une
 * seule durée, deux boutons. Le « non » n'est jamais un échec.
 */
export function BanniereProlongation() {
  const { prolongation, prolonger, declinerProlongation } = usePlan()
  const [occupe, setOccupe] = useState(false)
  if (prolongation === null) return null
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ marginTop: 8, marginHorizontal: 20, flexDirection: 'row', gap: 8 }}
    >
      <Pressable
        accessibilityRole="button"
        disabled={occupe}
        onPress={async () => {
          setOccupe(true)
          vibrer('medium')
          await prolonger()
          setOccupe(false)
        }}
        style={({ pressed }) => ({ ...pilule(pressed), flex: 1, height: 40, borderRadius: 20, alignItems: 'center', backgroundColor: A.t1 })}
      >
        <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 14 }}>{`Yes, +${prolongation} min`}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          vibrer('light')
          declinerProlongation()
        }}
        style={({ pressed }) => ({ ...pilule(pressed), flex: 1, height: 40, borderRadius: 20, alignItems: 'center' })}
      >
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 14 }}>No, I’ll stop here</Text>
      </Pressable>
    </View>
  )
}

/** « Saturday is free. » — proposé, jamais imposé : on le prend, ou on garde sa journée. */
export function CarteJourLibre() {
  const { jourLibre, decideJourLibre } = usePlan()
  if (!jourLibre) return null
  const jour = new Date(`${jourLibre}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
  return (
    <View style={{ marginTop: 8, marginHorizontal: 20, borderRadius: 12, backgroundColor: A.s, padding: 14, gap: 12 }}>
      <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 16 }}>{`${jour} is free.`}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => (vibrer('medium'), void decideJourLibre(jourLibre, 'taken'))}
          style={({ pressed }) => ({ ...pilule(pressed), backgroundColor: A.t1 })}
        >
          <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 13 }}>Take it</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => (vibrer('light'), void decideJourLibre(jourLibre, 'kept'))}
          style={({ pressed }) => pilule(pressed)}
        >
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>Keep my day</Text>
        </Pressable>
      </View>
    </View>
  )
}
