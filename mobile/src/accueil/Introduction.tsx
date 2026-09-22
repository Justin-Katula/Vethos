import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useDonnees } from '@/donnees/magasin'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { FondRoutage } from '@/ui/MouvementVethos'
import { GEIST } from '@/ui/primitives'
import { SuiteIntroduction } from './SuiteIntroduction'

type Etape =
  | 'prenom'
  | 'priorite'
  | 'frequence'
  | 'silence'
  | 'constat'
  | 'consequence'
  | 'pensee'
  | 'suite'

type Priorite = 'school' | 'work' | 'project' | 'health' | 'discipline' | 'other'
type Frequence = 'daily' | 'weekly' | 'sometimes' | 'rarely'

const ETAPES_QUESTIONS: Etape[] = ['prenom', 'priorite', 'frequence']

const PRIORITES: ReadonlyArray<{ valeur: Priorite; etiquette: string }> = [
  { valeur: 'school', etiquette: 'School' },
  { valeur: 'work', etiquette: 'Work' },
  { valeur: 'project', etiquette: 'Project' },
  { valeur: 'health', etiquette: 'Health' },
  { valeur: 'discipline', etiquette: 'Discipline' },
  { valeur: 'other', etiquette: 'Something else' },
]

const FREQUENCES: ReadonlyArray<{ valeur: Frequence; etiquette: string }> = [
  { valeur: 'daily', etiquette: 'Almost every day' },
  { valeur: 'weekly', etiquette: 'A few times a week' },
  { valeur: 'sometimes', etiquette: 'Sometimes' },
  { valeur: 'rarely', etiquette: 'Rarely' },
]

const CONSEQUENCES: Record<Priorite, string> = {
  school: 'The work that could already be finished.',
  work: 'The work that could already be finished.',
  project: 'The progress you could already have made.',
  health: 'The progress you could already have made.',
  discipline: 'The things that could already be behind you.',
  other: 'The things that could already be behind you.',
}

const COURBE_ENTREE = Easing.bezier(0.23, 1, 0.32, 1)
const COURBE_DEPLACEMENT = Easing.bezier(0.77, 0, 0.175, 1)
// L'onboarding est une experience rare et explicative : a la demande du
// Apres essai sur appareil, le rythme est environ 15 % plus vif que la version
// "50 %" : toujours contemplatif, sans donner l'impression d'attendre.
const FACTEUR_RYTHME = 1.72
const FACTEUR_LETTRES = 2.25
const auRythme = (millisecondes: number) => Math.round(millisecondes * FACTEUR_RYTHME)
const auRythmeDesLettres = (millisecondes: number) =>
  Math.round(millisecondes * FACTEUR_LETTRES)

/**
 * Le premier lancement part de ce que la personne sait deja, laisse un silence,
 * puis lui renvoie le cout du report. Les trois questions gardent des controles
 * explicites ; la sequence de constatation avance seule pour rester un mouvement.
 */
