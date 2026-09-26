import { useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import { STOP_REASONS, type StopReason } from '@shared/schemas'
import { RAISONS } from '@shared/planning/arrets'
import { usePlan } from '@/plan/Plan'
import { A, BoutonBlanc, Feuille, fmt, GEIST, hm, MONO } from '@/ui/app-briques'
import { SelecteurApplications } from '@/blocage/SelecteurApplications'
import { URGENCE_APPS_MAX, type OptionRattrapage } from '@shared/planning/trust'
import { vibrer } from '@/accueil/briques-introduction'

const pilule = (pressed: boolean) => ({
  height: 32,
  paddingHorizontal: 14,
  borderRadius: 16,
  backgroundColor: 'rgba(242,242,242,0.1)',
  justifyContent: 'center' as const,
  transform: [{ scale: pressed ? 0.95 : 1 }],
})

type Etape =
  | { e: 'ferme' }
  | { e: 'delai'; fin: number }
  | { e: 'raison' }
  | { e: 'contre'; raison: StopReason; message: string }
  | { e: 'message'; texte: string }
  | { e: 'promesse'; options: OptionRattrapage[]; minutes: number; source: { kind: 'task' | 'objective' | 'ancre'; refId: string; blockId: string } }
  | { e: 'urgence' }
  | { e: 'pause' }

const JOUR = (date: string, aujourdHui: string) =>
  date === aujourdHui ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })

const ligne = (pressed: boolean) => ({
  minHeight: 52,
  borderRadius: 12,
  backgroundColor: A.s,
  paddingHorizontal: 14,
  justifyContent: 'center' as const,
  transform: [{ scale: pressed ? 0.97 : 1 }],
})

/**
 * « Stop » pendant une séance (spec « Stop, promesses et confiance »). Le
 * délai dépend du niveau de confiance, avec « Je continue » en gros et rien
 * d'autre à lire ; puis la raison en un tap ; la contre-offre aux niveaux 3-4
 * quand la raison ne colle pas ; enfin le rattrapage, qui devient une
 * promesse. Un Stop repousse le travail, il ne l'efface jamais.
 */
