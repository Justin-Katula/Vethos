import { useState } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { verifierSommeil, type Nuit } from '@/donnees/regle-sommeil'
import { minutesEveil } from '@/plan/moteur'
import { useJetons, useModeApparence } from '@/theme/Theme'
import { RoueHeure } from '@/ui/Roue'
import { PAS, RAYON } from '@/theme/jetons'
import { duree } from '@/ui/Horloge'
import { useLargeur } from '@/ui/largeur'
import { BoutonPlat, GEIST, MONO, Rangee, Section, Texte, TitreEcran, Valeur } from '@/ui/primitives'

/**
 * Réglages.
 *
 * Le sommeil d'abord, parce que c'est la seule déclaration dont tout le reste
 * dépend : la capacité du jour se calcule entre ces deux heures, et rien ne se
 * place dessus. Le reste est de la consultation.
 */
export default function Reglages() {
  const marges = useSafeAreaInsets()
  const j = useJetons()
  const { reglages, majReglages, taches, objectifs, ancres } = useDonnees()
  const large = useLargeur().deuxColonnes

  // Deduit des MEMES plages que le moteur soustrait. Un calcul a part ici
  // affichait « 16 h 30 » pendant que le moteur en retirait autre chose.
  const eveil = minutesEveil(reglages)

  // La nuit ne se déplace que de 2 h en tout autour de celle déclarée, et
  // reste entre 6 et 10 h. Un réglage refusé fait revenir la roue.
  const [refus, setRefus] = useState('')
  const reference: Nuit = reglages.sommeilReference ?? {
    coucher: reglages.coucher,
    lever: reglages.lever,
  }
  const verdict = verifierSommeil({ coucher: reglages.coucher, lever: reglages.lever }, reference)
  const essayerSommeil = (nuit: Nuit) => {
    const v = verifierSommeil(nuit, reference)
    if (!v.ok) {
      setRefus(v.raison)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined)
      return
    }
    setRefus('')
    void majReglages({ ...nuit, sommeilReference: reference })
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: j.bg }}
      contentContainerStyle={{
        paddingTop: marges.top + PAS[5],
        paddingBottom: PAS[12],
        paddingHorizontal: PAS[5],
      }}
      keyboardShouldPersistTaps="handled"
    >
      <TitreEcran>Settings</TitreEcran>

      {/* Deux colonnes des que l'ecran les permet, comme le bureau. Ce qui se
          REGLE a gauche — le sommeil, le prenom, l'apparence — et ce qui se
          consulte ou se rejoue a droite. */}
      <View style={large
        ? { flexDirection: 'row', alignItems: 'flex-start', gap: PAS[10], marginTop: PAS[6] }
        : {}}>
      <View style={large ? { flex: 1 } : {}}>

      <Section
        premiere
        titre="Sleep"
        loi="The single source of your day. Capacity is computed between these two hours, and nothing is ever placed on top of them."
        action={<Valeur ton="doux">{duree(eveil)} awake</Valeur>}
      >
        <View style={{ flexDirection: 'row', gap: PAS[3] }}>
          <Champ
            etiquette="Bedtime"
            valeur={reglages.coucher}
            surChangement={(v) => essayerSommeil({ coucher: v, lever: reglages.lever })}
            exemple="23:30"
            horaire
          />
          <Champ
            etiquette="Wake-up"
            valeur={reglages.lever}
            surChangement={(v) => essayerSommeil({ coucher: reglages.coucher, lever: v })}
            exemple="07:00"
            horaire
          />
        </View>
        <View style={{ marginTop: PAS[3], gap: PAS[1] }}>
          <Texte ton={refus ? 'accent' : 'eteint'} taille={12.5}>
            {refus ||
              (verdict.reste === null
                ? 'Between 6 and 10 hours a night.'
                : verdict.reste === 0
                  ? `No flexibility left around ${reference.coucher} → ${reference.lever}.`
                  : `${duree(verdict.reste)} of flexibility left around ${reference.coucher} → ${reference.lever}.`)}
          </Texte>
        </View>
      </Section>

      <Section titre="You" loi="Used to greet you, nowhere else.">
        <Champ
          etiquette="First name"
          valeur={reglages.prenom}
          surChangement={(v) => void majReglages({ prenom: v })}
          exemple="Your first name"
        />
      </Section>

      <Section
        titre="Appearance"
        loi="Following the device is the default: an install that asked for nothing does not decide on its owner’s behalf."
      >
        <ChoixApparence />

        {/* Les heures n’existent que pour le mode qui s’en sert. Les laisser
            en permanence donnerait deux réglages là où l’utilisateur n’en a
            choisi qu’un. */}
        {reglages.apparence === 'schedule' ? (
          <View style={{ marginTop: PAS[4], gap: PAS[3] }}>
            <View style={{ flexDirection: 'row', gap: PAS[3] }}>
              <Champ
                etiquette="Light from"
                valeur={reglages.clairDes}
                surChangement={(v) => void majReglages({ clairDes: v })}
                exemple="07:00"
                horaire
              />
              <Champ
                etiquette="Dark from"
                valeur={reglages.sombreDes}
                surChangement={(v) => void majReglages({ sombreDes: v })}
                exemple="19:00"
                horaire
              />
            </View>
            <Texte ton="eteint" taille={12}>
              {reglages.clairDes === reglages.sombreDes
                ? 'The same hour twice: it will stay dark all the time.'
                : `Dark from ${reglages.sombreDes} to ${reglages.clairDes}, light the rest of the time.`}
            </Texte>
          </View>
        ) : null}
      </Section>

      </View>

      <View style={large ? { flex: 1 } : {}}>
      <Section
        premiere={large}
        titre="Introduction"
        loi="Touches neither your commitments nor the time you declared. It only replays the first launch."
      >
        <BoutonPlat onPress={() => void majReglages({ introductionFaite: false })}>
          Replay the introduction
        </BoutonPlat>
      </Section>

      <Section titre="What Vethos keeps">
        <Rangee premiere>
          <Texte ton="doux">Tasks</Texte>
          <View style={{ flex: 1 }} />
          <Valeur>{String(taches.length)}</Valeur>
        </Rangee>
        <Rangee>
          <Texte ton="doux">Goals</Texte>
          <View style={{ flex: 1 }} />
          <Valeur>{String(objectifs.length)}</Valeur>
        </Rangee>
        <Rangee>
          <Texte ton="doux">Anchors</Texte>
          <View style={{ flex: 1 }} />
          <Valeur>{String(ancres.length)}</Valeur>
        </Rangee>
        <Espace />
        <Texte ton="doux" taille={12.5}>
          Everything stays on this phone. Nothing is sent to a server, and the app works
          with no network at all.
        </Texte>
      </Section>
      </View>
      </View>
    </ScrollView>
  )
}

