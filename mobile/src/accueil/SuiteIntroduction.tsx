import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { maxTaskMinutesPerDay } from '@shared/planning/placement'
import { teinteSuivante } from '@shared/teintes'
import { useBlocage } from '@/blocage/etat'
import { SelecteurApplications } from '@/blocage/SelecteurApplications'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { GEIST, MONO } from '@/ui/primitives'

type Nature = 'tache' | 'objectif' | 'ancre'
type Etape =
  | 'choix'
  | 'definition'
  | 'nom'
  | 'parametre'
  | 'jours'
  | 'confirmation'
  | 'placement'
  | 'systeme'
  | 'protection'
  | 'sommeil'
  | 'apercu'
  | 'finale'

type OptionNature = {
  nature: Nature
  titre: string
  description: string
  terme: string
}

const NATURES: readonly OptionNature[] = [
  {
    nature: 'tache',
    titre: 'Finish something',
    description: 'Something that needs to be completed.',
    terme: 'TASK',
  },
  {
    nature: 'objectif',
    titre: 'Keep something moving',
    description: 'Something you want to keep progressing on.',
    terme: 'GOAL',
  },
  {
    nature: 'ancre',
    titre: 'Make something part of your routine',
    description: 'Something that happens repeatedly.',
    terme: 'ANCHOR',
  },
]

const ECHEANCES = [
  { etiquette: 'Tomorrow', jours: 1 },
  { etiquette: 'In 3 days', jours: 3 },
  { etiquette: 'In one week', jours: 7 },
] as const

const FREQUENCES = [
  { etiquette: 'Twice a week', fois: 2 },
  { etiquette: 'Three times a week', fois: 3 },
  { etiquette: 'Every weekday', fois: 5 },
  { etiquette: 'Every day', fois: 7 },
] as const

const HEURES = [
  { etiquette: '7:00 AM', minute: 7 * 60 },
  { etiquette: '12:00 PM', minute: 12 * 60 },
  { etiquette: '6:00 PM', minute: 18 * 60 },
  { etiquette: '9:00 PM', minute: 21 * 60 },
] as const

const GROUPES_JOURS = [
  { etiquette: 'Mon · Wed · Fri', jours: [1, 3, 5] },
  { etiquette: 'Weekdays', jours: [1, 2, 3, 4, 5] },
  { etiquette: 'Weekends', jours: [0, 6] },
  { etiquette: 'Every day', jours: [0, 1, 2, 3, 4, 5, 6] },
] as const

const SOMMEILS = [
  { etiquette: '11:00 PM — 7:00 AM', coucher: '23:00', lever: '07:00' },
  { etiquette: '12:00 AM — 8:00 AM', coucher: '00:00', lever: '08:00' },
  { etiquette: '10:30 PM — 6:30 AM', coucher: '22:30', lever: '06:30' },
] as const

const COURBE_ENTREE = Easing.bezier(0.23, 1, 0.32, 1)
const COURBE_DEPLACEMENT = Easing.bezier(0.77, 0, 0.175, 1)
// A 2x les durees, l'animation joue a environ 50 % de sa vitesse initiale.
// Les controles restent instantanes : ce facteur ne touche que la mise en scene.
const FACTEUR_RYTHME = 2
const auRythme = (millisecondes: number) => Math.round(millisecondes * FACTEUR_RYTHME)

