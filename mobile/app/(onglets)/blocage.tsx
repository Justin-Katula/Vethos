import { useEffect, useState } from 'react'
import { AppState, Linking, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBlocage } from '@/blocage/etat'
import { decrireSelection, selectionEstVide, type ModeBlocage } from '@/blocage/contrat'
import { SelecteurApplications, type RoleSelecteur } from '@/blocage/SelecteurApplications'
import { useJetons, useNomTheme } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { enHeure } from '@/plan/lecture'
import {
  BoutonIris,
  BoutonPlat,
  Espace,
  Rangee,
  Section,
  Texte,
  TitreEcran,
  Valeur,
} from '@/ui/primitives'

/**
 * Blocage.
 *
 * Le deuxième pilier du produit, à égalité avec la planification. L'écran dit
 * quatre choses et rien d'autre : ce qu'iOS autorise, ce que l'utilisateur a
 * désigné, jusqu'où ça va, et ce qui est programmé.
 *
 * Il dit aussi ce que Vethos ne peut PAS faire. Une application de blocage qui
 * laisse croire qu'elle est infranchissable ment à son utilisateur le jour où
 * il la franchit.
 */
export default function Blocage() {
  const marges = useSafeAreaInsets()
  const j = useJetons()
  const theme = useNomTheme()

  const {
    autorisation, selection, gardee, mode, filtrerLeWeb,
    plagesActives, ecartees, occupe, simule, verifie,
  } = useBlocage()
  const demander = useBlocage((e) => e.demanderAutorisation)
  const relire = useBlocage((e) => e.relireAutorisation)
  const choisir = useBlocage((e) => e.choisirApplications)
  const choisirMode = useBlocage((e) => e.choisirMode)
  const basculerFiltreWeb = useBlocage((e) => e.basculerFiltreWeb)
  const habiller = useBlocage((e) => e.habiller)
  const verifier = useBlocage((e) => e.verifier)
  const lever = useBlocage((e) => e.toutLever)

  const [selecteur, setSelecteur] = useState<RoleSelecteur | null>(null)

  const maintenant = minuteCourante()
  const accordee = autorisation === 'accordee'
  const enCours = plagesActives.find((p) => maintenant >= p.debutMinute && maintenant < p.finMinute)
  const profond = mode === 'profond'

  // Le bouclier vit dans un autre processus, sans accès à notre thème : ses
  // couleurs se figent au moment où on le pose. Sans ce repose, basculer en
  // sombre laissait un bouclier clair derrière soi — visible seulement en
  // ouvrant une application écartée, c'est-à-dire jamais pendant qu'on regarde.
  useEffect(() => {
    if (!enCours) return
    // Sans `titreBloc`, l'état garde celui de la séance en cours : un repose
    // ne doit jamais effacer le nom du bloc que le bouclier porte.
    habiller({ theme, finMinute: enCours.finMinute })
  }, [theme, enCours, habiller])

  // L'autorisation appartient à iOS, qui peut la retirer pendant que
  // l'application dort — et qui la RE-accorde depuis les Réglages, sans que
  // Vethos redémarre. La relire au seul lancement laissait donc l'écran figé
  // sur « Open Settings » après un aller-retour qui avait pourtant marché :
  // le seul geste que l'écran propose paraissait sans effet.
  useEffect(() => {
    void relire()
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void relire()
    })
    return () => abonnement.remove()
  }, [relire])

  // Le sélecteur d'Apple est une VUE, pas une fonction. Sur un vrai appareil on
  // la monte ; dans le navigateur, le simulateur fait le travail tout seul.
  const ouvrirSelecteur = (role: RoleSelecteur) => {
    if (simule && role === 'ecarte') void choisir()
    else setSelecteur(role)
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: j.bg }}
      contentContainerStyle={{
        paddingTop: marges.top + PAS[5],
        paddingBottom: PAS[12],
        paddingHorizontal: PAS[5],
      }}
    >
      <TitreEcran>Blocking</TitreEcran>

      {simule ? (
        <>
          <Espace h={4} />
          <Texte ton="accent" taille={12.5}>
            Simulated on this device. Real shielding needs an iPhone, a compiled build and
            Apple’s permission. Everything else on this screen is real.
          </Texte>
        </>
      ) : null}

      <Section
        premiere={!simule}
        titre="Screen Time"
        loi="Apple’s permission is what lets an app be hidden. You can withdraw it whenever you want, from Settings."
        action={
          accordee ? (
            <Valeur ton="accent" taille={12}>
              GRANTED
            </Valeur>
          ) : autorisation === 'refusee' ? (
            <Valeur ton="doux" taille={12}>
              DECLINED
            </Valeur>
          ) : null
        }
      >
        {accordee ? (
          <Texte ton="doux">
            iOS never tells Vethos which apps you picked — only how many. That is a guarantee
            of the system, not a promise of ours.
          </Texte>
        ) : autorisation === 'refusee' ? (
          <>
            {/*
              iOS ne redemande PAS. Une fois refusée, la feuille système ne
              réapparaît plus : `requestAuthorization` lève aussitôt, sans rien
              afficher. Laisser le bouton « Allow » ici donnerait un bouton qui
              ne fait plus jamais rien — le seul chemin restant passe par les
              Réglages, alors autant le dire et y mener.
            */}
            <Texte ton="doux">
              iOS will not ask twice. Turn it back on in Settings › Screen Time › Apps with
              Screen Time Access, then come back — Vethos re-reads it on its own.
            </Texte>
            <Espace h={4} />
            <BoutonIris onPress={() => void ouvrirReglages()} desactive={occupe}>
              Open Settings
            </BoutonIris>
          </>
        ) : (
          <>
            <Texte ton="doux">
              {autorisation === 'inconnue'
                ? 'Vethos could not read what iOS answered. Asking again is safe — it changes nothing if permission is already granted.'
                : 'Without it, Vethos can only show you your plan.'}
            </Texte>
            <Espace h={4} />
            <BoutonIris onPress={() => void demander()} desactive={occupe}>
              {occupe ? 'One moment…' : 'Allow'}
            </BoutonIris>
          </>
        )}
      </Section>

      <Section
        titre="What you set aside"
        compte={selection ? selection.nbApplications + selection.nbCategories : undefined}
        loi="You pick inside Apple’s own picker. It alone knows what they are. Websites count too — set aside the app and not the site, and the site stays one tap away."
      >
        {selection ? (
          <Rangee premiere>
            <View style={{ flex: 1 }}>
              <Texte ton={selectionEstVide(selection) ? 'accent' : 'normal'}>
                {selectionEstVide(selection)
                  ? 'Nothing selected — a session will shield nothing.'
                  : decrireSelection(selection)}
              </Texte>
              {/*
                Décrit, pas relu. Cette ligne affichait `selection.libelle` —
                une étiquette que Vethos écrit lui-même et range avec la
                sélection. Le jour où l'application est passée à l'anglais,
                les sélections déjà enregistrées ont continué d'afficher leur
                phrase française, sur un écran que plus aucune relecture du
                code ne pouvait corriger. Un texte affiché ne vient pas du
                stockage.
              */}
              <Texte ton="eteint" taille={12.5}>
                Set aside during a session
              </Texte>
            </View>
          </Rangee>
        ) : (
          <Texte ton="doux">Nothing picked yet.</Texte>
        )}
        <Espace h={4} />
        <BoutonPlat onPress={() => ouvrirSelecteur('ecarte')} desactive={occupe || !accordee}>
          {selection ? 'Change my selection' : 'Pick my apps'}
        </BoutonPlat>
      </Section>

      <Section
        titre="How far it goes"
        loi="Two strengths, one trigger. Either way, nothing is raised until you say “I’m starting”."
      >
        <ChoixMode valeur={mode} surChoix={(m) => void choisirMode(m)} desactive={occupe} />

        <Espace h={4} />
        <Texte ton="doux" taille={12.5}>
          {profond
            ? 'Every app is set aside except the ones you keep. Stronger, and easier to get wrong.'
            : 'Only what you picked above is set aside. Everything else stays where it is.'}
        </Texte>

        {profond ? (
          <>
            <Espace h={5} />
            <Rangee premiere>
              <View style={{ flex: 1 }}>
                <Texte>{gardee ? decrireSelection(gardee) : 'Nothing kept yet.'}</Texte>
                <Texte ton={gardee ? 'eteint' : 'accent'} taille={12.5}>
                  {gardee
                    ? 'Reachable during a deep session'
                    : 'Keep Vethos itself, or the only way out is iOS Settings.'}
                </Texte>
              </View>
            </Rangee>
            <Espace h={4} />
            <BoutonPlat onPress={() => ouvrirSelecteur('garde')} desactive={occupe || !accordee}>
              {gardee ? 'Change what I keep' : 'Pick what I keep'}
            </BoutonPlat>
          </>
        ) : null}
      </Section>

      <Section
        titre="The web"
        loi="Apple’s own filter, not a list of ours. A blocklist we maintained would age, and let through exactly what it promised to stop."
        action={
          filtrerLeWeb ? (
            <Valeur ton="accent" taille={12}>
              ON
            </Valeur>
          ) : null
        }
      >
        <Texte ton="doux">
          {filtrerLeWeb
            ? 'Explicit sites are filtered in Safari for the length of a session, then it lifts.'
            : 'Off. Sites you picked in the selection above are still set aside with your apps.'}
        </Texte>
        <Espace h={4} />
        <BoutonPlat onPress={() => void basculerFiltreWeb()} desactive={occupe || !accordee}>
          {filtrerLeWeb ? 'Turn the filter off' : 'Filter the web during a session'}
        </BoutonPlat>
      </Section>

      <Section
        titre="When it applies"
        loi="During a session you started, and never otherwise. Vethos has no blocking schedule of its own: “I’m starting” raises the shield, and the end of the session lowers it."
        action={
          enCours ? (
            <Valeur ton="accent" taille={12}>
              ACTIVE
            </Valeur>
          ) : null
        }
      >
        {enCours ? (
          <Texte>
            Raised until {enHeure(enCours.finMinute)}. That is the duration of the task you
            started, not of its former slot.
          </Texte>
        ) : (
          <Texte ton="doux">
            Nothing is set aside right now. The next “I’m starting” takes care of it.
          </Texte>
        )}

        <Espace h={4} />
        <Preuve attendu={enCours !== undefined} verifie={verifie} />
        <Espace h={3} />
        <BoutonPlat onPress={() => void verifier()} desactive={occupe}>
          Check with iOS now
        </BoutonPlat>
      </Section>

      {plagesActives.length > 0 ? (
        <Section titre="Today’s sessions" compte={plagesActives.length}>
          {plagesActives.map((p, i) => {
            const actif = maintenant >= p.debutMinute && maintenant < p.finMinute
            const passe = maintenant >= p.finMinute
            return (
              <Rangee key={p.blocId} premiere={i === 0}>
                <View style={{ flex: 1, opacity: passe ? 0.42 : 1 }}>
                  <Texte ton="doux">
                    {passe ? 'over' : actif ? 'active' : 'upcoming'}
                  </Texte>
                </View>
                <Valeur ton={actif ? 'accent' : 'normal'}>
                  {enHeure(p.debutMinute)}–{enHeure(p.finMinute)}
                </Valeur>
              </Rangee>
            )
          })}

          {ecartees.plafond > 0 || ecartees.courtes > 0 ? (
            <>
              <Espace h={4} />
              <Texte ton="accent" taille={12.5}>
                {phraseEcartees(ecartees)}
              </Texte>
            </>
          ) : null}

          <Espace h={5} />
          <BoutonPlat onPress={() => void lever()} desactive={occupe}>
            Lift everything now
          </BoutonPlat>
        </Section>
      ) : null}

      <SelecteurApplications
        ouvert={selecteur !== null}
        role={selecteur ?? 'ecarte'}
        surFermeture={() => setSelecteur(null)}
      />

      <Section titre="What Vethos cannot do">
        <Texte ton="doux">
          Screen Time can be switched off from iOS Settings with Face ID, and no app can stop
          that. Vethos is a guardrail, not a prison — telling you otherwise would be a lie.
        </Texte>
      </Section>
    </ScrollView>
  )
}