function Espace() {
  return <View style={{ height: PAS[4] }} />
}

function Champ({
  etiquette,
  valeur,
  surChangement,
  exemple,
  horaire,
}: {
  etiquette: string
  valeur: string
  surChangement: (v: string) => void
  exemple: string
  horaire?: boolean
}) {
  const j = useJetons()
  // Une heure se règle au pouce, sur une roue — jamais au clavier.
  if (horaire)
    return (
      <View style={{ flex: 1, gap: PAS[2] }}>
        <Texte ton="eteint" taille={12.5}>
          {etiquette}
        </Texte>
        <RoueHeure valeur={valeur} changer={surChangement} etiquette={etiquette} compact />
      </View>
    )
  return (
    <View style={{ flex: 1, gap: PAS[2] }}>
      <Texte ton="eteint" taille={12.5}>
        {etiquette}
      </Texte>
      <TextInput
        // L'etiquette est AU-DESSUS du champ, pas dedans : rien ne les relie
        // pour un lecteur d'ecran, qui n'annoncerait alors que la valeur.
        accessibilityLabel={etiquette}
        value={valeur}
        onChangeText={surChangement}
        placeholder={exemple}
        placeholderTextColor={j.text3}
        style={{
          backgroundColor: j.champBg,
          borderWidth: 1,
          borderColor: j.lineForte,
          borderRadius: RAYON.md,
          paddingHorizontal: PAS[3],
          paddingVertical: PAS[2] + 2,
          color: j.text,
          // Une heure est une valeur : elle se saisit dans la même police
          // qu'elle s'affiche, sinon le champ et la colonne ne se répondent pas.
          fontFamily: horaire ? MONO.demi : GEIST.normal,
          fontSize: 15,
        }}
      />
    </View>
  )
}

/**
 * Les quatre modes du bureau, atteignables au doigt.
 *
 * « À l'heure » bascule tout seul au fil de la journée ; les trois autres ne
 * bougent que si quelque chose les pousse. La règle qui tranche est partagée
 * avec le bureau — `resolveTheme` — et n'est donc réécrite nulle part.
 */
function ChoixApparence() {
  const j = useJetons()
  const mode = useModeApparence()
  const majReglages = useDonnees((d) => d.majReglages)

  const modes = [
    { cle: 'system' as const, nom: 'Device' },
    { cle: 'light' as const, nom: 'Light' },
    { cle: 'dark' as const, nom: 'Dark' },
    { cle: 'schedule' as const, nom: 'On a clock' },
  ]

  return (
    <View style={{ flexDirection: 'row', gap: PAS[2] }}>
      {modes.map((m) => {
        const actif = mode === m.cle
        return (
          <Pressable
            key={m.cle}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
            onPress={() => void majReglages({ apparence: m.cle })}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RAYON.sm,
              borderWidth: 1,
              borderColor: actif ? j.accent : j.line,
              backgroundColor: actif ? j.accentDoux : 'transparent',
              transform: [{ translateY: pressed ? 1 : 0 }],
            })}
          >
            <Texte ton={actif ? 'accent' : 'eteint'} taille={12.5}>
              {m.nom}
            </Texte>
          </Pressable>
        )
      })}
    </View>
  )
}