export function SuiteIntroduction({
  mouvementReduit,
  relecture,
  terminer,
}: {
  mouvementReduit: boolean
  relecture: boolean
  terminer: () => void
}) {
  const j = useJetons()
  const donnees = useDonnees()
  const { resultat } = usePlan()
  const blocage = useBlocage()
  const [etape, setEtape] = useState<Etape>('choix')
  const [nature, setNature] = useState<Nature | null>(null)
  const [nom, setNom] = useState('')
  const [echeanceJours, setEcheanceJours] = useState<number | null>(null)
  const [frequence, setFrequence] = useState<number | null>(null)
  const [heure, setHeure] = useState<number | null>(null)
  const [jours, setJours] = useState<number[]>([])
  const [sommeil, setSommeil] = useState<(typeof SOMMEILS)[number] | null>(null)
  const [creation, setCreation] = useState<'attente' | 'encours' | 'faite' | 'erreur'>('attente')
  const [erreur, setErreur] = useState('')
  const [selecteurOuvert, setSelecteurOuvert] = useState(false)
  const cree = useRef(false)
  const modeRelecture = useRef(
    relecture || donnees.taches.length + donnees.objectifs.length + donnees.ancres.length > 0,
  ).current
  const opacite = useRef(new Animated.Value(1)).current
  const decalage = useRef(new Animated.Value(0)).current
  const transition = useRef(0)

  const optionNature = useMemo(() => NATURES.find((option) => option.nature === nature) ?? null, [nature])

  const aller = useCallback(
    (suivante: Etape, sens: 1 | -1 = 1) => {
      const id = ++transition.current
      opacite.stopAnimation()
      decalage.stopAnimation()

      const installer = () => {
        if (id !== transition.current) return
        setEtape(suivante)
        decalage.setValue(mouvementReduit ? 0 : 30 * sens)
        Animated.parallel([
          Animated.timing(opacite, {
            toValue: 1,
            duration: mouvementReduit ? 260 : auRythme(720),
            easing: COURBE_ENTREE,
            useNativeDriver: true,
          }),
          Animated.timing(decalage, {
            toValue: 0,
            duration: mouvementReduit ? 260 : auRythme(720),
            easing: COURBE_ENTREE,
            useNativeDriver: true,
          }),
        ]).start()
      }

      Animated.parallel([
        Animated.timing(opacite, {
          toValue: 0,
          duration: mouvementReduit ? 180 : auRythme(400),
          easing: COURBE_DEPLACEMENT,
          useNativeDriver: true,
        }),
        Animated.timing(decalage, {
          toValue: mouvementReduit ? 0 : -26 * sens,
          duration: mouvementReduit ? 180 : auRythme(430),
          easing: COURBE_DEPLACEMENT,
          useNativeDriver: true,
        }),
      ]).start(installer)
    },
    [decalage, mouvementReduit, opacite],
  )

  const choisirNature = (choix: Nature) => {
    setNature(choix)
    aller('definition')
  }

  const apresNom = () => {
    if (!nom.trim()) return
    aller('parametre')
  }

  const apresParametre = () => {
    if (nature === 'tache' && echeanceJours !== null) aller('confirmation')
    else if (nature === 'objectif' && frequence !== null) aller('confirmation')
    else if (nature === 'ancre' && heure !== null) aller('jours')
  }

  const enregistrer = useCallback(async () => {
    if (!nature || cree.current) return
    setCreation('encours')
    setErreur('')
    try {
      // Depuis les réglages, l'introduction reste une démonstration : elle ne
      // doit jamais dupliquer silencieusement les engagements de l'utilisateur.
      if (modeRelecture) {
        cree.current = true
        setCreation('faite')
        return
      }
      if (nature === 'tache') {
        await donnees.ajouterTache(
          {
            titre: nom.trim(),
            intention: `Finish ${nom.trim()}.`,
            echeance: dansNJours(echeanceJours ?? 7),
            importance: 5,
            minutesEstimees: 60,
            nature: 'routine',
          },
          { maxParJourMinutes: maxTaskMinutesPerDay(resultat.capacities) },
        )
      } else if (nature === 'objectif') {
        await donnees.ajouterObjectif({
          nom: nom.trim(),
          intention: `Keep making progress on ${nom.trim()}.`,
          couleur: teinteSuivante(donnees.objectifs.length),
          cibleHebdoMinutes: (frequence ?? 3) * 45,
        })
      } else {
        await donnees.ajouterAncre({
          nom: nom.trim(),
          intention: `Repeat ${nom.trim()} consistently.`,
          declencheur: nom.trim().toLowerCase(),
          couleur: j.blocAncre,
          minuteAncrage: heure ?? 18 * 60,
          jours: jours.length ? jours : [1, 3, 5],
          dureeMinutes: 60,
        })
      }
      cree.current = true
      setCreation('faite')
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Vethos could not create this yet.')
      setCreation('erreur')
    }
  }, [donnees, echeanceJours, frequence, heure, j.blocAncre, jours, modeRelecture, nature, nom, resultat.capacities])

  useEffect(() => {
    if (etape === 'confirmation') void enregistrer()
  }, [enregistrer, etape])

  const ouvrirProtection = async () => {
    if (modeRelecture) {
      aller('sommeil')
      return
    }
    if (blocage.selection) {
      aller('sommeil')
      return
    }
    if (blocage.autorisation !== 'accordee') await blocage.demanderAutorisation()
    if (blocage.simule) {
      await blocage.choisirApplications()
      aller('sommeil')
      return
    }
    setSelecteurOuvert(true)
  }

  const fermerSelecteur = () => {
    setSelecteurOuvert(false)
    if (useBlocage.getState().selection) aller('sommeil')
  }

  const confirmerSommeil = async () => {
    if (sommeil && !modeRelecture) {
      await donnees.majReglages({ coucher: sommeil.coucher, lever: sommeil.lever })
    }
    aller('apercu')
  }

  const revenir = () => {
    const precedent: Partial<Record<Etape, Etape>> = {
      definition: 'choix',
      nom: 'definition',
      parametre: 'nom',
      jours: 'parametre',
      protection: 'systeme',
      sommeil: 'protection',
    }
    const cible = precedent[etape]
    if (cible) aller(cible, -1)
  }

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: opacite,
          transform: [{ translateX: decalage }],
        }}
      >
        {etape === 'choix' ? (
          <ChoixNature mouvementReduit={mouvementReduit} choisir={choisirNature} />
        ) : null}
        {etape === 'definition' && optionNature ? (
          <DefinitionNature
            option={optionNature}
            mouvementReduit={mouvementReduit}
            continuer={() => aller('nom')}
            retour={revenir}
          />
        ) : null}
        {etape === 'nom' && nature ? (
          <QuestionNom
            nature={nature}
            valeur={nom}
            changer={setNom}
            continuer={apresNom}
            retour={revenir}
            mouvementReduit={mouvementReduit}
          />
        ) : null}
        {etape === 'parametre' && nature ? (
          <QuestionParametre
            nature={nature}
            nom={nom}
            echeance={echeanceJours}
            choisirEcheance={setEcheanceJours}
            frequence={frequence}
            choisirFrequence={setFrequence}
            heure={heure}
            choisirHeure={setHeure}
            continuer={apresParametre}
            retour={revenir}
            mouvementReduit={mouvementReduit}
          />
        ) : null}
        {etape === 'jours' ? (
          <QuestionJours
            nom={nom}
            heure={heure}
            jours={jours}
            choisir={setJours}
            continuer={() => jours.length > 0 && aller('confirmation')}
            retour={revenir}
            mouvementReduit={mouvementReduit}
          />
        ) : null}
        {etape === 'confirmation' && nature ? (
          <Confirmation
            nature={nature}
            nom={nom}
            detail={
              nature === 'tache'
                ? libelleParametre(nature, echeanceJours ?? 7)
                : nature === 'objectif'
                  ? libelleParametre(nature, frequence ?? 3)
                  : heureTexte(heure ?? 18 * 60)
            }
            sousDetail={nature === 'ancre' && jours.length ? joursTexte(jours) : undefined}
            creation={creation}
            erreur={erreur}
            continuer={() => aller('placement')}
            corriger={() => aller(nature === 'ancre' ? 'parametre' : 'nom', -1)}
            mouvementReduit={mouvementReduit}
          />
        ) : null}
        {etape === 'placement' && nature ? (
          <Placement
            nature={nature}
            nom={nom}
            heure={heure}
            mouvementReduit={mouvementReduit}
            continuer={() => aller('systeme')}
          />
        ) : null}
        {etape === 'systeme' ? (
          <RevelationSysteme
            mouvementReduit={mouvementReduit}
            continuer={() => aller('protection')}
          />
        ) : null}
        {etape === 'protection' ? (
          <Protection
            selection={blocage.selection}
            occupe={blocage.occupe}
            choisir={() => void ouvrirProtection()}
            plusTard={() => aller('sommeil')}
            retour={revenir}
            mouvementReduit={mouvementReduit}
          />
        ) : null}
        {etape === 'sommeil' ? (
          <Sommeil
            valeur={sommeil}
            choisir={setSommeil}
            continuer={() => void confirmerSommeil()}
            plusTard={() => aller('apercu')}
            retour={revenir}
            mouvementReduit={mouvementReduit}
          />
        ) : null}
        {etape === 'apercu' && nature ? (
          <ApercuFinal
            nature={nature}
            nom={nom}
            heure={heure}
            coucher={sommeil?.coucher ?? donnees.reglages.coucher}
            lever={sommeil?.lever ?? donnees.reglages.lever}
            protege={!!blocage.selection}
            mouvementReduit={mouvementReduit}
            continuer={() => aller('finale')}
          />
        ) : null}
        {etape === 'finale' ? <Finale terminer={terminer} mouvementReduit={mouvementReduit} /> : null}
      </Animated.View>

      <SelecteurApplications ouvert={selecteurOuvert} surFermeture={fermerSelecteur} />
    </View>
  )
}