/**
 * La seule ligne de cet écran qui ne soit pas une déclaration d'intention.
 *
 * Tout le reste décrit ce que Vethos a DEMANDÉ à iOS. Ceci rapporte ce qu'iOS
 * répond. Les deux ont déjà divergé en silence — dans Expo Go, chaque appel
 * réussissait et aucun bouclier ne se levait jamais — et rien, nulle part, ne
 * permettait de s'en apercevoir sans ouvrir une application écartée.
 *
 * Le désaccord est dit sans être expliqué : on ne sait pas POURQUOI iOS n'a
 * pas levé, et inventer une cause serait pire que de n'en donner aucune.
 */
function Preuve({
  attendu,
  verifie,
}: {
  attendu: boolean
  verifie: { leve: boolean; aMs: number } | null
}) {
  if (!verifie) return <Texte ton="eteint" taille={12.5}>Not checked yet.</Texte>

  const heure = new Date(verifie.aMs)
  const a = `${String(heure.getHours()).padStart(2, '0')}:${String(heure.getMinutes()).padStart(2, '0')}`

  if (verifie.leve === attendu) {
    return (
      <Texte ton="doux" taille={12.5}>
        {verifie.leve
          ? `iOS confirms a shield is up. Checked at ${a}.`
          : `iOS confirms nothing is shielded. Checked at ${a}.`}
      </Texte>
    )
  }

  return (
    <Texte ton="accent" taille={12.5}>
      {attendu
        ? `Vethos asked for a shield; iOS says none is up. Checked at ${a}.`
        : `A shield is still up, and no session is running. Checked at ${a}.`}
    </Texte>
  )
}