export function ArretSeance({ titre, pilule: montrerPilule = true }: { titre: string; pilule?: boolean }) {
  const { arreter, enProlongation, confiance, aujourdHui } = usePlan()
  const [etape, setEtape] = useState<Etape>({ e: 'ferme' })
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [maintenant, setMaintenant] = useState(Date.now())
  const [choixApps, setChoixApps] = useState(false)
  const [refus, setRefus] = useState<string | null>(null)
  const depuis = useRef(0)
  const minuteStop = useRef(new Date())

  // Le compte à rebours du délai, à la seconde.
  useEffect(() => {
    if (etape.e !== 'delai') return
    const t = setInterval(() => {
      const n = Date.now()
      setMaintenant(n)
      if (n >= etape.fin) {
        minuteStop.current = new Date(n)
        depuis.current = n
        setEtape({ e: 'raison' })
      }
    }, 250)
    return () => clearInterval(t)
  }, [etape])

  const fermer = () => {
    setEtape({ e: 'ferme' })
    setTexte('')
    setRefus(null)
  }

  const suite = async (raison: StopReason | null, contreOffreRefusee?: boolean) => {
    if (occupe) return
    setOccupe(true)
    try {
      const r = await confiance.decider(raison, {
        ...(texte.trim() ? { texte: texte.trim() } : {}),
        reponseMs: Date.now() - depuis.current,
        ...(contreOffreRefusee !== undefined ? { contreOffreRefusee } : {}),
        minuteStop: minuteStop.current,
      })
      Keyboard.dismiss()
      if (r.etape === 'contre-offre' && raison) setEtape({ e: 'contre', raison, message: r.message })
      else if (r.etape === 'pas-de-place' || r.etape === 'aide') setEtape({ e: 'message', texte: r.message })
      else if (r.etape === 'arrete' && r.options.length > 0) setEtape({ e: 'promesse', options: r.options, minutes: r.minutes, source: r.source })
      else fermer()
    } finally {
      setOccupe(false)
    }
  }

  const ouvrir = () => {
    vibrer('light')
    // Dans la prolongation, le bloc prévu est fait : « Stop » est la fin.
    if (enProlongation) return void arreter(null)
    if (!confiance.stopPermis) return setEtape({ e: 'pause' })
    minuteStop.current = new Date()
    depuis.current = Date.now()
    // Niveau 1 : un tap, puis le rattrapage.
    if (confiance.delaiStop === 0) return void suite(null)
    setMaintenant(Date.now())
    setEtape({ e: 'delai', fin: Date.now() + confiance.delaiStop * 1000 })
  }

  const continuer = () => {
    vibrer('medium')
    void confiance.renoncer()
    fermer()
  }

  const urgence = async (nbApps: number) => {
    const ok = await confiance.urgence(nbApps)
    if (ok) fermer()
  }

  // Au-delà d'un arrêt sur trois en urgence, l'urgence compte comme un abandon.
  const quelqueChose = () => {
    vibrer('light')
    if (confiance.urgenceAbandon && confiance.stopPermis) {
      minuteStop.current = new Date()
      depuis.current = Date.now()
      return void suite('real-event', true)
    }
    setEtape({ e: 'urgence' })
  }

  const pause = confiance.pause
  if (montrerPilule && (pause || confiance.retourAttendu)) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => (vibrer('medium'), void confiance.reprendre())}
        style={({ pressed }) => ({ ...pilule(pressed), backgroundColor: A.t1 })}
      >
        <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 13 }}>
          {pause ? `Back · ${fmt(pause.endMinute)}` : 'I’m back'}
        </Text>
      </Pressable>
    )
  }

  const reste = etape.e === 'delai' ? Math.max(0, Math.ceil((etape.fin - maintenant) / 1000)) : 0
  const verrouillee = etape.e === 'promesse'

  return (
    <>
      {montrerPilule ? (
        <Pressable accessibilityRole="button" onPress={ouvrir} style={({ pressed }) => pilule(pressed)}>
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>{confiance.stopPermis || enProlongation ? 'Stop' : 'Pause'}</Text>
        </Pressable>
      ) : null}
      <Feuille
        ouverte={etape.e !== 'ferme'}
        // Fermer pendant le délai, c'est continuer. Une promesse se choisit.
        fermer={() => (etape.e === 'delai' ? continuer() : verrouillee ? undefined : fermer())}
        style={{ paddingHorizontal: 20, paddingBottom: 24 }}
      >
        {etape.e === 'delai' ? (
          <View style={{ gap: 16 }}>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 13, textAlign: 'center', fontVariant: ['tabular-nums'] }}
            >
              {`${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}`}
            </Text>
            <BoutonBlanc onPress={continuer} hauteur={64}>I’ll continue</BoutonBlanc>
            <Pressable accessibilityRole="button" onPress={quelqueChose} style={{ alignSelf: 'center', paddingVertical: 10 }}>
              <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 14 }}>Something real came up</Text>
            </Pressable>
          </View>
        ) : null}

        {etape.e === 'raison' ? (
          <>
            <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}>
              {`Stop ${titre}?`}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {STOP_REASONS.filter((r) => r !== 'real-event').map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  disabled={occupe}
                  onPress={() => (vibrer('medium'), void suite(r))}
                  style={({ pressed }) => ({ ...ligne(pressed), width: '48.5%' })}
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
        ) : null}

        {etape.e === 'contre' ? (
          <View style={{ gap: 16 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: A.t1, fontFamily: GEIST.normal, fontSize: 16, lineHeight: 23 }}>
              {etape.message}
            </Text>
            <BoutonBlanc onPress={continuer}>10 more minutes</BoutonBlanc>
            <Pressable
              accessibilityRole="button"
              disabled={occupe}
              onPress={() => (vibrer('light'), void suite(etape.raison, true))}
              style={({ pressed }) => ({ ...ligne(pressed), alignItems: 'center' })}
            >
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>Stop anyway</Text>
            </Pressable>
          </View>
        ) : null}

        {etape.e === 'message' ? (
          <View style={{ gap: 16 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: A.t1, fontFamily: GEIST.normal, fontSize: 16, lineHeight: 23 }}>
              {etape.texte}
            </Text>
            <BoutonBlanc onPress={fermer}>OK</BoutonBlanc>
          </View>
        ) : null}

        {etape.e === 'promesse' ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, marginBottom: 8 }}>
              {`Make up ${hm(etape.minutes)}`}
            </Text>
            {etape.options.map((o) => (
              <Pressable
                key={`${o.date}-${o.startMinute}`}
                accessibilityRole="button"
                disabled={occupe}
                onPress={async () => {
                  vibrer('medium')
                  setOccupe(true)
                  await confiance.promettre(o, etape.source, etape.minutes)
                  setOccupe(false)
                  fermer()
                }}
                style={({ pressed }) => ({ ...ligne(pressed), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' })}
              >
                <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{JOUR(o.date, aujourdHui)}</Text>
                <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 15, fontVariant: ['tabular-nums'] }}>{fmt(o.startMinute)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {etape.e === 'pause' ? (
          <View style={{ gap: 8 }}>
            {confiance.souffleEnCours ? (
              <BoutonBlanc onPress={() => (vibrer('medium'), void confiance.souffle(), fermer())}>I need 15 min</BoutonBlanc>
            ) : null}
            <Pressable accessibilityRole="button" onPress={quelqueChose} style={({ pressed }) => ({ ...ligne(pressed), alignItems: 'center' })}>
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>Something real came up</Text>
            </Pressable>
          </View>
        ) : null}

        {etape.e === 'urgence' ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, marginBottom: 8 }}>
              15 min
            </Text>
            <BoutonBlanc onPress={() => (vibrer('light'), setRefus(null), setChoixApps(true))}>Choose up to 3 apps</BoutonBlanc>
            <Pressable accessibilityRole="button" onPress={() => void urgence(0)} style={({ pressed }) => ({ ...ligne(pressed), alignItems: 'center' })}>
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>No apps</Text>
            </Pressable>
            {refus ? (
              <Text accessibilityLiveRegion="polite" style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 14, textAlign: 'center', marginTop: 4 }}>
                {refus}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Feuille>
      <SelecteurApplications
        ouvert={choixApps}
        role="urgence"
        surFermeture={() => setChoixApps(false)}
        surChoix={(s) => {
          // Une 4e app est refusée ; une catégorie entière aussi.
          if (s.nbApplications > URGENCE_APPS_MAX || s.nbCategories > 0) setRefus('3 apps at most.')
          else void urgence(s.nbApplications)
        }}
      />
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