function ChoixNature({ mouvementReduit, choisir }: { mouvementReduit: boolean; choisir: (nature: Nature) => void }) {
  return (
    <EcranDefilable>
      <TitreAnime texte="Let’s start with one thing that matters." mouvementReduit={mouvementReduit} />
      <View style={{ gap: PAS[3] }}>
        {NATURES.map((option, index) => (
          <Entree key={option.nature} delai={650 + index * 130} mouvementReduit={mouvementReduit}>
            <CarteChoix
              titre={option.titre}
              description={option.description}
              onPress={() => choisir(option.nature)}
            />
          </Entree>
        ))}
      </View>
    </EcranDefilable>
  )
}

function DefinitionNature({
  option,
  mouvementReduit,
  continuer,
  retour,
}: {
  option: OptionNature
  mouvementReduit: boolean
  continuer: () => void
  retour: () => void
}) {
  const j = useJetons()
  const echelle = useRef(new Animated.Value(mouvementReduit ? 1 : 0.96)).current

  useEffect(() => {
    Animated.spring(echelle, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: true,
    }).start()
    return () => echelle.stopAnimation()
  }, [echelle])

  return (
    <EcranCentre>
      <Animated.View
        style={{
          alignSelf: 'stretch',
          borderWidth: 1,
          borderColor: j.lineForte,
          borderRadius: RAYON.xl,
          backgroundColor: j.surface,
          padding: PAS[6],
          transform: [{ scale: echelle }],
        }}
      >
        <Text style={{ fontFamily: MONO.demi, fontSize: 11, letterSpacing: 1.4, color: j.accentEncre }}>
          {option.terme}
        </Text>
        <Text style={{ marginTop: PAS[3], fontFamily: GEIST.demi, fontSize: 25, lineHeight: 32, color: j.text }}>
          {option.titre}
        </Text>
        <Text style={{ marginTop: PAS[2], fontFamily: GEIST.normal, fontSize: 15, lineHeight: 22, color: j.text2 }}>
          {option.description}
        </Text>
      </Animated.View>

      <Entree delai={650} mouvementReduit={mouvementReduit}>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 20, lineHeight: 28, textAlign: 'center', color: j.text }}>
          You’re creating {article(option.nature)} {nomNature(option.nature)}.
        </Text>
      </Entree>
      <Navigation retour={retour} continuer={continuer} libelle="Continue" />
    </EcranCentre>
  )
}

