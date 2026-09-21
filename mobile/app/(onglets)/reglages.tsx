import { Pressable, ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { useJetons, useModeApparence } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { duree } from '@/ui/Horloge'
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

  const eveil = versMinute(reglages.coucher) - versMinute(reglages.lever)

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
      <TitreEcran>Réglages</TitreEcran>

      <Section
        premiere
        titre="Sommeil"
        loi="La source unique de ta journée. La capacité se calcule entre ces deux heures, et rien ne se place dessus."
        action={<Valeur ton="doux">{duree(eveil > 0 ? eveil : 0)}</Valeur>}
      >
        <View style={{ flexDirection: 'row', gap: PAS[3] }}>
          <Champ
            etiquette="Coucher"
            valeur={reglages.coucher}
            surChangement={(v) => void majReglages({ coucher: v })}
            exemple="23:30"
            horaire
          />
          <Champ
            etiquette="Lever"
            valeur={reglages.lever}
            surChangement={(v) => void majReglages({ lever: v })}
            exemple="07:00"
            horaire
          />
        </View>
      </Section>

      <Section titre="Toi" loi="Utilisé pour te saluer, nulle part ailleurs.">
        <Champ
          etiquette="Prénom"
          valeur={reglages.prenom}
          surChangement={(v) => void majReglages({ prenom: v })}
          exemple="Ton prénom"
        />
      </Section>

      <Section
        titre="Apparence"
        loi="Suivre l’appareil est le choix par défaut : une installation qui n’a rien demandé ne décide pas à la place de son propriétaire."
      >
        <ChoixApparence />

        {/* Les heures n’existent que pour le mode qui s’en sert. Les laisser
            en permanence donnerait deux réglages là où l’utilisateur n’en a
            choisi qu’un. */}
        {reglages.apparence === 'schedule' ? (
          <View style={{ marginTop: PAS[4], gap: PAS[3] }}>
            <View style={{ flexDirection: 'row', gap: PAS[3] }}>
              <Champ
                etiquette="Clair dès"
                valeur={reglages.clairDes}
                surChangement={(v) => void majReglages({ clairDes: v })}
                exemple="07:00"
                horaire
              />
              <Champ
                etiquette="Sombre dès"
                valeur={reglages.sombreDes}
                surChangement={(v) => void majReglages({ sombreDes: v })}
                exemple="19:00"
                horaire
              />
            </View>
            <Texte ton="eteint" taille={12}>
              {reglages.clairDes === reglages.sombreDes
                ? 'Deux fois la même heure : il fera sombre en permanence.'
                : `Sombre de ${reglages.sombreDes} à ${reglages.clairDes}, clair le reste du temps.`}
            </Texte>
          </View>
        ) : null}
      </Section>

      <Section
        titre="Introduction"
        loi="Ne touche ni à tes engagements, ni à ton temps déclaré. Rejoue seulement le premier lancement."
      >
        <BoutonPlat onPress={() => void majReglages({ introductionFaite: false })}>
          Revoir l’introduction
        </BoutonPlat>
      </Section>

      <Section titre="Ce que Vethos garde">
        <Rangee premiere>
          <Texte ton="doux">Tâches</Texte>
          <View style={{ flex: 1 }} />
          <Valeur>{String(taches.length)}</Valeur>
        </Rangee>
        <Rangee>
          <Texte ton="doux">Objectifs</Texte>
          <View style={{ flex: 1 }} />
          <Valeur>{String(objectifs.length)}</Valeur>
        </Rangee>
        <Rangee>
          <Texte ton="doux">Ancres</Texte>
          <View style={{ flex: 1 }} />
          <Valeur>{String(ancres.length)}</Valeur>
        </Rangee>
        <Espace />
        <Texte ton="doux" taille={12.5}>
          Tout reste sur ce téléphone. Rien n’est envoyé sur un serveur, et l’application
          fonctionne sans réseau.
        </Texte>
      </Section>
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
  return (
    <View style={{ flex: 1, gap: PAS[2] }}>
      <Texte ton="eteint" taille={12.5}>
        {etiquette}
      </Texte>
      <TextInput
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

function versMinute(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
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
    { cle: 'system' as const, nom: 'Appareil' },
    { cle: 'light' as const, nom: 'Clair' },
    { cle: 'dark' as const, nom: 'Sombre' },
    { cle: 'schedule' as const, nom: 'À l’heure' },
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