export function Introduction() {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const { reglages, majReglages, chargees } = useDonnees()
  const [etape, setEtape] = useState<Etape>('prenom')
  const [nom, setNom] = useState(reglages.prenom)
  const [priorite, setPriorite] = useState<Priorite | null>(null)
  const [prioriteLibre, setPrioriteLibre] = useState('')
  const [frequence, setFrequence] = useState<Frequence | null>(null)
  const [mouvementReduit, setMouvementReduit] = useState(false)
  const opacite = useRef(new Animated.Value(1)).current
  const decalageX = useRef(new Animated.Value(0)).current
  const decalageY = useRef(new Animated.Value(0)).current
  const transitionEnCours = useRef(false)
  const prenomHydrate = useRef(false)
  const introductionDejaTerminee = useRef(reglages.introductionFaite)

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setMouvementReduit)
    const abonnement = AccessibilityInfo.addEventListener('reduceMotionChanged', setMouvementReduit)
    return () => abonnement.remove()
  }, [])

  // Une seule hydratation. Avant, `nom === ''` relancait cette copie a chaque
  // effacement et le prenom sauvegarde se reecrivait sous les doigts.
  useEffect(() => {
    if (!chargees) return
    if (reglages.introductionFaite) introductionDejaTerminee.current = true
    if (!prenomHydrate.current) {
      prenomHydrate.current = true
      setNom(reglages.prenom)
    }
    if (!reglages.introductionFaite) return
    setNom(reglages.prenom)
    setEtape('prenom')
    setPriorite(null)
    setPrioriteLibre('')
    setFrequence(null)
    opacite.setValue(1)
    decalageX.setValue(0)
    decalageY.setValue(0)
    transitionEnCours.current = false
  }, [chargees, decalageX, decalageY, opacite, reglages.introductionFaite, reglages.prenom])

  const changerEtape = useCallback(
    (suivante: Etape, sens: 1 | -1 = 1, axe: 'horizontal' | 'vertical' = 'horizontal') => {
      if (transitionEnCours.current) return
      transitionEnCours.current = true
      Keyboard.dismiss()

      if (mouvementReduit) {
        Animated.timing(opacite, {
          toValue: 0,
          duration: 180,
          easing: COURBE_ENTREE,
          useNativeDriver: true,
        }).start(() => {
          setEtape(suivante)
          Animated.timing(opacite, {
            toValue: 1,
            duration: 260,
            easing: COURBE_ENTREE,
            useNativeDriver: true,
          }).start(() => {
            transitionEnCours.current = false
          })
        })
        return
      }

      const sortX = axe === 'horizontal' ? -22 * sens : 0
      const sortY = axe === 'vertical' ? -12 * sens : 0
      Animated.parallel([
        Animated.timing(opacite, {
          toValue: 0,
          duration: auRythme(380),
          easing: COURBE_DEPLACEMENT,
          useNativeDriver: true,
        }),
        Animated.timing(decalageX, {
          toValue: sortX,
          duration: auRythme(420),
          easing: COURBE_DEPLACEMENT,
          useNativeDriver: true,
        }),
        Animated.timing(decalageY, {
          toValue: sortY,
          duration: auRythme(420),
          easing: COURBE_DEPLACEMENT,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setEtape(suivante)
        decalageX.setValue(axe === 'horizontal' ? 26 * sens : 0)
        decalageY.setValue(axe === 'vertical' ? 14 * sens : 0)
        Animated.parallel([
          Animated.timing(opacite, {
            toValue: 1,
            duration: auRythme(700),
            easing: COURBE_ENTREE,
            useNativeDriver: true,
          }),
          Animated.timing(decalageX, {
            toValue: 0,
            duration: auRythme(700),
            easing: COURBE_ENTREE,
            useNativeDriver: true,
          }),
          Animated.timing(decalageY, {
            toValue: 0,
            duration: auRythme(700),
            easing: COURBE_ENTREE,
            useNativeDriver: true,
          }),
        ]).start(() => {
          transitionEnCours.current = false
        })
      })
    },
    [decalageX, decalageY, mouvementReduit, opacite],
  )

  useEffect(() => {
    if (etape === 'silence') {
      const t = setTimeout(() => changerEtape('constat', 1, 'vertical'), mouvementReduit ? 500 : auRythme(2100))
      return () => clearTimeout(t)
    }
    if (etape === 'constat') {
      const t = setTimeout(() => changerEtape('consequence', 1, 'vertical'), mouvementReduit ? 1200 : auRythme(2800))
      return () => clearTimeout(t)
    }
    if (etape === 'consequence') {
      const t = setTimeout(() => changerEtape('pensee', 1, 'vertical'), mouvementReduit ? 1800 : auRythme(4100))
      return () => clearTimeout(t)
    }
    return undefined
  }, [changerEtape, etape, mouvementReduit])

  if (!chargees || reglages.introductionFaite) return null

  const rangQuestion = ETAPES_QUESTIONS.indexOf(etape)
  const estQuestion = rangQuestion !== -1
  const nomPropre = nom.trim()
  const prioriteValide = priorite !== null && (priorite !== 'other' || prioriteLibre.trim().length > 0)
  const consequence = priorite ? CONSEQUENCES[priorite] : CONSEQUENCES.other

  const continuer = () => {
    if (etape === 'prenom' && nomPropre) changerEtape('priorite', 1, 'horizontal')
    else if (etape === 'priorite' && prioriteValide) changerEtape('frequence', 1, 'horizontal')
    else if (etape === 'frequence' && frequence) changerEtape('silence', 1, 'vertical')
  }

  const retour = () => {
    if (etape === 'priorite') changerEtape('prenom', -1, 'horizontal')
    else if (etape === 'frequence') changerEtape('priorite', -1, 'horizontal')
  }

  const terminer = () => {
    void majReglages({ prenom: nomPropre, introductionFaite: true })
  }

  const continuerDesactive =
    (etape === 'prenom' && !nomPropre) ||
    (etape === 'priorite' && !prioriteValide) ||
    (etape === 'frequence' && !frequence)

  return (
    <Modal visible animationType="fade" onRequestClose={() => undefined} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: j.bg }}
      >
        <View
          style={{
            flex: 1,
            paddingTop: marges.top + PAS[3],
            paddingBottom: marges.bottom + PAS[5],
          }}
        >
          <FondRoutage intensite="faible" />
          {estQuestion ? <EnteteQuestion rang={rangQuestion} /> : null}

          <Animated.View
            style={{
              flex: 1,
              opacity: opacite,
              transform: [{ translateX: decalageX }, { translateY: decalageY }],
            }}
          >
            {etape === 'prenom' ? (
              <EcranPrenom
                nom={nom}
                setNom={setNom}
                onSubmit={continuer}
                mouvementReduit={mouvementReduit}
              />
            ) : null}
            {etape === 'priorite' ? (
              <EcranPriorite
                valeur={priorite}
                setValeur={setPriorite}
                valeurLibre={prioriteLibre}
                setValeurLibre={setPrioriteLibre}
                mouvementReduit={mouvementReduit}
              />
            ) : null}
            {etape === 'frequence' ? (
              <EcranFrequence
                valeur={frequence}
                setValeur={setFrequence}
                mouvementReduit={mouvementReduit}
              />
            ) : null}
            {etape === 'silence' ? <Silence mouvementReduit={mouvementReduit} /> : null}
            {etape === 'constat' ? <Constat /> : null}
            {etape === 'consequence' ? <Consequence texte={consequence} /> : null}
            {etape === 'pensee' ? (
              <Pensee
                mouvementReduit={mouvementReduit}
                terminer={() => changerEtape('suite', 1, 'vertical')}
              />
            ) : null}
            {etape === 'suite' ? (
              <SuiteIntroduction
                mouvementReduit={mouvementReduit}
                relecture={introductionDejaTerminee.current}
                terminer={terminer}
              />
            ) : null}
          </Animated.View>

          {estQuestion ? (
            <Navigation
              retour={rangQuestion > 0 ? retour : undefined}
              continuer={continuer}
              desactive={continuerDesactive}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function EnteteQuestion({ rang }: { rang: number }) {
  const j = useJetons()
  return (
    <View
      style={{
        height: 44 + PAS[4],
        paddingHorizontal: PAS[6],
        flexDirection: 'row',
        alignItems: 'center',
        gap: PAS[3],
      }}
    >
      <Text style={{ fontFamily: GEIST.demi, fontSize: 11, color: j.text3 }}>0{rang + 1} / 03</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: j.line }}>
        <View
          style={{
            width: `${((rang + 1) / ETAPES_QUESTIONS.length) * 100}%`,
            height: 1,
            backgroundColor: j.text,
          }}
        />
      </View>
    </View>
  )
}

function CadreQuestion({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: PAS[6] }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: PAS[8] }}>{children}</View>
    </ScrollView>
  )
}

