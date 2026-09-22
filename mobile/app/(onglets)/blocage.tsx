import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBlocage } from '@/blocage/etat'
import { decrireSelection } from '@/blocage/contrat'
import { SelecteurApplications } from '@/blocage/SelecteurApplications'
import { useJetons } from '@/theme/Theme'
import { PAS } from '@/theme/jetons'
import { enHeure } from '@/ui/Horloge'
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
 * trois choses et rien d'autre : ce qu'iOS autorise, ce que l'utilisateur a
 * désigné, et ce qui est programmé.
 *
 * Il dit aussi ce que Vethos ne peut PAS faire. Une application de blocage qui
 * laisse croire qu'elle est infranchissable ment à son utilisateur le jour où
 * il la franchit.
 */
export default function Blocage() {
  const marges = useSafeAreaInsets()
  const j = useJetons()

  const { autorisation, selection, plagesActives, ecartees, occupe, simule } = useBlocage()
  const demander = useBlocage((e) => e.demanderAutorisation)
  const choisir = useBlocage((e) => e.choisirApplications)
  const lever = useBlocage((e) => e.toutLever)

  const [selecteurOuvert, setSelecteurOuvert] = useState(false)

  const maintenant = minuteCourante()
  const accordee = autorisation === 'accordee'
  const enCours = plagesActives.find((p) => maintenant >= p.debutMinute && maintenant < p.finMinute)

  // Le sélecteur d'Apple est une VUE, pas une fonction. Sur un vrai appareil on
  // la monte ; dans le navigateur, le simulateur fait le travail tout seul.
  const ouvrirSelecteur = () => {
    if (simule) void choisir()
    else setSelecteurOuvert(true)
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
          ) : null
        }
      >
        {accordee ? (
          <Texte ton="doux">
            iOS never tells Vethos which apps you picked — only how many. That is a guarantee
            of the system, not a promise of ours.
          </Texte>
        ) : (
          <>
            <Texte ton="doux">
              Without it, Vethos can only show you your plan.
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
        loi="You pick inside Apple’s own picker. It alone knows what they are."
      >
        {selection ? (
          <Rangee premiere>
            <View style={{ flex: 1 }}>
              <Texte>{decrireSelection(selection)}</Texte>
              <Texte ton="eteint" taille={12.5}>
                {selection.libelle}
              </Texte>
            </View>
          </Rangee>
        ) : (
          <Texte ton="doux">Nothing picked yet.</Texte>
        )}
        <Espace h={4} />
        <BoutonPlat onPress={ouvrirSelecteur} desactive={occupe || !accordee}>
          {selection ? 'Change my selection' : 'Pick my apps'}
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

      <SelecteurApplications ouvert={selecteurOuvert} surFermeture={() => setSelecteurOuvert(false)} />

      <Section titre="What Vethos cannot do">
        <Texte ton="doux">
          Screen Time can be switched off from iOS Settings with Face ID, and no app can stop
          that. Vethos is a guardrail, not a prison — telling you otherwise would be a lie.
        </Texte>
      </Section>
    </ScrollView>
  )
}

function minuteCourante(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
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