function QuestionNom({
  nature,
  valeur,
  changer,
  continuer,
  retour,
  mouvementReduit,
}: {
  nature: Nature
  valeur: string
  changer: (valeur: string) => void
  continuer: () => void
  retour: () => void
  mouvementReduit: boolean
}) {
  const j = useJetons()
  const question =
    nature === 'tache'
      ? 'What needs to get done?'
      : nature === 'objectif'
        ? 'What do you want to keep moving forward?'
        : 'What do you want to repeat?'
  return (
    <EcranDefilable>
      <TitreAnime texte={question} mouvementReduit={mouvementReduit} />
      <Entree delai={620} mouvementReduit={mouvementReduit}>
        <TextInput
          autoFocus
          autoComplete="off"
          autoCorrect={false}
          accessibilityLabel={question}
          value={valeur}
          onChangeText={changer}
          onSubmitEditing={continuer}
          placeholder={nature === 'ancre' ? 'Gym, reading, meditation…' : 'Name it clearly'}
          placeholderTextColor={j.text3}
          returnKeyType="next"
          maxLength={60}
          style={champ(j)}
        />
      </Entree>
      <CarteEngagement nature={nature} nom={valeur} mouvementReduit={mouvementReduit} />
      <Navigation retour={retour} continuer={continuer} desactive={!valeur.trim()} libelle="Continue" />
    </EcranDefilable>
  )
}

function QuestionParametre({
  nature,
  nom,
  echeance,
  choisirEcheance,
  frequence,
  choisirFrequence,
  heure,
  choisirHeure,
  continuer,
  retour,
  mouvementReduit,
}: {
  nature: Nature
  nom: string
  echeance: number | null
  choisirEcheance: (valeur: number) => void
  frequence: number | null
  choisirFrequence: (valeur: number) => void
  heure: number | null
  choisirHeure: (valeur: number) => void
  continuer: () => void
  retour: () => void
  mouvementReduit: boolean
}) {
  const question =
    nature === 'tache'
      ? 'When does it need to be finished?'
      : nature === 'objectif'
        ? 'How often do you want to make progress?'
        : 'When does it happen?'
  const options =
    nature === 'tache'
      ? ECHEANCES.map((o) => ({ etiquette: o.etiquette, valeur: o.jours }))
      : nature === 'objectif'
        ? FREQUENCES.map((o) => ({ etiquette: o.etiquette, valeur: o.fois }))
        : HEURES.map((o) => ({ etiquette: o.etiquette, valeur: o.minute }))
  const valeur = nature === 'tache' ? echeance : nature === 'objectif' ? frequence : heure
  const choisir = nature === 'tache' ? choisirEcheance : nature === 'objectif' ? choisirFrequence : choisirHeure

  return (
    <EcranDefilable>
      <TitreAnime texte={question} mouvementReduit={mouvementReduit} />
      <View style={{ gap: PAS[2] }}>
        {options.map((option, index) => (
          <Entree key={option.etiquette} delai={620 + index * 110} mouvementReduit={mouvementReduit}>
            <Option
              etiquette={option.etiquette}
              selectionnee={valeur === option.valeur}
              onPress={() => choisir(option.valeur)}
            />
          </Entree>
        ))}
      </View>
      <CarteEngagement
        nature={nature}
        nom={nom}
        detail={valeur === null ? undefined : libelleParametre(nature, valeur)}
        mouvementReduit={mouvementReduit}
      />
      <Navigation retour={retour} continuer={continuer} desactive={valeur === null} libelle="Continue" />
    </EcranDefilable>
  )
}

function QuestionJours({
  nom,
  heure,
  jours,
  choisir,
  continuer,
  retour,
  mouvementReduit,
}: {
  nom: string
  heure: number | null
  jours: number[]
  choisir: (jours: number[]) => void
  continuer: () => void
  retour: () => void
  mouvementReduit: boolean
}) {
  return (
    <EcranDefilable>
      <TitreAnime texte="Which days?" mouvementReduit={mouvementReduit} />
      <View style={{ gap: PAS[2] }}>
        {GROUPES_JOURS.map((option, index) => (
          <Entree key={option.etiquette} delai={620 + index * 110} mouvementReduit={mouvementReduit}>
            <Option
              etiquette={option.etiquette}
              selectionnee={memesJours(jours, option.jours)}
              onPress={() => choisir([...option.jours])}
            />
          </Entree>
        ))}
      </View>
      <CarteEngagement
        nature="ancre"
        nom={nom}
        detail={heure === null ? undefined : heureTexte(heure)}
        sousDetail={jours.length ? joursTexte(jours) : undefined}
        mouvementReduit={mouvementReduit}
      />
      <Navigation retour={retour} continuer={continuer} desactive={jours.length === 0} libelle="Create Anchor" />
    </EcranDefilable>
  )
}

