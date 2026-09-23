/**
 * THESIS: One intention becomes a real place in the user's day.
 * ARC: what matters → "you already know… then why do you keep pushing it?"
 *      turning into "how often do you say 'tomorrow'?" → what gets pushed
 *      (told in the words of his answer) → since when, how much, how fast →
 *      the math, live, one problem at a time → his own sentence, with weight →
 *      Vethos → one thing, really placed.
 * RULES: nothing typed after the name; every answer changes what comes next;
 *      every number comes from his answers and each thing's real nature.
 */
import { useEffect, useRef, useState } from 'react'
import { Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDonnees } from '@/donnees/magasin'
import { FournisseurTheme } from '@/theme/Theme'
import { GEIST } from '@/ui/primitives'
import { SuiteIntroduction, type MemoireIntroduction } from './SuiteIntroduction'
import { ETAPES_INTRODUCTION, TOTAL_ETAPES_INTRODUCTION } from './modele-introduction'
import {
  bilan,
  CHOSES,
  chosesPour,
  DEPUIS,
  echoFrequence,
  FREQUENCES,
  PRIORITES,
  reponsesCompletes,
  RYTHME_REPETE,
  RYTHME_UNIQUE,
  TRAVAIL,
  type Option,
  type Priorite,
  type Reponses,
} from './choix-introduction'
import {
  ActionIntro,
  Apparaitre,
  BarreIntro,
  ChampIntro,
  ChoixIntro,
  DUREE,
  encre,
  PageIntro,
  SORTIE,
  TitreIntro,
  useAccessibiliteIntro,
} from './experience-introduction'
import { ConstatEnDeux, Frappe, LogoVethos } from './recit-introduction'
import { CalculEnDirect } from './calcul-introduction'

type Scene = (typeof ETAPES_INTRODUCTION)[number] | 'suite'
const ORDRE: Scene[] = [...ETAPES_INTRODUCTION, 'suite']

/** Le fond s'assombrit à mesure que l'histoire se tait, puis se rallume avec Vethos. */
function tonDuFond(scene: Scene): number {
  if (scene === 'nom' || scene === 'priorite') return 1
  if (scene === 'frequence' || scene === 'differe' || scene === 'detail') return 0.45
  if (scene === 'suite') return 0.5
  return 0
}

export function Introduction() {
  return (
    <FournisseurTheme force="sombre">
      <IntroductionSombre />
    </FournisseurTheme>
  )
}

/** Une question à choix, en grille de deux. */
function Question({
  titre,
  options,
  valeur,
  choisir,
  reduit,
  grand = false,
}: {
  titre: string
  options: Option[]
  valeur: number | undefined
  choisir: (v: number) => void
  reduit: boolean
  grand?: boolean
}) {
  return (
    <Apparaitre reduit={reduit} style={{ gap: 14 }}>
      {grand ? (
        <TitreIntro>{titre}</TitreIntro>
      ) : (
        <Text
          accessibilityRole="header"
          style={{ color: encre.text, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 }}
        >
          {titre}
        </Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <ChoixIntro
            key={o.libelle}
            titre={o.libelle}
            compact
            selected={valeur === o.valeur}
            attenue={valeur !== undefined && valeur !== o.valeur}
            onPress={() => choisir(o.valeur)}
            style={{ flexBasis: '47%', flexGrow: 1 }}
          />
        ))}
      </View>
    </Apparaitre>
  )
}

