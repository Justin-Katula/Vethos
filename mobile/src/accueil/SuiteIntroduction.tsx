import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Animated, Keyboard, Pressable, Text, View } from 'react-native'
import { useDonnees } from '@/donnees/magasin'
import { useBlocage } from '@/blocage/etat'
import { SelecteurApplications } from '@/blocage/SelecteurApplications'
import { selectionEstVide } from '@/blocage/contrat'
import { verifierSommeil } from '@/donnees/regle-sommeil'
import { GEIST, MONO } from '@/ui/primitives'
import { GlypheBlocage } from '@/ui/icones'
import { duree } from '@/plan/format'
import { RoueDuree, RoueHeure, RoueJour } from '@/ui/Roue'
import {
  creerBrouillon,
  dateDans,
  dateValide,
  ETAPES_INTRODUCTION,
  ETAPES_SUITE,
  minuteValide,
  preparerIntroduction,
  TOTAL_ETAPES_INTRODUCTION,
  basculerActivite,
  type Activite,
  type ActiviteFixe,
  type BrouillonIntroduction,
  type NatureIntroduction,
} from './modele-introduction'
import type { ChoseRepoussee, Priorite } from './choix-introduction'
import {
  ActionIntro,
  Apparaitre,
  BarreIntro,
  ChoixIntro,
  CorpsIntro,
  DUREE,
  encre,
  JoursIntro,
  morpher,
  PageIntro,
  SORTIE,
  styles,
  TitreIntro,
  toucher,
} from './experience-introduction'
import { MiniSemaine, NOM_NATURE, TEINTE } from './engagement-introduction'
import { CadranTemps, SemaineReelle, type Apercu } from './apercu-introduction'

export type EtapeSuite = (typeof ETAPES_SUITE)[number]
type Etape = EtapeSuite
/** Une Task se termine dans le mois : on pourra la déplacer ensuite, pas la poser en l'an 3000. */
const ECHEANCE_MAX_JOURS = 30

const NATURES: { nature: NatureIntroduction; pourquoi: string }[] = [
  { nature: 'tache', pourquoi: 'It has a finish line. Once it’s done, it’s done.' },
  { nature: 'objectif', pourquoi: 'A few hours every week, wherever they fit.' },
  { nature: 'ancre', pourquoi: 'Same time, same days — it never moves.' },
]

/** Trois groupes : à l'intérieur, la scène se transforme ; entre eux, un fondu court. */
const groupe = (e: Etape) =>
  e === 'choix' || e === 'parametre' ? 'engagement' : e === 'protection' ? 'protection' : 'temps'

export type MemoireIntroduction = {
  brouillon: BrouillonIntroduction
}

/** Le brouillon part de ce qu'il a choisi : nom, nature et durée sont déjà justes. */
function brouillonDepuis(
  chose: ChoseRepoussee,
  reglages: Parameters<typeof creerBrouillon>[0],
  priorites: Priorite[],
) {
  const b = creerBrouillon(reglages)
  // Il a déjà dit qu'il va à l'école ou au travail : c'est coché, il ne reste que les heures.
  const activites: Activite[] = [
    ...(priorites.includes('School') ? (['school'] as const) : []),
    ...(priorites.includes('Work') ? (['work'] as const) : []),
  ]
  return {
    ...b,
    activites,
    nom: chose.engagement,
    nature: chose.nature,
    minutes: chose.nature === 'tache' ? 240 : chose.seance,
    // Ce que la chose demande vraiment : 4 séances de salle, 5 blocs d'étude…
    heuresHebdo:
      chose.famille === 'repetee'
        ? Math.min(100, Math.round(((chose.cible * chose.seance) / 60) * 4) / 4)
        : 3,
    joursAncre:
      chose.famille === 'repetee'
        ? chose.cible >= 7
          ? [0, 1, 2, 3, 4, 5, 6]
          : chose.cible >= 5
            ? [1, 2, 3, 4, 5]
            : chose.cible >= 4
              ? [1, 2, 4, 5]
              : [1, 3, 5]
        : b.joursAncre,
    echeance: dateDans(7),
    heureAncre: '18:00',
  }
}