function Confirmation({
  nature,
  nom,
  detail,
  sousDetail,
  creation,
  erreur,
  continuer,
  corriger,
  mouvementReduit,
}: {
  nature: Nature
  nom: string
  detail: string
  sousDetail?: string
  creation: 'attente' | 'encours' | 'faite' | 'erreur'
  erreur: string
  continuer: () => void
  corriger: () => void
  mouvementReduit: boolean
}) {
  const j = useJetons()
  return (
    <EcranCentre>
      <TitreAnime texte="That’s enough." mouvementReduit={mouvementReduit} centre />
      <Entree delai={1000} mouvementReduit={mouvementReduit}>
        <Text style={{ fontFamily: GEIST.normal, fontSize: 21, lineHeight: 29, textAlign: 'center', color: j.text2 }}>
          Vethos can work with this.
        </Text>
      </Entree>
      <CarteEngagement
        nature={nature}
        nom={nom}
        detail={detail}
        sousDetail={sousDetail}
        mouvementReduit={mouvementReduit}
        complete
      />
      {creation === 'erreur' ? (
        <View style={{ gap: PAS[3] }}>
          <Text accessibilityRole="alert" style={{ color: j.accentEncre, fontFamily: GEIST.normal, fontSize: 13, textAlign: 'center' }}>
            {erreur}
          </Text>
          <Navigation continuer={corriger} libelle="Adjust it" />
        </View>
      ) : (
        <Navigation
          continuer={continuer}
          desactive={creation !== 'faite'}
          libelle={creation === 'faite' ? 'Show me' : 'Building…'}
        />
      )}
    </EcranCentre>
  )
}

function Placement({
  nature,
  nom,
  heure,
  mouvementReduit,
  continuer,
}: {
  nature: Nature
  nom: string
  heure: number | null
  mouvementReduit: boolean
  continuer: () => void
}) {
  const j = useJetons()
  return (
    <EcranCentre>
      <TexteMots texte="This changes your day." mouvementReduit={mouvementReduit} centre />
      <Timeline nature={nature} nom={nom} heure={heure} mouvementReduit={mouvementReduit} />
      <Text style={{ fontFamily: GEIST.normal, fontSize: 14, lineHeight: 21, color: j.text3, textAlign: 'center' }}>
        Vethos places the commitment where it can actually happen.
      </Text>
      <Navigation continuer={continuer} libelle="Continue" />
    </EcranCentre>
  )
}

function RevelationSysteme({ mouvementReduit, continuer }: { mouvementReduit: boolean; continuer: () => void }) {
  const j = useJetons()
  const chaine = ['Commitment', 'Plan', 'Protected time', 'Done']
  return (
    <EcranCentre>
      <TitreAnime texte="You set the commitment." mouvementReduit={mouvementReduit} centre />
      <Entree delai={950} mouvementReduit={mouvementReduit}>
        <Text style={{ fontFamily: GEIST.normal, fontSize: 21, lineHeight: 29, color: j.text2, textAlign: 'center' }}>
          Vethos builds around it.
        </Text>
      </Entree>
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
        {chaine.map((mot, index) => (
          <Entree key={mot} delai={1500 + index * 320} mouvementReduit={mouvementReduit} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontFamily: MONO.demi, fontSize: 12, color: index === chaine.length - 1 ? j.text : j.text2 }}>
              {mot}
            </Text>
            {index < chaine.length - 1 ? (
              <Text style={{ fontFamily: MONO.normal, fontSize: 12, color: j.accentEncre, marginHorizontal: PAS[2] }}>→</Text>
            ) : null}
          </Entree>
        ))}
      </View>
      <Navigation continuer={continuer} libelle="Protect it" />
    </EcranCentre>
  )
}

function Protection({
  selection,
  occupe,
  choisir,
  plusTard,
  retour,
  mouvementReduit,
}: {
  selection: { nbApplications: number; nbCategories: number } | null
  occupe: boolean
  choisir: () => void
  plusTard: () => void
  retour: () => void
  mouvementReduit: boolean
}) {
  const j = useJetons()
  return (
    <EcranDefilable>
      <TitreAnime
        texte="What tends to pull you away when you’re supposed to be focused?"
        mouvementReduit={mouvementReduit}
      />
      <Entree delai={850} mouvementReduit={mouvementReduit}>
        <View style={{ borderLeftWidth: 2, borderLeftColor: j.accent, paddingLeft: PAS[4], gap: PAS[2] }}>
          <Text style={{ fontFamily: GEIST.moyen, fontSize: 16, color: j.text }}>Protect the time, not the entire phone.</Text>
          <Text style={{ fontFamily: GEIST.normal, fontSize: 13.5, lineHeight: 20, color: j.text2 }}>
            Vethos only shields what you choose, and only while you’re working on a commitment.
          </Text>
        </View>
      </Entree>
      {selection ? (
        <CarteStatut>{selection.nbApplications} apps · {selection.nbCategories} categories protected</CarteStatut>
      ) : null}
      <View style={{ gap: PAS[2] }}>
        <BoutonPrincipal onPress={choisir} desactive={occupe}>
          {occupe ? 'Opening Screen Time…' : selection ? 'Continue with this selection' : 'Choose distractions'}
        </BoutonPrincipal>
        <BoutonTexte onPress={plusTard}>I’ll do this later</BoutonTexte>
      </View>
      <Retour onPress={retour} />
    </EcranDefilable>
  )
}

