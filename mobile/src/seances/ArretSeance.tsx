import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  | { e: 'raison' }
  | { e: 'reaction'; raison: StopReason; lignes: string[]; dixMinutes: boolean; attenteMinutes: number }
  | { e: 'message'; texte: string }
  | { e: 'urgence'; options: OptionRattrapage[]; minutes: number }
  | { e: 'apps'; option: OptionRattrapage | null; minutes: number }
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

const titreFeuille = { color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, marginBottom: 8 } as const
const corps = { color: A.t1, fontFamily: GEIST.normal, fontSize: 16, lineHeight: 23 } as const

/**
 * « Stop » pendant une séance. La raison d'abord ; puis, s'il y a la place de
 * repousser, la réaction propre à la raison et « Stop ? ». Oui : la séance
 * reste bloquée pendant l'attente (5 min et plus), « I'll continue » reste à
 * portée, puis elle s'arrête et le rattrapage se choisit — il n'y a pas
 * d'abandon. L'urgence saute l'attente : jusqu'à quand repousser, puis tout
 * écarté sauf 3 apps, et l'app regarde. Toujours monté (`pilule`) : le choix
 * du rattrapage survit à la fin de la séance.
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

  // Le compte à rebours de l'attente, à la seconde.
  const attente = confiance.stopEnAttente
  useEffect(() => {
    if (!attente) return
    const t = setInterval(() => setMaintenant(Date.now()), 500)
    return () => clearInterval(t)
  }, [attente])

  const fermer = () => {
    setEtape({ e: 'ferme' })
    setTexte('')
    setRefus(null)
  }

  const raisonChoisie = async (raison: StopReason) => {
    if (occupe) return
    vibrer('medium')
    setOccupe(true)
    try {
      // L'urgence n'attend pas — sauf quand elle est devenue trop fréquente.
      if (raison === 'real-event' && !confiance.urgenceTropFrequente) {
        const u = confiance.optionsUrgence()
        if (!u) return fermer()
        Keyboard.dismiss()
        return setEtape(u.options.length ? { e: 'urgence', options: u.options, minutes: u.minutes } : { e: 'apps', option: null, minutes: u.minutes })
      }
      const r = await confiance.preparer(raison, texte.trim() || undefined)
      Keyboard.dismiss()
      if (r.etape === 'reaction') setEtape({ e: 'reaction', raison, lignes: r.lignes, dixMinutes: r.dixMinutes, attenteMinutes: r.attenteMinutes })
      else if (r.etape === 'message') setEtape({ e: 'message', texte: r.message })
      else fermer()
    } finally {
      setOccupe(false)
    }
  }

  const oui = async (raison: StopReason) => {
    vibrer('medium')
    setOccupe(true)
    await confiance.confirmerStop(raison, texte.trim() || undefined, Date.now() - depuis.current)
    setOccupe(false)
    fermer()
  }

  const continuer = () => {
    vibrer('medium')
    void confiance.continuer()
    fermer()
  }

  const ouvrir = () => {
    vibrer('light')
    depuis.current = Date.now()
    // Dans la prolongation, le bloc prévu est fait : « Stop » est la fin.
    if (enProlongation) return void arreter(null)
    if (!confiance.stopPermis) return setEtape({ e: 'pause' })
    setEtape({ e: 'raison' })
  }

  const appliquerApps = async (nbApps: number) => {
    if (etape.e !== 'apps') return
    setOccupe(true)
    const ok = etape.option
      ? await confiance.reporterEnUrgence(etape.option, etape.minutes, nbApps)
      : await confiance.urgenceCourte(nbApps)
    setOccupe(false)
    if (ok) fermer()
  }

  const pause = confiance.pause
  const reste = attente ? Math.max(0, Math.ceil((attente.untilMs - maintenant) / 1000)) : 0
  const choix = confiance.choixRattrapage

  let bouton: ReactNode = null
  if (montrerPilule && (pause || confiance.retourAttendu)) {
    bouton = (
      <Pressable accessibilityRole="button" onPress={() => (vibrer('medium'), void confiance.reprendre())} style={({ pressed }) => ({ ...pilule(pressed), backgroundColor: A.t1 })}>
        <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 13 }}>{pause ? `Back · ${fmt(pause.endMinute)}` : 'I’m back'}</Text>
      </Pressable>
    )
  } else if (montrerPilule && attente) {
    // L'attente : la séance est encore bloquée ; on peut toujours continuer.
    bouton = (
      <Pressable accessibilityRole="button" accessibilityLabel="I’ll continue" onPress={continuer} style={({ pressed }) => ({ ...pilule(pressed), backgroundColor: A.t1, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
        <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 13 }}>I’ll continue</Text>
        <Text style={{ color: 'rgba(0,0,0,0.5)', fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {`${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}`}
        </Text>
      </Pressable>
    )
  } else if (montrerPilule) {
    bouton = (
      <Pressable accessibilityRole="button" onPress={ouvrir} style={({ pressed }) => pilule(pressed)}>
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>{confiance.stopPermis || enProlongation ? 'Stop' : 'Pause'}</Text>
      </Pressable>
    )
  }

  return (
    <>
      {bouton}

      {/* Le rattrapage à choisir : il n'y a pas d'autre sortie. */}
      <Feuille ouverte={!!choix && etape.e === 'ferme'} fermer={() => undefined} style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {choix ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={titreFeuille}>{`Make up ${hm(choix.minutes)}`}</Text>
            {choix.options.map((o) => (
              <Pressable
                key={`${o.date}-${o.startMinute}`}
                accessibilityRole="button"
                disabled={occupe}
                onPress={async () => {
                  vibrer('medium')
                  setOccupe(true)
                  await confiance.choisirRattrapage(o)
                  setOccupe(false)
                }}
                style={({ pressed }) => ({ ...ligne(pressed), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' })}
              >
                <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{JOUR(o.date, aujourdHui)}</Text>
                <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 15, fontVariant: ['tabular-nums'] }}>{fmt(o.startMinute)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Feuille>

      <Feuille ouverte={etape.e !== 'ferme'} fermer={fermer} style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {etape.e === 'raison' ? (
          <>
            <Text accessibilityRole="header" style={titreFeuille}>{`Stop ${titre}?`}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {STOP_REASONS.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  disabled={occupe}
                  onPress={() => void raisonChoisie(r)}
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

        {etape.e === 'reaction' ? (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="header" style={titreFeuille}>{`Stop ${titre}?`}</Text>
            {etape.lignes.map((l) => (
              <Text key={l} accessibilityLiveRegion="polite" style={corps}>{l}</Text>
            ))}
            <BoutonBlanc onPress={continuer} hauteur={56}>{etape.dixMinutes ? '10 more minutes' : 'I’ll continue'}</BoutonBlanc>
            <Pressable accessibilityRole="button" disabled={occupe} onPress={() => void oui(etape.raison)} style={({ pressed }) => ({ ...ligne(pressed), alignItems: 'center' })}>
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>{`Yes, stop in ${etape.attenteMinutes} min`}</Text>
            </Pressable>
          </View>
        ) : null}

        {etape.e === 'message' ? (
          <View style={{ gap: 16 }}>
            <Text accessibilityLiveRegion="polite" style={corps}>{etape.texte}</Text>
            <BoutonBlanc onPress={fermer}>OK</BoutonBlanc>
          </View>
        ) : null}

        {etape.e === 'urgence' ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={titreFeuille}>Push back until</Text>
            {etape.options.map((o) => (
              <Pressable
                key={`${o.date}-${o.startMinute}`}
                accessibilityRole="button"
                onPress={() => (vibrer('light'), setRefus(null), setEtape({ e: 'apps', option: o, minutes: etape.minutes }))}
                style={({ pressed }) => ({ ...ligne(pressed), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' })}
              >
                <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{JOUR(o.date, aujourdHui)}</Text>
                <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 15, fontVariant: ['tabular-nums'] }}>{fmt(o.startMinute)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {etape.e === 'apps' ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={titreFeuille}>
              {etape.option ? `${JOUR(etape.option.date, aujourdHui)} ${fmt(etape.option.startMinute)}` : '15 min'}
            </Text>
            {!etape.option && etape.minutes > 0 ? <Text style={corps}>No room to push this back. 15 minutes, then you finish.</Text> : null}
            <BoutonBlanc onPress={() => (vibrer('light'), setRefus(null), setChoixApps(true))}>Choose up to 3 apps</BoutonBlanc>
            <Pressable accessibilityRole="button" disabled={occupe} onPress={() => void appliquerApps(0)} style={({ pressed }) => ({ ...ligne(pressed), alignItems: 'center' })}>
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>Keep everything blocked</Text>
            </Pressable>
            {refus ? (
              <Text accessibilityLiveRegion="polite" style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 14, textAlign: 'center', marginTop: 4 }}>
                {refus}
              </Text>
            ) : null}
          </View>
        ) : null}

        {etape.e === 'pause' ? (
          <View style={{ gap: 8 }}>
            {confiance.souffleEnCours ? (
              <BoutonBlanc onPress={() => (vibrer('medium'), void confiance.souffle(), fermer())}>I need 15 min</BoutonBlanc>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => (vibrer('light'), setEtape({ e: 'apps', option: null, minutes: 0 }))}
              style={({ pressed }) => ({ ...ligne(pressed), alignItems: 'center' })}
            >
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>Something real came up</Text>
            </Pressable>
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
          else void appliquerApps(s.nbApplications)
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