export function SuiteIntroduction({
  mouvementReduit: reduit,
  lecteur,
  prenom,
  choses,
  priorites,
  retour,
  quitter,
  preparerSortie,
  terminer,
  memoire,
}: {
  mouvementReduit: boolean
  lecteur: boolean
  prenom: string
  /** Ce qu'il a dit repousser ; il commence par une seule, rien à retaper. */
  choses: ChoseRepoussee[]
  priorites: Priorite[]
  retour: () => void
  quitter?: () => void
  preparerSortie: () => void
  terminer: () => void
  memoire: MutableRefObject<MemoireIntroduction | null>
}) {
  const donnees = useDonnees()
  const blocage = useBlocage()
  const [choseId, setChoseId] = useState(choses[0]!.id)
  const chose = choses.find((c) => c.id === choseId) ?? choses[0]!
  const [b, setB] = useState(
    () => memoire.current?.brouillon ?? brouillonDepuis(chose, donnees.reglages, priorites),
  )
  const [etape, setEtape] = useState<Etape>('choix')
  const [page, setPage] = useState(0)
  useEffect(() => {
    memoire.current = { brouillon: b }
  }, [b, memoire])
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [selecteur, setSelecteur] = useState(false)
  const [aperçu, setApercu] = useState<Apercu | null>(null)
  const [jourChoisi, setJourChoisi] = useState('')
  const [transition, setTransition] = useState(false)

  const p = useRef(new Animated.Value(1)).current
  const habillage = useRef(new Animated.Value(1)).current
  const verrou = useRef(false)
  const sauvegarde = useRef(false)
  const animation = useRef<Animated.CompositeAnimation | null>(null)
  const monter = useRef(true)
  useEffect(() => {
    monter.current = true
    return () => {
      monter.current = false
      animation.current?.stop()
    }
  }, [])

  const maj = <K extends keyof BrouillonIntroduction>(cle: K, valeur: BrouillonIntroduction[K]) => {
    setB((avant) => ({ ...avant, [cle]: valeur }))
    setErreur('')
  }
  /** Change d'écran ; `sousPage` sert aux paramètres découpés en deux écrans. */
  const aller = (suivante: Etape, sousPage = 0) => {
    if (verrou.current) return
    setErreur('')
    Keyboard.dismiss()
    verrou.current = true
    setTransition(true)
    animation.current = Animated.timing(p, {
      toValue: 0,
      duration: reduit ? 80 : DUREE.micro,
      easing: SORTIE,
      useNativeDriver: true,
    })
    animation.current.start(({ finished }) => {
      if (!finished || !monter.current) return
      if (groupe(suivante) === groupe(etape)) morpher(reduit)
      setEtape(suivante)
      setPage(sousPage)
      animation.current = Animated.timing(p, {
        toValue: 1,
        duration: reduit ? DUREE.reduit : DUREE.entree,
        easing: SORTIE,
        useNativeDriver: true,
      })
      animation.current.start(() => {
        verrou.current = false
        if (monter.current) setTransition(false)
      })
    })
  }
  const pages = b.nature === 'objectif' ? 1 : 2
  const precedent = () => {
    if (occupe) return
    if (etape === 'choix') retour()
    else if (etape === 'parametre' && page > 0) aller('parametre', page - 1)
    else if (etape === 'protection') aller('parametre', pages - 1)
    else if (etape === 'jour' || etape === 'construction') aller('activite')
    else aller(ETAPES_SUITE[ETAPES_SUITE.indexOf(etape) - 1]!)
  }
  const proteger = async () => {
    if (occupe) return
    setErreur('')
    if (blocage.simule) {
      setErreur('App protection needs the iPhone build. You can set it up there.')
      return
    }
    setOccupe(true)
    try {
      if (blocage.autorisation !== 'accordee') await blocage.demanderAutorisation()
      if (useBlocage.getState().autorisation !== 'accordee') {
        setErreur('Screen Time access was not granted. Allow it in Settings, or continue without it.')
        return
      }
      setSelecteur(true)
    } catch {
      setErreur('Screen Time could not open. Try again, or set it up later.')
    } finally {
      if (monter.current) setOccupe(false)
    }
  }
  const construire = () => {
    try {
      const resultat = preparerIntroduction(useDonnees.getState(), b)
      const premier = [...resultat.blocs].sort(
        (x, y) => x.date.localeCompare(y.date) || x.startMinute - y.startMinute,
      )[0]
      setApercu(resultat)
      setJourChoisi(premier?.date ?? resultat.jours[0]?.date ?? '')
      aller('construction')
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Check your commitment and fixed hours.')
    }
  }
  /** Toujours une vraie sauvegarde : l'engagement existe dans l'app, pas en aperçu. */
  const enregistrer = async () => {
    if (sauvegarde.current) return
    sauvegarde.current = true
    setOccupe(true)
    setErreur('')
    preparerSortie()
    try {
      const frais = preparerIntroduction(useDonnees.getState(), b)
      await donnees.finaliserIntroduction(frais.ajouts, prenom)
      toucher('verrou')
      Animated.timing(habillage, {
        toValue: 0,
        duration: reduit ? DUREE.reduit : DUREE.micro,
        easing: SORTIE,
        useNativeDriver: true,
      }).start(() => terminer())
    } catch (cause) {
      sauvegarde.current = false
      setErreur(cause instanceof Error ? cause.message : 'Your plan could not be saved. Please try again.')
      setOccupe(false)
    }
  }

  const nuit = verifierSommeil({ coucher: b.coucher, lever: b.lever }, null)
  const fixeValide = (a: ActiviteFixe) => {
    const h = b.fixes[a]
    const debut = minuteValide(h.debut)
    const fin = minuteValide(h.fin)
    return debut !== null && fin !== null && debut !== fin && h.jours.length > 0
  }
  const activiteValide =
    b.activites.length > 0 &&
    (['work', 'school'] as const).every((a) => !b.activites.includes(a) || fixeValide(a))
  const majFixe = (a: ActiviteFixe, cle: 'debut' | 'fin' | 'jours', v: string | number[]) => {
    setB((x) => ({ ...x, fixes: { ...x.fixes, [a]: { ...x.fixes[a], [cle]: v } } }))
    setErreur('')
  }
  const ancreValide =
    minuteValide(b.heureAncre) !== null &&
    b.joursAncre.length > 0 &&
    b.minutes >= 15 &&
    b.minutes <= 480 &&
    (minuteValide(b.heureAncre) ?? 1440) + b.minutes <= 1440
  const pageValide =
    b.nature === 'tache'
      ? page === 0
        ? dateValide(b.echeance) && b.echeance > dateDans(0)
        : b.minutes >= 5
      : b.nature === 'objectif'
        ? b.heuresHebdo >= 0.25 && b.heuresHebdo <= 100
        : page === 0
          ? minuteValide(b.heureAncre) !== null
          : ancreValide
  const selection =
    blocage.selection && !selectionEstVide(blocage.selection) ? blocage.selection : null
  const protégé = !!selection

  let action: React.ReactNode = null
  if (etape === 'choix')
    action = <ActionIntro onPress={() => aller('parametre', 0)}>Continue</ActionIntro>
  if (etape === 'parametre')
    action = (
      <ActionIntro
        disabled={!pageValide}
        onPress={() => {
          if (page < pages - 1) aller('parametre', page + 1)
          else {
            toucher('verrou')
            aller('protection')
          }
        }}
      >
        {page < pages - 1 ? 'Next' : 'Keep this commitment'}
      </ActionIntro>
    )
  if (etape === 'protection')
    action = protégé ? (
      <>
        <ActionIntro onPress={() => aller('sommeil')}>Continue</ActionIntro>
        <ActionIntro secondaire onPress={() => void proteger()}>
          Change what’s locked
        </ActionIntro>
      </>
    ) : (
      <>
        <ActionIntro disabled={occupe} onPress={() => void proteger()}>
          {occupe ? 'Opening Screen Time…' : 'Lock my distractions'}
        </ActionIntro>
        <ActionIntro secondaire onPress={() => aller('sommeil')}>
          Not now
        </ActionIntro>
      </>
    )
  if (etape === 'sommeil')
    action = (
      <ActionIntro disabled={!nuit.ok} onPress={() => aller('activite')}>
        Keep this time for me
      </ActionIntro>
    )
  if (etape === 'activite')
    action = (
      <>
        <ActionIntro disabled={!activiteValide} onPress={construire}>
          Find its place, Vethos
        </ActionIntro>
        {/* Une erreur qui vient de l'engagement se corrige là où il se règle. */}
        {erreur ? (
          <ActionIntro secondaire onPress={() => aller('parametre', 0)}>
            Adjust my commitment
          </ActionIntro>
        ) : null}
      </>
    )
  if (etape === 'construction' && lecteur)
    action = <ActionIntro onPress={() => aller('jour')}>See my week</ActionIntro>
  if (etape === 'jour')
    action = (
      <ActionIntro disabled={occupe} onPress={() => void enregistrer()}>
        {occupe ? 'Saving your week…' : 'Enter Vethos'}
      </ActionIntro>
    )
  const pied =
    erreur || action ? (
      <Animated.View style={{ gap: 6, opacity: habillage }}>
        {erreur ? (
          <Text
            accessibilityRole="alert"
            style={{ color: encre.accentEncre, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 19 }}
          >
            {erreur}
          </Text>
        ) : null}
        {action}
      </Animated.View>
    ) : undefined

  const indexEtape =
    ETAPES_INTRODUCTION.length + ETAPES_SUITE.indexOf(etape) + (etape === 'parametre' ? 0 : 0)
  const g = groupe(etape)
  const recommandee = chose.nature
  const ordre = [
    NATURES.find((x) => x.nature === recommandee)!,
    ...NATURES.filter((x) => x.nature !== recommandee),
  ]
  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={{ opacity: habillage }}>
        <BarreIntro
          etapeActuelle={indexEtape}
          total={TOTAL_ETAPES_INTRODUCTION}
          retour={etape !== 'construction' ? precedent : undefined}
          quitter={quitter}
          visible={etape !== 'construction'}
          reduit={reduit}
        />
      </Animated.View>
      <Animated.View
        style={{
          flex: 1,
          overflow: 'hidden',
          opacity: p,
          pointerEvents: transition || occupe ? 'none' : 'auto',
        }}
      >
        {etape === 'choix' ? (
          <PageIntro footer={pied}>
            {choses.length > 1 ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 14 }}>
                  Start with one. Add the others in the app.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {choses.map((c) => {
                    const pris = c.id === chose.id
                    return (
                      <Pressable
                        key={c.id}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: pris }}
                        onPress={() => {
                          if (pris) return
                          toucher()
                          morpher(reduit)
                          setChoseId(c.id)
                          setB((v) => ({
                            ...brouillonDepuis(c, donnees.reglages, priorites),
                            activites: v.activites,
                            fixes: v.fixes,
                            coucher: v.coucher,
                            lever: v.lever,
                          }))
                        }}
                        style={({ pressed }) => ({
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 999,
                          backgroundColor: pris ? encre.text : encre.surface2,
                          transform: [{ scale: pressed ? 0.95 : 1 }],
                        })}
                      >
                        <Text
                          style={{ color: pris ? encre.bg : encre.text2, fontFamily: GEIST.moyen, fontSize: 14 }}
                        >
                          {c.bouton}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <TitreIntro>How should Vethos hold “{b.nom}”?</TitreIntro>
              <CorpsIntro>We picked what fits. You can change it.</CorpsIntro>
            </View>
            <View style={{ gap: 12 }}>
              {ordre.map((n, i) => (
                <Apparaitre key={n.nature} reduit={reduit} delai={i * 90}>
                  <CarteNature
                    nature={n.nature}
                    pourquoi={n.pourquoi}
                    choisie={b.nature === n.nature}
                    recommandee={n.nature === recommandee}
                    reduit={reduit}
                    delai={360 + i * 200}
                    choisir={() => {
                      morpher(reduit)
                      setB((v) => ({
                        ...v,
                        nature: n.nature,
                        minutes: n.nature === 'tache' ? 240 : chose.seance,
                      }))
                    }}
                  />
                </Apparaitre>
              ))}
            </View>
          </PageIntro>
        ) : null}

        {etape === 'parametre' ? (
          <PageIntro footer={pied}>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: TEINTE[b.nature] }} />
                <Text style={[styles.etiquette, { color: encre.text2 }]}>{NOM_NATURE[b.nature]}</Text>
                <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 13 }}>· {b.nom}</Text>
              </View>
              <TitreIntro>{questionParametre(b.nature, page)}</TitreIntro>
            </View>
            <Parametre b={b} page={page} maj={maj} />
          </PageIntro>
        ) : null}

        {g === 'protection' ? (
          <PageIntro footer={pied}>
            <View style={{ gap: 10 }}>
              <TitreIntro>Give it your undivided attention.</TitreIntro>
              <CorpsIntro>While you work on it, your distractions stay locked.</CorpsIntro>
            </View>
            <EcranProtege
              protege={protégé}
              reduit={reduit}
              nom={b.nom.trim()}
              couleur={TEINTE[b.nature]}
              compte={selection ? `${selection.nbApplications} apps · ${selection.nbCategories} categories` : undefined}
            />
          </PageIntro>
        ) : null}

        {g === 'temps' ? (
          <PageIntro footer={pied}>
            <Animated.View style={{ opacity: habillage }}>
              {etape === 'sommeil' ? (
                <Apparaitre key="t-sommeil" reduit={reduit} style={{ gap: 8 }}>
                  <TitreIntro>Your day starts with a good night.</TitreIntro>
                  <CorpsIntro>Vethos never places anything while you sleep.</CorpsIntro>
                </Apparaitre>
              ) : null}
              {etape === 'activite' ? (
                <Apparaitre key="t-activite" reduit={reduit} style={{ gap: 8 }}>
                  <TitreIntro>What’s already part of your day?</TitreIntro>
                  <CorpsIntro>Vethos builds around it, never over it.</CorpsIntro>
                </Apparaitre>
              ) : null}
              {etape === 'construction' ? (
                <Apparaitre key="t-construction" reduit={reduit} style={{ gap: 8 }}>
                  <TitreIntro>Finding its place.</TitreIntro>
                  <CorpsIntro>Around your sleep, around your fixed hours.</CorpsIntro>
                </Apparaitre>
              ) : null}
              {etape === 'jour' && aperçu ? (
                <Apparaitre key="t-jour" reduit={reduit} style={{ gap: 8 }}>
                  <TitreIntro>
                    {aperçu.blocs.length
                      ? 'This is what one decision changes.'
                      : 'Your week is full. Vethos sees it.'}
                  </TitreIntro>
                  <CorpsIntro>
                    {aperçu.blocs.length
                      ? `“${b.nom}” finally has a place in your week.`
                      : 'Free up some hours, or adjust the commitment.'}
                  </CorpsIntro>
                </Apparaitre>
              ) : null}
            </Animated.View>

            {etape === 'jour' && aperçu && jourChoisi ? (
              <Apparaitre key="semaine" reduit={reduit} duree={DUREE.ui}>
                <SemaineReelle aperçu={aperçu} b={b} selection={jourChoisi} choisir={setJourChoisi} />
              </Apparaitre>
            ) : etape !== 'jour' ? (
              <CadranTemps
                phase={etape as 'sommeil' | 'activite' | 'construction'}
                b={b}
                aperçu={aperçu}
                reduit={reduit}
                surPlace={() => {
                  if (!lecteur) aller('jour')
                }}
              />
            ) : null}

            <Animated.View style={{ opacity: habillage, gap: 16 }}>
              {etape === 'sommeil' ? (
                <Apparaitre key="c-sommeil" reduit={reduit} style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ gap: 8, alignItems: 'center' }}>
                      <Text style={styles.etiquetteChamp}>Bedtime</Text>
                      <RoueHeure
                        valeur={b.coucher}
                        changer={(v) => maj('coucher', v)}
                        etiquette="Bedtime"
                        pasMinutes={15}
                      />
                    </View>
                    <View style={{ gap: 8, alignItems: 'center' }}>
                      <Text style={styles.etiquetteChamp}>Wake-up</Text>
                      <RoueHeure
                        valeur={b.lever}
                        changer={(v) => maj('lever', v)}
                        etiquette="Wake-up"
                        pasMinutes={15}
                      />
                    </View>
                  </View>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={{
                      color: nuit.ok ? encre.text2 : encre.accentEncre,
                      fontFamily: GEIST.moyen,
                      fontSize: 14,
                      textAlign: 'center',
                    }}
                  >
                    {nuit.ok ? `${duree(nuit.duree)} of sleep` : `${duree(nuit.duree)} — ${nuit.raison}`}
                  </Text>
                </Apparaitre>
              ) : null}
              {etape === 'activite' ? (
                <Apparaitre key="c-activite" reduit={reduit} style={{ gap: 16 }}>
                  <View style={{ gap: 8 }}>
                    {[
                      [
                        { id: 'work' as const, nom: 'Work' },
                        { id: 'school' as const, nom: 'School' },
                      ],
                      [
                        { id: 'variable' as const, nom: 'My days change' },
                        { id: 'none' as const, nom: 'Nothing fixed' },
                      ],
                    ].map((ligne, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                        {ligne.map((a) => (
                          <ChoixIntro
                            key={a.id}
                            compact
                            role="checkbox"
                            style={{ flex: 1 }}
                            titre={a.nom}
                            selected={b.activites.includes(a.id)}
                            onPress={() => {
                              morpher(reduit)
                              setB((v) => ({ ...v, activites: basculerActivite(v.activites, a.id) }))
                              setErreur('')
                            }}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                  {(['school', 'work'] as const)
                    .filter((a) => b.activites.includes(a))
                    .map((a) => (
                      <View key={a} style={{ gap: 12 }}>
                        <Text style={{ color: encre.text, fontFamily: GEIST.demi, fontSize: 17 }}>
                          {a === 'work' ? 'Work' : 'School'}
                        </Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <View style={{ gap: 8, alignItems: 'center' }}>
                            <Text style={styles.etiquetteChamp}>From</Text>
                            <RoueHeure
                              valeur={b.fixes[a].debut}
                              changer={(v) => majFixe(a, 'debut', v)}
                              etiquette={`${a === 'work' ? 'Work' : 'School'} start`}
                              pasMinutes={15}
                            />
                          </View>
                          <View style={{ gap: 8, alignItems: 'center' }}>
                            <Text style={styles.etiquetteChamp}>Until</Text>
                            <RoueHeure
                              valeur={b.fixes[a].fin}
                              changer={(v) => majFixe(a, 'fin', v)}
                              etiquette={`${a === 'work' ? 'Work' : 'School'} end`}
                              pasMinutes={15}
                            />
                          </View>
                        </View>
                        <JoursIntro jours={b.fixes[a].jours} changer={(v) => majFixe(a, 'jours', v)} />
                      </View>
                    ))}
                </Apparaitre>
              ) : null}
              {etape === 'jour' ? (
                <ActionIntro secondaire onPress={() => aller('parametre', 0)}>
                  Adjust my commitment
                </ActionIntro>
              ) : null}
            </Animated.View>
          </PageIntro>
        ) : null}
      </Animated.View>
      <SelecteurApplications
        ouvert={selecteur}
        surFermeture={() => {
          setSelecteur(false)
          toucher('verrou')
        }}
      />
    </View>
  )
}

function questionParametre(nature: NatureIntroduction, page: number) {
  if (nature === 'tache') return page === 0 ? 'When does it need to be done?' : 'How much work is left, in total?'
  if (nature === 'objectif') return 'How much time does it get each week?'
  return page === 0 ? 'At what time?' : 'For how long, and on which days?'
}

/** Une seule question par écran, une grande roue, rien d'autre. */
function Parametre({
  b,
  page,
  maj,
}: {
  b: BrouillonIntroduction
  page: number
  maj: <K extends keyof BrouillonIntroduction>(cle: K, valeur: BrouillonIntroduction[K]) => void
}) {
  const lisible = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (b.nature === 'tache' && page === 0)
    return (
      <View style={{ gap: 14 }}>
        <RoueJour
          valeur={b.echeance}
          changer={(v) => maj('echeance', v)}
          jours={ECHEANCE_MAX_JOURS}
          etiquette="Deadline"
        />
        <Text style={styles.aideCentree}>Done by {lisible(b.echeance)}. At most a month ahead.</Text>
      </View>
    )
  if (b.nature === 'tache')
    return (
      <View style={{ gap: 14 }}>
        <RoueDuree
          minutes={b.minutes}
          changer={(v) => maj('minutes', v)}
          etiquette="Work left"
          maxHeures={150}
          pasMinutes={15}
          minimum={15}
        />
        <Text style={styles.aideCentree}>Vethos splits it into sessions and adds a safety margin.</Text>
      </View>
    )
  if (b.nature === 'objectif')
    return (
      <RoueDuree
        minutes={Math.round(b.heuresHebdo * 60)}
        changer={(v) => maj('heuresHebdo', v / 60)}
        etiquette="Time per week"
        maxHeures={100}
        pasMinutes={15}
        minimum={15}
      />
    )
  if (page === 0)
    return <RoueHeure valeur={b.heureAncre} changer={(v) => maj('heureAncre', v)} etiquette="Anchor time" />
  return (
    <View style={{ gap: 18 }}>
      <RoueDuree
        minutes={b.minutes}
        changer={(v) => maj('minutes', v)}
        etiquette="Anchor duration"
        maxHeures={8}
        minimum={15}
      />
      <JoursIntro jours={b.joursAncre} changer={(v) => maj('joursAncre', v)} />
    </View>
  )
}

/** Une carte-nature : le nom d'abord, puis pourquoi, puis ce que l'app fera. */
function CarteNature({
  nature,
  pourquoi,
  choisie,
  recommandee,
  reduit,
  delai,
  choisir,
}: {
  nature: NatureIntroduction
  pourquoi: string
  choisie: boolean
  recommandee: boolean
  reduit: boolean
  delai: number
  choisir: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${NOM_NATURE[nature]}. ${pourquoi}${recommandee ? ' Best fit.' : ''}`}
      accessibilityState={{ checked: choisie }}
      onPress={() => {
        toucher()
        choisir()
      }}
      style={({ pressed }) => ({
        padding: 16,
        gap: 12,
        borderRadius: 18,
        borderWidth: 1,
        backgroundColor: encre.surface,
        borderColor: choisie ? encre.text : 'rgba(242, 242, 242, 0.07)',
        opacity: choisie ? 1 : 0.62,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: TEINTE[nature] }} />
        <Text style={{ flex: 1, color: encre.text, fontFamily: MONO.demi, fontSize: 15, letterSpacing: 1.4 }}>
          {NOM_NATURE[nature]}
        </Text>
        {recommandee ? (
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: encre.surface3 }}>
            <Text style={{ color: encre.text, fontFamily: GEIST.moyen, fontSize: 11 }}>Best fit</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: encre.text2, fontFamily: GEIST.normal, fontSize: 14, lineHeight: 20 }}>{pourquoi}</Text>
      <MiniSemaine nature={nature} reduit={reduit} delai={delai} />
    </Pressable>
  )
}

/**
 * Ce que « protégé » veut dire, à l'écran : son iPhone. En haut, la séance
 * de son engagement ; dessous, des apps (anonymes — Apple ne dit pas
 * lesquelles). Protégé : les apps s'éteignent et se verrouillent.
 */
function EcranProtege({
  protege,
  reduit,
  nom,
  couleur,
  compte,
}: {
  protege: boolean
  reduit: boolean
  nom: string
  couleur: string
  compte?: string
}) {
  const p = useRef(new Animated.Value(protege ? 1 : 0)).current
  const arrivee = useRef(new Animated.Value(reduit ? 1 : 0)).current
  useEffect(() => {
    const a = Animated.timing(arrivee, {
      toValue: 1,
      duration: reduit ? DUREE.reduit : DUREE.ui,
      easing: SORTIE,
      useNativeDriver: true,
    })
    a.start()
    return () => a.stop()
  }, [arrivee, reduit])
  useEffect(() => {
    const a = Animated.timing(p, {
      toValue: protege ? 1 : 0,
      duration: reduit ? DUREE.reduit : DUREE.ui,
      easing: SORTIE,
      useNativeDriver: true,
    })
    a.start()
    return () => a.stop()
  }, [p, protege, reduit])
  const gris = ['#3a3a3a', '#2c2c2c', '#454545', '#333333']
  return (
    <Animated.View
      accessible
      accessibilityLabel={
        protege ? `Your phone during ${nom}: apps locked.` : `Your phone during ${nom}: every app still open.`
      }
      style={{
        alignSelf: 'center',
        width: 232,
        borderRadius: 40,
        borderWidth: 6,
        borderColor: '#1c1c1c',
        backgroundColor: '#050505',
        padding: 14,
        paddingTop: 22,
        gap: 18,
        opacity: arrivee,
        transform: [{ scale: arrivee.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }}
    >
      <View style={{ alignSelf: 'center', width: 64, height: 18, borderRadius: 9, backgroundColor: '#000' }} />
      <View
        style={{
          borderRadius: 16,
          padding: 12,
          backgroundColor: encre.surface2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: couleur }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: encre.text, fontFamily: GEIST.demi, fontSize: 13 }}>
            {nom}
          </Text>
          <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 11 }}>
            {protege ? 'Focus · protected' : 'Focus session'}
          </Text>
        </View>
        <Animated.View style={{ opacity: p }}>
          <GlypheBlocage taille={14} couleur={encre.text} />
        </Animated.View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <Animated.View
            key={i}
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              backgroundColor: gris[(i * 7) % 4],
              alignItems: 'center',
              justifyContent: 'center',
              opacity: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }),
              transform: [
                { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, reduit ? 1 : 0.9] }) },
              ],
            }}
          >
            <Animated.View style={{ opacity: p }}>
              <GlypheBlocage taille={13} couleur={encre.text} />
            </Animated.View>
          </Animated.View>
        ))}
      </View>
      <View style={{ height: 18, alignItems: 'center', justifyContent: 'center' }}>
        {compte ? (
          <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 11 }}>{compte}</Text>
        ) : (
          <View style={{ width: 80, height: 4, borderRadius: 2, backgroundColor: '#2a2a2a' }} />
        )}
      </View>
    </Animated.View>
  )
}