function Sommeil({
  valeur,
  choisir,
  continuer,
  plusTard,
  retour,
  mouvementReduit,
}: {
  valeur: (typeof SOMMEILS)[number] | null
  choisir: (valeur: (typeof SOMMEILS)[number]) => void
  continuer: () => void
  plusTard: () => void
  retour: () => void
  mouvementReduit: boolean
}) {
  const j = useJetons()
  return (
    <EcranDefilable>
      <TitreAnime texte="When should Vethos leave your time alone?" mouvementReduit={mouvementReduit} />
      <Text style={{ fontFamily: GEIST.normal, fontSize: 14, lineHeight: 21, color: j.text2 }}>
        Start with sleep. Classes, work and commute can be added from My Time when you need them.
      </Text>
      <View style={{ gap: PAS[2] }}>
        {SOMMEILS.map((option, index) => (
          <Entree key={option.etiquette} delai={650 + index * 120} mouvementReduit={mouvementReduit}>
            <Option etiquette={option.etiquette} selectionnee={valeur?.etiquette === option.etiquette} onPress={() => choisir(option)} />
          </Entree>
        ))}
      </View>
      <View style={{ gap: PAS[2] }}>
        <BoutonPrincipal onPress={continuer} desactive={!valeur}>Use these hours</BoutonPrincipal>
        <BoutonTexte onPress={plusTard}>Keep my current hours</BoutonTexte>
      </View>
      <Retour onPress={retour} />
    </EcranDefilable>
  )
}

function ApercuFinal({
  nature,
  nom,
  heure,
  coucher,
  lever,
  protege,
  mouvementReduit,
  continuer,
}: {
  nature: Nature
  nom: string
  heure: number | null
  coucher: string
  lever: string
  protege: boolean
  mouvementReduit: boolean
  continuer: () => void
}) {
  const j = useJetons()
  return (
    <EcranDefilable>
      <TitreAnime texte="Your first Vethos day." mouvementReduit={mouvementReduit} />
      <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: j.line, paddingVertical: PAS[5], gap: PAS[4] }}>
        <LigneApercu heure={lever} titre="Your time begins" ton="doux" />
        <LigneApercu heure={nature === 'ancre' && heure !== null ? heureTexte(heure) : 'Planned'} titre={nom} ton="fort" />
        {protege ? <LigneApercu heure="During focus" titre="Distractions protected" ton="accent" /> : null}
        <LigneApercu heure={coucher} titre="Vethos leaves you alone" ton="doux" />
      </View>
      <Text style={{ fontFamily: GEIST.normal, fontSize: 14, lineHeight: 21, color: j.text3 }}>
        One commitment is enough for Vethos to start building around what matters.
      </Text>
      <Navigation continuer={continuer} libelle="Continue" />
    </EcranDefilable>
  )
}

function Finale({ terminer, mouvementReduit }: { terminer: () => void; mouvementReduit: boolean }) {
  const j = useJetons()
  return (
    <EcranCentre>
      <TitreAnime texte="You’ve made the decision." mouvementReduit={mouvementReduit} centre />
      <Entree delai={1050} mouvementReduit={mouvementReduit}>
        <Text style={{ maxWidth: 330, fontFamily: GEIST.normal, fontSize: 21, lineHeight: 30, color: j.text2, textAlign: 'center' }}>
          Now Vethos can help you protect it.
        </Text>
      </Entree>
      <Entree delai={1900} mouvementReduit={mouvementReduit} style={{ alignSelf: 'stretch' }}>
        <BoutonPrincipal onPress={terminer}>Enter Vethos</BoutonPrincipal>
      </Entree>
    </EcranCentre>
  )
}

function EcranDefilable({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: PAS[6], paddingVertical: PAS[5], gap: PAS[6] }}
    >
      {children}
    </ScrollView>
  )
}

function EcranCentre({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: PAS[6], paddingVertical: PAS[5], gap: PAS[6] }}>{children}</View>
}

function TitreAnime({ texte, mouvementReduit, centre }: { texte: string; mouvementReduit: boolean; centre?: boolean }) {
  return (
    <View style={{ maxWidth: centre ? 360 : 345, alignSelf: centre ? 'center' : 'auto' }}>
      <TexteMots texte={texte} mouvementReduit={mouvementReduit} centre={centre} taille={30} />
    </View>
  )
}

function TexteMots({
  texte,
  mouvementReduit,
  centre,
  taille = 30,
}: {
  texte: string
  mouvementReduit: boolean
  centre?: boolean
  taille?: number
}) {
  const j = useJetons()
  const progression = useRef(new Animated.Value(mouvementReduit ? 1 : 0)).current
  const mots = texte.split(' ')

  useEffect(() => {
    progression.setValue(mouvementReduit ? 1 : 0)
    Animated.timing(progression, {
      toValue: 1,
      duration: mouvementReduit ? 240 : auRythme(1250),
      // Le texte progressif doit garder une cadence lisible jusqu'au dernier
      // mot ; ease-out donnait l'impression que tout arrivait d'un coup.
      easing: Easing.linear,
      useNativeDriver: true,
    }).start()
    return () => progression.stopAnimation()
  }, [mouvementReduit, progression])

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={texte}
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: centre ? 'center' : 'flex-start' }}
    >
      {mots.map((mot, index) => {
        const depart = (index / Math.max(mots.length - 1, 1)) * 0.58
        const fin = Math.min(depart + 0.28, 1)
        const opacite = progression.interpolate({ inputRange: [depart, fin], outputRange: [0, 1], extrapolate: 'clamp' })
        return (
          <Animated.Text
            key={`${mot}-${index}`}
            accessible={false}
            style={{
              marginRight: index === mots.length - 1 ? 0 : 8,
              fontFamily: GEIST.demi,
              fontSize: taille,
              lineHeight: taille * 1.22,
              letterSpacing: -0.8,
              color: j.text,
              opacity: opacite,
              transform: [
                {
                  translateY: opacite.interpolate({
                    inputRange: [0, 1],
                    outputRange: [mouvementReduit ? 0 : 9, 0],
                  }),
                },
              ],
            }}
          >
            {mot}
          </Animated.Text>
        )
      })}
    </View>
  )
}