function TitreQuestion({ texte, mouvementReduit }: { texte: string; mouvementReduit: boolean }) {
  const j = useJetons()
  return (
    <View style={{ maxWidth: 330 }}>
      <TexteLettres
        texte={texte}
        mouvementReduit={mouvementReduit}
        style={{
          fontFamily: GEIST.demi,
          fontSize: 31,
          lineHeight: 37,
          letterSpacing: -0.9,
          color: j.text,
        }}
      />
    </View>
  )
}

/**
 * Une seule valeur anime toutes les lettres : le moteur natif interpole leur
 * decalage sans creer un minuteur JavaScript par caractere. Les mots restent
 * des groupes, donc aucun retour a la ligne ne coupe un mot en deux.
 */
function TexteLettres({
  texte,
  mouvementReduit,
  style,
}: {
  texte: string
  mouvementReduit: boolean
  style: StyleProp<TextStyle>
}) {
  const progression = useRef(new Animated.Value(mouvementReduit ? 1 : 0)).current
  const mots = texte.split(' ')
  let position = 0
  const groupes = mots.map((mot) => {
    const debut = position
    position += mot.length + 1
    return { mot, debut }
  })
  const longueur = Math.max(texte.length - 1, 1)

  useEffect(() => {
    progression.setValue(mouvementReduit ? 1 : 0)
    Animated.timing(progression, {
      toValue: 1,
      duration: mouvementReduit ? 220 : auRythmeDesLettres(1150),
      // Une cadence lineaire est volontaire ici : avec une courbe ease-out,
      // presque toutes les lettres apparaissaient au debut, meme a 3 secondes.
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
      style={{ flexDirection: 'row', flexWrap: 'wrap' }}
    >
      {groupes.map(({ mot, debut }, motIndex) => (
        <View
          key={`${mot}-${debut}`}
          style={{ flexDirection: 'row', marginRight: motIndex === groupes.length - 1 ? 0 : 8 }}
        >
          {Array.from(mot).map((lettre, index) => {
            const rang = debut + index
            const depart = mouvementReduit ? 0 : (rang / longueur) * 0.62
            const fin = Math.min(depart + 0.22, 1)
            return (
              <Animated.Text
                key={`${lettre}-${index}`}
                accessible={false}
                style={[
                  style,
                  {
                    opacity: progression.interpolate({
                      inputRange: [depart, fin],
                      outputRange: [0, 1],
                      extrapolate: 'clamp',
                    }),
                    transform: [
                      {
                        translateY: progression.interpolate({
                          inputRange: [depart, fin],
                          outputRange: [mouvementReduit ? 0 : 7, 0],
                          extrapolate: 'clamp',
                        }),
                      },
                    ],
                  },
                ]}
              >
                {lettre}
              </Animated.Text>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function Apparition({
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
    valeur.setValue(mouvementReduit ? 1 : 0)
    Animated.timing(valeur, {
      toValue: 1,
      delay: mouvementReduit ? 0 : auRythme(delai),
      duration: mouvementReduit ? 180 : auRythme(480),
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
            {
              translateY: valeur.interpolate({
                inputRange: [0, 1],
                outputRange: [mouvementReduit ? 0 : 8, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

function EcranPrenom({
  nom,
  setNom,
  onSubmit,
  mouvementReduit,
}: {
  nom: string
  setNom: (nom: string) => void
  onSubmit: () => void
  mouvementReduit: boolean
}) {
  const j = useJetons()
  const selectionnerAuFocus = nom.length !== 0
  return (
    <CadreQuestion>
      <TitreQuestion texte="First, what should I call you?" mouvementReduit={mouvementReduit} />
      <Apparition delai={1100} mouvementReduit={mouvementReduit}>
        <TextInput
          autoFocus
          autoComplete="off"
          autoCorrect={false}
          importantForAutofill="no"
          textContentType="none"
          selectTextOnFocus={selectionnerAuFocus}
          value={nom}
          onChangeText={setNom}
          onSubmitEditing={onSubmit}
          returnKeyType="next"
          placeholder="Your name"
          placeholderTextColor={j.text3}
          maxLength={40}
          accessibilityLabel="Your name"
          style={{
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
          }}
        />
      </Apparition>
    </CadreQuestion>
  )
}

function EcranPriorite({
  valeur,
  setValeur,
  valeurLibre,
  setValeurLibre,
  mouvementReduit,
}: {
  valeur: Priorite | null
  setValeur: (valeur: Priorite) => void
  valeurLibre: string
  setValeurLibre: (valeur: string) => void
  mouvementReduit: boolean
}) {
  const j = useJetons()
  return (
    <CadreQuestion>
      <TitreQuestion texte="What matters most to you right now?" mouvementReduit={mouvementReduit} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: PAS[2] }}>
        {PRIORITES.map((option, index) => (
          <Choix
            key={option.valeur}
            selectionne={valeur === option.valeur}
            onPress={() => setValeur(option.valeur)}
            style={{ flexBasis: '47%', flexGrow: 1 }}
            apparitionIndex={index}
            mouvementReduit={mouvementReduit}
          >
            {option.etiquette}
          </Choix>
        ))}
      </View>
      {valeur === 'other' ? (
        <Apparition delai={0} mouvementReduit={mouvementReduit} style={{ marginTop: -PAS[5] }}>
          <TextInput
            autoFocus
            value={valeurLibre}
            onChangeText={setValeurLibre}
            placeholder="Tell Vethos what it is"
            placeholderTextColor={j.text3}
            maxLength={60}
            accessibilityLabel="What matters most to you"
            style={{
              minHeight: 54,
              backgroundColor: j.champBg,
              borderWidth: 1,
              borderColor: j.lineForte,
              borderRadius: RAYON.xl,
              paddingHorizontal: PAS[4],
              paddingVertical: PAS[3],
              fontFamily: GEIST.normal,
              fontSize: 16,
              color: j.text,
            }}
          />
        </Apparition>
      ) : null}
    </CadreQuestion>
  )
}

function EcranFrequence({
  valeur,
  setValeur,
  mouvementReduit,
}: {
  valeur: Frequence | null
  setValeur: (valeur: Frequence) => void
  mouvementReduit: boolean
}) {
  return (
    <CadreQuestion>
      <TitreQuestion
        texte="How often do you end the day knowing you could have done more?"
        mouvementReduit={mouvementReduit}
      />
      <View style={{ gap: PAS[2] }}>
        {FREQUENCES.map((option, index) => (
          <Choix
            key={option.valeur}
            selectionne={valeur === option.valeur}
            onPress={() => setValeur(option.valeur)}
            apparitionIndex={index}
            mouvementReduit={mouvementReduit}
          >
            {option.etiquette}
          </Choix>
        ))}
      </View>
    </CadreQuestion>
  )
}

function Choix({
  children,
  selectionne,
  onPress,
  style,
  apparitionIndex,
  mouvementReduit,
}: {
  children: ReactNode
  selectionne: boolean
  onPress: () => void
  style?: StyleProp<ViewStyle>
  apparitionIndex: number
  mouvementReduit: boolean
}) {
  const j = useJetons()
  return (
    <Apparition
      // Le titre reste volontairement lent, mais une liste doit se révéler
      // comme un seul groupe : 69 ms réels entre choix au rythme actuel.
      delai={1000 + apparitionIndex * 40}
      mouvementReduit={mouvementReduit}
      style={style}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selectionne }}
        onPress={onPress}
        style={({ pressed }) => ({
          width: '100%',
          minHeight: 56,
          justifyContent: 'center',
          backgroundColor: selectionne || pressed ? j.surface2 : 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: selectionne ? j.text : j.lineForte,
          paddingLeft: PAS[6],
          paddingRight: PAS[3],
          opacity: pressed ? 0.68 : 1,
          transform: [{ translateX: pressed ? 3 : 0 }],
        })}
      >
        <View
          style={{
            position: 'absolute',
            left: 2,
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: selectionne ? j.accentEncre : j.lineForte,
          }}
        />
        <Text
          style={{
            fontFamily: selectionne ? GEIST.demi : GEIST.normal,
            fontSize: 15.5,
            color: j.text,
            textAlign: 'left',
          }}
        >
          {children}
        </Text>
      </Pressable>
    </Apparition>
  )
}

function Navigation({
  retour,
  continuer,
  desactive,
}: {
  retour?: () => void
  continuer: () => void
  desactive: boolean
}) {
  const j = useJetons()
  return (
    <View
      style={{
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: PAS[3],
        paddingHorizontal: PAS[6],
        paddingTop: PAS[3],
      }}
    >
      {retour ? (
        <Pressable
          accessibilityRole="button"
          onPress={retour}
          style={({ pressed }) => ({
            minWidth: 72,
            minHeight: 52,
            alignItems: 'flex-start',
            justifyContent: 'center',
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: j.text2 }}>Back</Text>
        </Pressable>
      ) : (
        <View style={{ minWidth: 72 }} />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: desactive }}
        disabled={desactive}
        onPress={continuer}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: j.text,
          borderWidth: 1,
          borderColor: j.text,
          borderBottomWidth: 2,
          borderBottomColor: j.accent,
          borderRadius: RAYON.xl,
          opacity: desactive ? 0.3 : pressed ? 0.78 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        })}
      >
        <Text style={{ fontFamily: GEIST.demi, fontSize: 15, color: j.surface }}>Continue</Text>
      </Pressable>
    </View>
  )
}

function Silence({ mouvementReduit }: { mouvementReduit: boolean }) {
  const j = useJetons()
  const pulsation = useRef(new Animated.Value(0.32)).current

  useEffect(() => {
    if (mouvementReduit) return
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(pulsation, { toValue: 1, duration: auRythme(720), useNativeDriver: true }),
        Animated.timing(pulsation, { toValue: 0.32, duration: auRythme(720), useNativeDriver: true }),
      ]),
    )
    boucle.start()
    return () => boucle.stop()
  }, [mouvementReduit, pulsation])

  return (
    <View
      accessible
      accessibilityLabel="Vethos is reflecting on your answers"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: 48, height: 1, backgroundColor: j.line }}>
        <Animated.View
          style={{
            width: 48,
            height: 1,
            backgroundColor: j.accent,
            opacity: mouvementReduit ? 0.7 : pulsation,
            transform: [{ scaleX: mouvementReduit ? 1 : pulsation }],
          }}
        />
      </View>
    </View>
  )
}

function Scene({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: PAS[6] }}>
      <View style={{ maxWidth: 345 }}>{children}</View>
    </View>
  )
}

function TexteScene({ children, secondaire }: { children: ReactNode; secondaire?: boolean }) {
  const j = useJetons()
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: secondaire ? GEIST.normal : GEIST.demi,
        fontSize: secondaire ? 25 : 31,
        lineHeight: secondaire ? 33 : 39,
        letterSpacing: secondaire ? -0.45 : -0.85,
        color: secondaire ? j.text2 : j.text,
      }}
    >
      {children}
    </Text>
  )
}

function Constat() {
  return (
    <Scene>
      <TexteScene>You already know what matters to you.</TexteScene>
    </Scene>
  )
}

function Consequence({ texte }: { texte: string }) {
  const j = useJetons()
  return (
    <Scene>
      <View style={{ gap: PAS[8] }}>
        <TexteScene secondaire>
          But every time you put it off, something else gets pushed back with it.
        </TexteScene>
        <View style={{ borderLeftWidth: 2, borderLeftColor: j.accent, paddingLeft: PAS[5] }}>
          <Text
            style={{
              fontFamily: GEIST.demi,
              fontSize: 28,
              lineHeight: 35,
              letterSpacing: -0.7,
              color: j.text,
            }}
          >
            {texte}
          </Text>
        </View>
      </View>
    </Scene>
  )
}

function Pensee({ mouvementReduit, terminer }: { mouvementReduit: boolean; terminer: () => void }) {
  const j = useJetons()
  const introduction = useRef(new Animated.Value(1)).current
  const citation = useRef(new Animated.Value(0)).current
  const fondLeve = useRef(new Animated.Value(0)).current
  const systeme = useRef(new Animated.Value(0)).current
  const promesse1 = useRef(new Animated.Value(0)).current
  const promesse2 = useRef(new Animated.Value(0)).current
  const verrou = useRef(new Animated.Value(0)).current
  const sortie = useRef(new Animated.Value(0)).current
  const [anneauVisible, setAnneauVisible] = useState(false)
  const [anneauVerrouille, setAnneauVerrouille] = useState(false)

  useEffect(() => {
    const facteur = mouvementReduit ? 0.28 : FACTEUR_RYTHME
    const timers: ReturnType<typeof setTimeout>[] = []
    const plusTard = (ms: number, action: () => void) => {
      timers.push(setTimeout(action, Math.round(ms * facteur)))
    }
    const apparition = (valeur: Animated.Value, duree: number) =>
      Animated.timing(valeur, {
        toValue: 1,
        duration: mouvementReduit ? 220 : auRythme(duree),
        easing: COURBE_ENTREE,
        useNativeDriver: true,
      }).start()

    plusTard(1400, () => apparition(citation, 850))
    plusTard(3000, () => {
      Animated.timing(introduction, {
        toValue: 0,
        duration: mouvementReduit ? 180 : auRythme(700),
        easing: COURBE_DEPLACEMENT,
        useNativeDriver: true,
      }).start()
    })
    // Une fois la phrase d'introduction effacee, la citation reste seule une
    // seconde avant de laisser Vethos reprendre l'ecran. Cette lenteur est
    // narrative, pas une latence d'UI.
    plusTard(4700, () => {
      setAnneauVisible(true)
      Animated.parallel([
        Animated.timing(citation, {
          toValue: 0,
          duration: mouvementReduit ? 220 : auRythme(900),
          easing: COURBE_DEPLACEMENT,
          useNativeDriver: true,
        }),
        Animated.timing(fondLeve, {
          toValue: mouvementReduit ? 0.14 : 0.32,
          duration: mouvementReduit ? 260 : auRythme(1300),
          easing: COURBE_ENTREE,
          useNativeDriver: true,
        }),
      ]).start()
      apparition(systeme, 800)
    })
    plusTard(6900, () => apparition(promesse1, 420))
    plusTard(8000, () => apparition(promesse2, 560))
    plusTard(8850, () => {
      setAnneauVerrouille(true)
      apparition(verrou, 520)
    })
    plusTard(10100, () => apparition(sortie, 520))

    return () => {
      timers.forEach(clearTimeout)
      ;[introduction, citation, fondLeve, systeme, promesse1, promesse2, verrou, sortie].forEach(
        (valeur) => valeur.stopAnimation(),
      )
    }
  }, [citation, fondLeve, introduction, mouvementReduit, promesse1, promesse2, sortie, systeme, verrou])

  const monte = (valeur: Animated.Value, distance = 10) => ({
    opacity: valeur,
    transform: [
      {
        translateY: valeur.interpolate({
          inputRange: [0, 1],
          outputRange: [mouvementReduit ? 0 : distance, 0],
        }),
      },
    ],
  })

  return (
    <View style={{ flex: 1, paddingHorizontal: PAS[6], overflow: 'hidden' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: j.surface,
          opacity: fondLeve,
        }}
      />

      <View style={{ flex: 1, position: 'relative' }}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              inset: 0,
              justifyContent: 'center',
              paddingBottom: 190,
            },
            monte(introduction, 0),
          ]}
        >
          <Text
            style={{
              maxWidth: 330,
              fontFamily: GEIST.normal,
              fontSize: 21,
              lineHeight: 29,
              letterSpacing: -0.25,
              color: j.text2,
            }}
          >
            And yet some days still end with the same thought.
          </Text>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' },
            monte(citation, 12),
          ]}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={{
              fontFamily: GEIST.demi,
              fontSize: 36,
              lineHeight: 43,
              letterSpacing: -1.1,
              color: j.text,
              textAlign: 'center',
            }}
          >
            “I could’ve done more.”
          </Text>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              inset: 0,
              justifyContent: 'center',
              alignItems: 'center',
              paddingBottom: PAS[8],
            },
            monte(systeme, 8),
          ]}
        >
          {anneauVisible ? (
            <AnneauVethos verrouille={anneauVerrouille} mouvementReduit={mouvementReduit} />
          ) : null}

          <View style={{ minHeight: 116, marginTop: PAS[8], alignItems: 'center', gap: PAS[3] }}>
            <Animated.Text
              accessibilityLiveRegion="polite"
              style={[
                {
                  fontFamily: GEIST.demi,
                  fontSize: 24,
                  lineHeight: 31,
                  letterSpacing: -0.5,
                  color: j.text,
                  textAlign: 'center',
                },
                monte(promesse1, 8),
              ]}
            >
              You already know what matters.
            </Animated.Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Animated.Text
                style={[
                  {
                    fontFamily: GEIST.normal,
                    fontSize: 17,
                    lineHeight: 24,
                    color: j.text2,
                    textAlign: 'center',
                  },
                  monte(promesse2, 6),
                ]}
              >
                Vethos makes sure your day{' '}
              </Animated.Text>
              <Animated.Text
                style={[
                  {
                    fontFamily: GEIST.demi,
                    fontSize: 17,
                    lineHeight: 24,
                    color: j.text,
                  },
                  monte(verrou, 6),
                ]}
              >
                respects it.
              </Animated.Text>
            </View>
          </View>
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: sortie }} pointerEvents={anneauVerrouille ? 'auto' : 'none'}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !anneauVerrouille }}
          disabled={!anneauVerrouille}
          onPress={terminer}
          style={({ pressed }) => ({
            minHeight: 52,
            alignItems: 'center',
            justifyContent: 'center',
            borderTopWidth: 1,
            borderTopColor: j.line,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: j.text2 }}>Continue</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

function AnneauVethos({ verrouille, mouvementReduit }: { verrouille: boolean; mouvementReduit: boolean }) {
  const j = useJetons()
  const segments = useRef(Array.from({ length: 8 }, (_, index) => new Animated.Value(index === 7 ? 0.12 : 0))).current
  const v = useRef(new Animated.Value(0)).current
  const echelle = useRef(new Animated.Value(0.96)).current
  const haptiqueJouee = useRef(false)

  useEffect(() => {
    if (mouvementReduit) {
      segments.slice(0, 7).forEach((segment) => segment.setValue(1))
      v.setValue(1)
      echelle.setValue(1)
      return
    }
    Animated.parallel([
      Animated.stagger(
        auRythme(190),
        segments.slice(0, 7).map((segment) =>
          Animated.timing(segment, {
            toValue: 1,
            duration: auRythme(650),
            easing: COURBE_ENTREE,
            useNativeDriver: true,
          }),
        ),
      ),
      Animated.sequence([
        Animated.delay(auRythme(520)),
        Animated.timing(v, {
          toValue: 1,
          duration: auRythme(900),
          easing: COURBE_ENTREE,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(echelle, {
        toValue: 1,
        duration: auRythme(1100),
        easing: COURBE_ENTREE,
        useNativeDriver: true,
      }),
    ]).start()
    return () => {
      segments.forEach((segment) => segment.stopAnimation())
      v.stopAnimation()
      echelle.stopAnimation()
    }
  }, [echelle, mouvementReduit, segments, v])

  useEffect(() => {
    if (!verrouille) return
    Animated.parallel([
      Animated.spring(segments[7]!, {
        toValue: 1,
        damping: 22,
        stiffness: 240,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(echelle, {
          toValue: 1.035,
          duration: mouvementReduit ? 100 : auRythme(180),
          easing: COURBE_ENTREE,
          useNativeDriver: true,
        }),
        Animated.spring(echelle, {
          toValue: 1,
          damping: 22,
          stiffness: 240,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      if (haptiqueJouee.current) return
      haptiqueJouee.current = true
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    })
  }, [echelle, mouvementReduit, segments, verrouille])

  const centre = 72
  const rayon = 56
  return (
    <Animated.View
      accessible
      accessibilityLabel="Vethos system activated"
      style={{ width: 144, height: 144, transform: [{ scale: echelle }] }}
    >
      {segments.map((segment, index) => {
        const angle = -90 + index * 45
        const radians = (angle * Math.PI) / 180
        const largeur = 31
        const hauteur = 8
        return (
          <Animated.View
            key={index}
            style={{
              position: 'absolute',
              left: centre + Math.cos(radians) * rayon - largeur / 2,
              top: centre + Math.sin(radians) * rayon - hauteur / 2,
              width: largeur,
              height: hauteur,
              borderRadius: RAYON.sm,
              backgroundColor: index === 7 ? j.accentEncre : j.text,
              opacity: segment,
              transform: [
                { rotate: `${angle + 90}deg` },
                { scaleX: segment },
              ],
            }}
          />
        )
      })}
      <Animated.Text
        style={{
          position: 'absolute',
          inset: 0,
          textAlign: 'center',
          textAlignVertical: 'center',
          fontFamily: GEIST.demi,
          fontSize: 62,
          lineHeight: 144,
          letterSpacing: -5,
          color: j.text,
          opacity: v,
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }}
      >
        V
      </Animated.Text>
    </Animated.View>
  )
}