/** Les deux forces, côte à côte. Même motif que le choix d'apparence. */
function ChoixMode({
  valeur,
  surChoix,
  desactive,
}: {
  valeur: ModeBlocage
  surChoix: (m: ModeBlocage) => void
  desactive?: boolean
}) {
  const j = useJetons()
  const modes: { cle: ModeBlocage; nom: string }[] = [
    { cle: 'ecarter', nom: 'Set aside' },
    { cle: 'profond', nom: 'Deep focus' },
  ]

  return (
    <View style={{ flexDirection: 'row', gap: PAS[2] }}>
      {modes.map((m) => {
        const actif = valeur === m.cle
        return (
          <Pressable
            key={m.cle}
            accessibilityRole="button"
            accessibilityState={{ selected: actif, disabled: !!desactive }}
            onPress={() => surChoix(m.cle)}
            disabled={desactive}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RAYON.sm,
              borderWidth: 1,
              borderColor: actif ? j.accent : j.line,
              backgroundColor: actif ? j.accentDoux : 'transparent',
              opacity: desactive ? 0.4 : 1,
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

function minuteCourante(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Les Réglages d'iOS, et seulement par la porte publique.
 *
 * `openSettings()` ouvre la fiche de Vethos. Il existe des adresses internes
 * qui mènent droit au Temps d'écran (`App-Prefs:…`) — elles marchent, et elles
 * font refuser une application à la revue. La phrase au-dessus du bouton
 * indique donc le chemin en toutes lettres : deux touches de plus, aucun
 * risque de voir l'application rejetée pour un raccourci.
 */
async function ouvrirReglages(): Promise<void> {
  try {
    await Linking.openSettings()
  } catch {
    // Rien à faire de plus : l'utilisateur garde le chemin écrit au-dessus.
  }
}

/**
 * Ce que l'on dit quand iOS n'a pas pu tout tenir.
 *
 * Le silence serait pire : l'utilisateur verrait une séance non protégée et
 * conclurait que l'application ne marche pas.
 */
function phraseEcartees({ courtes, plafond }: { courtes: number; plafond: number }): string {
  const bouts: string[] = []
  if (courtes > 0) {
    bouts.push(
      `${courtes} session${courtes > 1 ? 's' : ''} too short for iOS to hold`,
    )
  }
  if (plafond > 0) bouts.push(`${plafond} beyond the 20 Apple allows`)
  return `${bouts.join(' and ')}. The longest ones were kept.`
}