function Entree({
  children,
  delai,
  mouvementReduit,
  style,
}: {
  children: ReactNode
  delai: number
  mouvementReduit: boolean
  style?: StyleProp<ViewStyle>
}) {
  const valeur = useRef(new Animated.Value(mouvementReduit ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(valeur, {
      toValue: 1,
      delay: mouvementReduit ? 0 : auRythme(delai),
      duration: mouvementReduit ? 220 : auRythme(520),
      easing: COURBE_ENTREE,
      useNativeDriver: true,
    }).start()
    return () => valeur.stopAnimation()
  }, [delai, mouvementReduit, valeur])
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: valeur,
          transform: [
            { translateY: valeur.interpolate({ inputRange: [0, 1], outputRange: [mouvementReduit ? 0 : 10, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

function CarteChoix({ titre, description, onPress }: { titre: string; description: string; onPress: () => void }) {
  const j = useJetons()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 92,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: pressed ? j.text : j.lineForte,
        borderRadius: RAYON.xl,
        paddingHorizontal: PAS[5],
        backgroundColor: pressed ? j.surface2 : j.surface,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Text style={{ fontFamily: GEIST.demi, fontSize: 18, color: j.text }}>{titre}</Text>
      <Text style={{ marginTop: PAS[1], fontFamily: GEIST.normal, fontSize: 13.5, lineHeight: 20, color: j.text2 }}>{description}</Text>
    </Pressable>
  )
}

function CarteEngagement({
  nature,
  nom,
  detail,
  sousDetail,
  mouvementReduit,
  complete,
}: {
  nature: Nature
  nom: string
  detail?: string
  sousDetail?: string
  mouvementReduit: boolean
  complete?: boolean
}) {
  const j = useJetons()
  return (
    <Entree delai={complete ? 1500 : 850} mouvementReduit={mouvementReduit}>
      <View style={{ borderWidth: 1, borderColor: j.line, borderRadius: RAYON.md, backgroundColor: j.surface, padding: PAS[4], gap: PAS[2] }}>
        <Text style={{ fontFamily: MONO.demi, fontSize: 10.5, letterSpacing: 1.2, color: j.accentEncre }}>{termeNature(nature)}</Text>
        <Text style={{ fontFamily: GEIST.demi, fontSize: 19, color: nom.trim() ? j.text : j.text3 }}>{nom.trim() || 'Your commitment'}</Text>
        {detail ? <PieceCarte texte={detail} mouvementReduit={mouvementReduit} /> : null}
        {sousDetail ? <PieceCarte texte={sousDetail} mouvementReduit={mouvementReduit} /> : null}
      </View>
    </Entree>
  )
}

function PieceCarte({ texte, mouvementReduit }: { texte: string; mouvementReduit: boolean }) {
  const j = useJetons()
  return (
    <Entree delai={0} mouvementReduit={mouvementReduit}>
      <Text style={{ fontFamily: MONO.normal, fontSize: 12, color: j.text2 }}>{texte}</Text>
    </Entree>
  )
}

function Timeline({ nature, nom, heure, mouvementReduit }: { nature: Nature; nom: string; heure: number | null; mouvementReduit: boolean }) {
  const j = useJetons()
  const arrivee = useRef(new Animated.Value(mouvementReduit ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(arrivee, {
      toValue: 1,
      delay: mouvementReduit ? 0 : auRythme(850),
      duration: mouvementReduit ? 240 : auRythme(1400),
      easing: COURBE_DEPLACEMENT,
      useNativeDriver: true,
    }).start()
    return () => arrivee.stopAnimation()
  }, [arrivee, mouvementReduit])
  return (
    <View style={{ alignSelf: 'stretch', minHeight: 220, borderLeftWidth: 1, borderLeftColor: j.line, marginLeft: PAS[10], paddingLeft: PAS[5], justifyContent: 'space-around' }}>
      {['8:00 AM', '12:00 PM', '6:00 PM', '10:00 PM'].map((temps) => (
        <Text key={temps} style={{ position: 'relative', fontFamily: MONO.normal, fontSize: 10, color: j.text3 }}>{temps}</Text>
      ))}
      <Animated.View
        style={{
          position: 'absolute',
          left: PAS[4],
          right: 0,
          top: nature === 'ancre' ? 126 : nature === 'objectif' ? 78 : 54,
          borderLeftWidth: 2,
          borderLeftColor: j.accent,
          backgroundColor: j.surface2,
          padding: PAS[3],
          opacity: arrivee,
          transform: [
            { translateY: arrivee.interpolate({ inputRange: [0, 1], outputRange: [mouvementReduit ? 0 : -72, 0] }) },
            { scale: arrivee.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
          ],
        }}
      >
        <Text style={{ fontFamily: GEIST.demi, fontSize: 14, color: j.text }}>{nom}</Text>
        <Text style={{ marginTop: 2, fontFamily: MONO.normal, fontSize: 10.5, color: j.text2 }}>
          {nature === 'ancre' && heure !== null ? heureTexte(heure) : nature === 'objectif' ? 'progress block' : 'planned session'}
        </Text>
      </Animated.View>
    </View>
  )
}

function Option({ etiquette, selectionnee, onPress }: { etiquette: string; selectionnee: boolean; onPress: () => void }) {
  const j = useJetons()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selectionnee }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 54,
        justifyContent: 'center',
        paddingHorizontal: PAS[4],
        borderWidth: 1,
        borderColor: selectionnee ? j.text : j.lineForte,
        borderRadius: RAYON.xl,
        backgroundColor: selectionnee ? j.text : j.champBg,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Text style={{ fontFamily: selectionnee ? GEIST.demi : GEIST.normal, fontSize: 15, color: selectionnee ? j.surface : j.text, textAlign: 'center' }}>{etiquette}</Text>
    </Pressable>
  )
}

function Navigation({
  retour,
  continuer,
  desactive,
  libelle,
}: {
  retour?: () => void
  continuer: () => void
  desactive?: boolean
  libelle: string
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[3], marginTop: PAS[2] }}>
      {retour ? <Retour onPress={retour} /> : null}
      <View style={{ flex: 1 }}>
        <BoutonPrincipal onPress={continuer} desactive={desactive}>{libelle}</BoutonPrincipal>
      </View>
    </View>
  )
}

function Retour({ onPress }: { onPress: () => void }) {
  const j = useJetons()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minWidth: 64, minHeight: 52, justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
      <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: j.text2 }}>Back</Text>
    </Pressable>
  )
}