function IntroductionSombre() {
  const marges = useSafeAreaInsets()
  const { chargees, reglages, majReglages } = useDonnees()
  const [scene, setScene] = useState<Scene>('nom')
  const [nom, setNom] = useState('')
  const [priorites, setPriorites] = useState<Priorite[]>([])
  const [choseIds, setChoseIds] = useState<string[]>([])
  const [soirs, setSoirs] = useState<number | undefined>(undefined)
  const [reponses, setReponses] = useState<Record<string, Reponses>>({})
  const [detail, setDetail] = useState(0)
  const [relecture, setRelecture] = useState(false)
  const [transition, setTransition] = useState(false)
  const [logoArrive, setLogoArrive] = useState(false)
  const [constatLu, setConstatLu] = useState(false)
  const [frappee, setFrappee] = useState(false)
  const [calculFini, setCalculFini] = useState(false)
  const [sortie, setSortie] = useState(false)
  const { reduit, lecteur } = useAccessibiliteIntro()
  const visibleAvant = useRef(false)
  const memoireEngagement = useRef<MemoireIntroduction | null>(null)
  const aDejaTermine = useRef(false)
  const verrou = useRef(false)
  const p = useRef(new Animated.Value(1)).current
  const fond = useRef(new Animated.Value(1)).current
  const monde = useRef(new Animated.Value(1)).current
  const transitionAnimation = useRef<Animated.CompositeAnimation | null>(null)
  const visible = chargees && (!reglages.introductionFaite || sortie)

  useEffect(() => {
    if (!chargees) return
    if (reglages.introductionFaite && !sortie) aDejaTermine.current = true
    if (visible && !visibleAvant.current) {
      memoireEngagement.current = null
      setNom(reglages.prenom)
      setScene('nom')
      setPriorites([])
      setChoseIds([])
      setSoirs(undefined)
      setReponses({})
      setDetail(0)
      setRelecture(aDejaTermine.current)
      verrou.current = false
      setTransition(false)
      p.setValue(1)
      monde.setValue(1)
    }
    visibleAvant.current = visible
  }, [chargees, monde, p, reglages.introductionFaite, reglages.prenom, sortie, visible])
  useEffect(() => () => transitionAnimation.current?.stop(), [])
  useEffect(() => {
    const a = Animated.timing(fond, {
      toValue: tonDuFond(scene),
      duration: reduit ? DUREE.reduit : DUREE.ui,
      easing: SORTIE,
      useNativeDriver: true,
    })
    a.start()
    return () => a.stop()
  }, [fond, reduit, scene])

  const aller = (suivante: Scene, sousPage = 0) => {
    if (verrou.current) return
    verrou.current = true
    setTransition(true)
    Keyboard.dismiss()
    transitionAnimation.current = Animated.timing(p, {
      toValue: 0,
      duration: reduit ? 80 : DUREE.micro,
      easing: SORTIE,
      useNativeDriver: true,
    })
    transitionAnimation.current.start(({ finished }) => {
      if (!finished) return
      if (suivante === 'activation') setLogoArrive(false)
      if (suivante === 'frequence') setConstatLu(false)
      if (suivante === 'calcul') setCalculFini(false)
      if (suivante === 'pensee') setFrappee(false)
      setDetail(sousPage)
      setScene(suivante)
      transitionAnimation.current = Animated.timing(p, {
        toValue: 1,
        duration: reduit ? DUREE.reduit : DUREE.entree,
        easing: SORTIE,
        useNativeDriver: true,
      })
      transitionAnimation.current.start(() => {
        verrou.current = false
        setTransition(false)
      })
    })
  }
  const choses = choseIds.map((id) => CHOSES.find((c) => c.id === id)!).filter(Boolean)
  const fermerRelecture = () => {
    void majReglages({ introductionFaite: true })
  }
  const retour = () => {
    if (scene === 'detail' && detail > 0) return aller('detail', detail - 1)
    const precedente = ORDRE[Math.max(0, ORDRE.indexOf(scene) - 1)]!
    aller(precedente, precedente === 'detail' ? Math.max(0, choses.length - 1) : 0)
  }
  /** Pas de noir entre l'introduction et l'app : la vraie interface apparaît dessous. */
  const terminer = () => {
    router.replace('/')
    Animated.timing(monde, {
      toValue: 0,
      duration: reduit ? DUREE.reduit : DUREE.ui,
      delay: reduit ? 0 : 60,
      easing: SORTIE,
      useNativeDriver: true,
    }).start(() => setSortie(false))
  }

  const choix = chosesPour(priorites)
  const bilans = soirs !== undefined ? choses.map((c) => bilan(c, soirs, reponses[c.id] ?? {})) : []
  const echo = echoFrequence(soirs ?? 3)
  const demains = Math.max(0, ...bilans.map((b) => b.demains))
  const actuelle = choses[detail]
  const repondre = (id: string, cle: keyof Reponses, v: number) =>
    setReponses((r) => ({ ...r, [id]: { ...r[id], [cle]: v } }))
  const barreVisible = scene !== 'pensee' && (scene !== 'activation' || logoArrive)

  if (!visible) return null
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={relecture ? fermerRelecture : retour}
    >
      <Animated.View style={{ flex: 1, opacity: monde }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: encre.bg }}
        >
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', inset: 0, backgroundColor: encre.calme, opacity: fond }}
          />
          <View
            style={{
              flex: 1,
              paddingTop: marges.top,
              paddingBottom: Math.max(marges.bottom, 12),
              overflow: 'hidden',
            }}
          >
            <View style={{ flex: 1, width: '100%', maxWidth: 540, alignSelf: 'center' }}>
              {scene !== 'suite' ? (
                <BarreIntro
                  etapeActuelle={ETAPES_INTRODUCTION.indexOf(scene)}
                  total={TOTAL_ETAPES_INTRODUCTION}
                  retour={scene !== 'nom' ? retour : undefined}
                  quitter={relecture ? fermerRelecture : undefined}
                  visible={barreVisible}
                  reduit={reduit}
                />
              ) : null}
              {/* Le contenu défile SOUS la barre, jamais par-dessus : rien n'est coupé en haut. */}
              <Animated.View
                pointerEvents={transition ? 'none' : 'auto'}
                style={{ flex: 1, opacity: p, overflow: 'hidden' }}
              >
                {scene === 'nom' ? (
                  <PageIntro
                    haut={34}
                    footer={
                      <ActionIntro disabled={!nom.trim()} onPress={() => aller('priorite')}>
                        Let’s begin
                      </ActionIntro>
                    }
                  >
                    <TitreIntro grand>First, what should I call you?</TitreIntro>
                    <ChampIntro
                      label="Your name"
                      valeur={nom}
                      changer={setNom}
                      placeholder="Your name"
                      grand
                      autoFocus={!relecture}
                      maxLength={40}
                      labelVisible={false}
                      onSubmit={() => {
                        if (nom.trim()) aller('priorite')
                      }}
                    />
                  </PageIntro>
                ) : null}

                {scene === 'priorite' ? (
                  <PageIntro
                    footer={
                      <ActionIntro disabled={!priorites.length} onPress={() => aller('frequence')}>
                        {priorites.length > 1 ? 'These matter to me' : 'This matters to me'}
                      </ActionIntro>
                    }
                  >
                    <View style={{ gap: 8 }}>
                      <TitreIntro>What matters most to you right now?</TitreIntro>
                      <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 15 }}>
                        Choose as many as you want.
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {[0, 1].map((groupe) => (
                        <Apparaitre key={groupe} reduit={reduit} delai={groupe * 120} style={{ flex: 1, gap: 10 }}>
                          {PRIORITES.slice(groupe * 3, groupe * 3 + 3).map((option) => {
                            const pris = priorites.includes(option.nom)
                            return (
                              <ChoixIntro
                                key={option.nom}
                                titre={option.nom}
                                detail={option.detail}
                                selected={pris}
                                role="checkbox"
                                onPress={() => {
                                  setPriorites((v) =>
                                    pris ? v.filter((x) => x !== option.nom) : [...v, option.nom],
                                  )
                                  setChoseIds((ids) =>
                                    pris
                                      ? ids.filter((id) => CHOSES.find((c) => c.id === id)?.priorite !== option.nom)
                                      : ids,
                                  )
                                }}
                                style={{ minHeight: 96 }}
                              />
                            )
                          })}
                        </Apparaitre>
                      ))}
                    </View>
                  </PageIntro>
                ) : null}

                {scene === 'differe' ? (
                  <PageIntro
                    footer={
                      <ActionIntro
                        disabled={!choseIds.length}
                        onPress={() => {
                          memoireEngagement.current = null
                          aller('detail', 0)
                        }}
                      >
                        {choseIds.length > 1 ? 'These are the ones' : 'That’s the one'}
                      </ActionIntro>
                    }
                  >
                    <View style={{ gap: 10 }}>
                      {/* Sa réponse d'avant, entendue : l'écran lui parle à partir d'elle. */}
                      <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 15, lineHeight: 21 }}>
                        {echo.accuse}
                      </Text>
                      <TitreIntro>{echo.titre}</TitreIntro>
                      <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 15 }}>
                        Choose everything that’s true.
                      </Text>
                    </View>
                    <View style={{ gap: 18 }}>
                      {priorites.map((pr, g) => (
                        <Apparaitre key={pr} reduit={reduit} delai={g * 110} style={{ gap: 8 }}>
                          {priorites.length > 1 ? (
                            <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 13 }}>{pr}</Text>
                          ) : null}
                          {choix
                            .filter((c) => c.priorite === pr)
                            .map((c) => {
                              const pris = choseIds.includes(c.id)
                              return (
                                <ChoixIntro
                                  key={c.id}
                                  titre={c.bouton}
                                  compact
                                  role="checkbox"
                                  selected={pris}
                                  onPress={() =>
                                    setChoseIds((ids) => (pris ? ids.filter((x) => x !== c.id) : [...ids, c.id]))
                                  }
                                />
                              )
                            })}
                        </Apparaitre>
                      ))}
                    </View>
                  </PageIntro>
                ) : null}

                {/* La reconnaissance monte, « Then » la complète — et devient la question. */}
                {scene === 'frequence' ? (
                  <PageIntro
                    haut={30}
                    footer={
                      soirs !== undefined ? (
                        <Apparaitre reduit={reduit} decalage={0}>
                          <ActionIntro onPress={() => aller('differe')}>Continue</ActionIntro>
                        </Apparaitre>
                      ) : (
                        <View style={{ height: 56 }} />
                      )
                    }
                  >
                    <ConstatEnDeux taille={32} reduit={reduit || lecteur} surFin={() => setConstatLu(true)} />
                    {constatLu ? (
                      <View style={{ gap: 14 }}>
                        <Question
                          titre="How often do you tell yourself “I’ll do it tomorrow”?"
                          options={FREQUENCES}
                          valeur={soirs}
                          choisir={setSoirs}
                          reduit={reduit}
                        />
                        {soirs !== undefined ? (
                          <Apparaitre key={soirs} reduit={reduit}>
                            <Text style={{ color: encre.text2, fontFamily: GEIST.moyen, fontSize: 16, lineHeight: 22 }}>
                              {echo.accuse}
                            </Text>
                          </Apparaitre>
                        ) : null}
                      </View>
                    ) : null}
                  </PageIntro>
                ) : null}

                {/* Pour chaque chose : depuis quand, combien, à quel rythme. Le piège est là. */}
                {scene === 'detail' && actuelle ? (
                  <PageIntro
                    key={actuelle.id}
                    footer={
                      <ActionIntro
                        disabled={!reponsesCompletes(actuelle, reponses[actuelle.id])}
                        onPress={() =>
                          detail < choses.length - 1 ? aller('detail', detail + 1) : aller('calcul')
                        }
                      >
                        {detail < choses.length - 1 ? 'Next' : 'Show me what it cost'}
                      </ActionIntro>
                    }
                  >
                    <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 14 }}>
                      {choses.length > 1 ? `${detail + 1} of ${choses.length} · ` : ''}
                      {actuelle.bouton}
                    </Text>
                    <Question
                      titre={
                        detail === 0
                          ? echo.detail(actuelle.verbe)
                          : `Since when have you been meaning to ${actuelle.verbe}?`
                      }
                      options={DEPUIS}
                      valeur={reponses[actuelle.id]?.depuis}
                      choisir={(v) => repondre(actuelle.id, 'depuis', v)}
                      reduit={reduit}
                    />
                    {actuelle.famille === 'unique' && reponses[actuelle.id]?.depuis !== undefined ? (
                      <Question
                        titre="How much work does it really need?"
                        options={TRAVAIL}
                        valeur={reponses[actuelle.id]?.travail}
                        choisir={(v) => repondre(actuelle.id, 'travail', v)}
                        reduit={reduit}
                      />
                    ) : null}
                    {reponses[actuelle.id]?.depuis !== undefined &&
                    (actuelle.famille === 'repetee' || reponses[actuelle.id]?.travail !== undefined) ? (
                      <Question
                        titre={
                          actuelle.famille === 'unique'
                            ? 'How many hours a week do you actually put into it?'
                            : 'How often do you actually do it now?'
                        }
                        options={actuelle.famille === 'unique' ? RYTHME_UNIQUE : RYTHME_REPETE}
                        valeur={reponses[actuelle.id]?.rythme}
                        choisir={(v) => repondre(actuelle.id, 'rythme', v)}
                        reduit={reduit}
                      />
                    ) : null}
                  </PageIntro>
                ) : null}

                {/* Le calcul en direct, problème par problème, puis tout rangé. */}
                {scene === 'calcul' ? (
                  <PageIntro
                    footer={
                      calculFini ? (
                        <Apparaitre reduit={reduit} decalage={0}>
                          <ActionIntro onPress={() => aller('pensee')}>I don’t want that</ActionIntro>
                        </Apparaitre>
                      ) : (
                        <View style={{ height: 56 }} />
                      )
                    }
                  >
                    <CalculEnDirect bilans={bilans} reduit={reduit} surFin={() => setCalculFini(true)} />
                  </PageIntro>
                ) : null}

                {scene === 'pensee' ? (
                  <PageIntro
                    centre
                    defiler={false}
                    footer={
                      frappee ? (
                        <Apparaitre reduit={reduit} delai={lecteur ? 0 : 1800} decalage={0}>
                          <ActionIntro onPress={() => aller('activation')}>Not this time</ActionIntro>
                        </Apparaitre>
                      ) : (
                        <View style={{ height: 56 }} />
                      )
                    }
                  >
                    <Frappe texte="“I’ll start tomorrow.”" reduit={reduit} surFin={() => setFrappee(true)} />
                    <View style={{ minHeight: 60 }}>
                      {frappee ? (
                        <Apparaitre reduit={reduit} delai={lecteur ? 0 : 700} decalage={0}>
                          <Text style={{ color: encre.text2, fontFamily: GEIST.moyen, fontSize: 20, lineHeight: 27 }}>
                            {echo.frappe} That’s about {demains} times since you first decided.
                          </Text>
                        </Apparaitre>
                      ) : null}
                    </View>
                  </PageIntro>
                ) : null}

                {scene === 'activation' ? (
                  <PageIntro
                    centre
                    defiler={false}
                    footer={
                      logoArrive ? (
                        <Apparaitre reduit={reduit} delai={reduit ? 0 : 300} decalage={0}>
                          <ActionIntro onPress={() => aller('suite')}>Give Vethos one thing</ActionIntro>
                        </Apparaitre>
                      ) : (
                        <View style={{ height: 56 }} />
                      )
                    }
                  >
                    <LogoVethos taille={168} reduit={reduit} surArrivee={() => setLogoArrive(true)} />
                    <View style={{ minHeight: 120 }}>
                      {logoArrive ? (
                        <Apparaitre reduit={reduit} style={{ gap: 10 }}>
                          <Text
                            style={{
                              color: encre.text3,
                              fontFamily: GEIST.moyen,
                              fontSize: 19,
                              lineHeight: 25,
                              textAlign: 'center',
                            }}
                          >
                            You already know what matters.
                          </Text>
                          <TitreIntro centre>Vethos makes sure your day respects it.</TitreIntro>
                        </Apparaitre>
                      ) : null}
                    </View>
                  </PageIntro>
                ) : null}

                {scene === 'suite' && choses.length ? (
                  <SuiteIntroduction
                    memoire={memoireEngagement}
                    mouvementReduit={reduit}
                    lecteur={lecteur}
                    prenom={nom.trim()}
                    choses={choses}
                    priorites={priorites}
                    retour={() => aller('activation')}
                    quitter={relecture ? fermerRelecture : undefined}
                    preparerSortie={() => setSortie(true)}
                    terminer={terminer}
                  />
                ) : null}
              </Animated.View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  )
}