function BoutonPrincipal({ children, onPress, desactive }: { children: ReactNode; onPress: () => void; desactive?: boolean }) {
  const j = useJetons()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive }}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 54,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: j.text,
        borderWidth: 1,
        borderColor: j.text,
        borderBottomWidth: 2,
        borderBottomColor: j.accent,
        borderRadius: RAYON.xl,
        opacity: desactive ? 0.3 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Text style={{ fontFamily: GEIST.demi, fontSize: 15, color: j.surface }}>{children}</Text>
    </Pressable>
  )
}

function BoutonTexte({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const j = useJetons()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minHeight: 46, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
      <Text style={{ fontFamily: GEIST.moyen, fontSize: 13.5, color: j.text3 }}>{children}</Text>
    </Pressable>
  )
}

function CarteStatut({ children }: { children: ReactNode }) {
  const j = useJetons()
  return (
    <View style={{ minHeight: 52, justifyContent: 'center', borderWidth: 1, borderColor: j.line, borderLeftWidth: 2, borderLeftColor: j.accent, paddingHorizontal: PAS[4], backgroundColor: j.surface }}>
      <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: j.text }}>{children}</Text>
    </View>
  )
}

function LigneApercu({ heure, titre, ton }: { heure: string; titre: string; ton: 'doux' | 'fort' | 'accent' }) {
  const j = useJetons()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: PAS[4] }}>
      <Text style={{ width: 86, fontFamily: MONO.normal, fontSize: 11, color: ton === 'accent' ? j.accentEncre : j.text3 }}>{heure}</Text>
      <Text style={{ flex: 1, fontFamily: ton === 'fort' ? GEIST.demi : GEIST.normal, fontSize: 14, color: ton === 'doux' ? j.text2 : j.text }}>{titre}</Text>
    </View>
  )
}

function champ(j: ReturnType<typeof useJetons>) {
  return {
    minHeight: 58,
    backgroundColor: j.champBg,
    borderWidth: 1,
    borderColor: j.lineForte,
    borderRadius: RAYON.xl,
    paddingHorizontal: PAS[5],
    paddingVertical: PAS[4],
    fontFamily: GEIST.moyen,
    fontSize: 18,
    color: j.text,
  } as const
}

function nomNature(nature: Nature) {
  return nature === 'tache' ? 'Task' : nature === 'objectif' ? 'Goal' : 'Anchor'
}

function termeNature(nature: Nature) {
  return nomNature(nature).toUpperCase()
}

function article(nature: Nature) {
  return nature === 'ancre' ? 'an' : 'a'
}

function libelleParametre(nature: Nature, valeur: number) {
  if (nature === 'tache') return ECHEANCES.find((option) => option.jours === valeur)?.etiquette ?? `${valeur} days`
  if (nature === 'objectif') return FREQUENCES.find((option) => option.fois === valeur)?.etiquette ?? `${valeur}× / week`
  return heureTexte(valeur)
}

function heureTexte(minute: number) {
  const heures = Math.floor(minute / 60)
  const minutes = minute % 60
  const suffixe = heures >= 12 ? 'PM' : 'AM'
  const heure12 = heures % 12 || 12
  return `${heure12}:${String(minutes).padStart(2, '0')} ${suffixe}`
}

function joursTexte(jours: readonly number[]) {
  const noms = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return jours.map((jour) => noms[jour]).join(' · ')
}

function memesJours(a: readonly number[], b: readonly number[]) {
  return a.length === b.length && a.every((jour, index) => jour === b[index])
}

function dansNJours(jours: number) {
  const date = new Date()
  date.setDate(date.getDate() + jours)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
