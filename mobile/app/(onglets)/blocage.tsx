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
      <TitreEcran>Blocage</TitreEcran>

      {simule ? (
        <>
          <Espace h={4} />
          <Texte ton="accent" taille={12.5}>
            Simulé sur cet appareil. Le vrai masquage demande un iPhone, une version
            compilée et l’autorisation d’Apple. Tout le reste de l’écran est réel.
          </Texte>
        </>
      ) : null}

      <Section
        premiere={!simule}
        titre="Temps d’écran"
        loi="L’autorisation d’Apple est ce qui permet de masquer une application. Elle se retire quand tu veux, depuis les Réglages."
        action={
          accordee ? (
            <Valeur ton="accent" taille={12}>
              ACCORDÉE
            </Valeur>
          ) : null
        }
      >
        {accordee ? (
          <Texte ton="doux">
            iOS ne dit jamais à Vethos quelles applications tu as choisies — seulement
            combien. C’est une garantie du système, pas une promesse de notre part.
          </Texte>
        ) : (
          <>
            <Texte ton="doux">
              Sans elle, Vethos ne peut que te montrer ton plan.
            </Texte>
            <Espace h={4} />
            <BoutonIris onPress={() => void demander()} desactive={occupe}>
              {occupe ? 'Un instant…' : 'Autoriser'}
            </BoutonIris>
          </>
        )}
      </Section>

      <Section
        titre="Ce que tu écartes"
        compte={selection ? selection.nbApplications + selection.nbCategories : undefined}
        loi="Tu désignes dans le sélecteur d’Apple. Lui seul sait de quoi il s’agit."
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
          <Texte ton="doux">Rien de choisi.</Texte>
        )}
        <Espace h={4} />
        <BoutonPlat onPress={ouvrirSelecteur} desactive={occupe || !accordee}>
          {selection ? 'Changer ma sélection' : 'Choisir mes applications'}
        </BoutonPlat>
      </Section>

      <Section
        titre="Quand ça s’applique"
        loi="Pendant une séance confirmée, et jamais autrement. Vethos n’a pas d’horaire de blocage à lui : c’est « Je commence » qui lève le bouclier, et la fin de la séance qui le baisse."
        action={
          enCours ? (
            <Valeur ton="accent" taille={12}>
              EN COURS
            </Valeur>
          ) : null
        }
      >
        {enCours ? (
          <Texte>
            Levé jusqu’à {enHeure(enCours.finMinute)}. C’est la durée de la tâche que tu as
            démarrée, pas celle de son ancien créneau.
          </Texte>
        ) : (
          <Texte ton="doux">
            Rien n’est écarté en ce moment. Le prochain « Je commence » s’en charge.
          </Texte>
        )}
      </Section>

      {plagesActives.length > 0 ? (
        <Section titre="Séances du jour" compte={plagesActives.length}>
          {plagesActives.map((p, i) => {
            const actif = maintenant >= p.debutMinute && maintenant < p.finMinute
            const passe = maintenant >= p.finMinute
            return (
              <Rangee key={p.blocId} premiere={i === 0}>
                <View style={{ flex: 1, opacity: passe ? 0.42 : 1 }}>
                  <Texte ton="doux">
                    {passe ? 'passée' : actif ? 'en cours' : 'à venir'}
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
            Tout lever maintenant
          </BoutonPlat>
        </Section>
      ) : null}

      <SelecteurApplications ouvert={selecteurOuvert} surFermeture={() => setSelecteurOuvert(false)} />

      <Section titre="Ce que Vethos ne peut pas faire">
        <Texte ton="doux">
          Le Temps d’écran se désactive depuis les Réglages d’iOS avec Face ID, et aucune
          application ne peut l’empêcher. Vethos est un garde-fou, pas une prison — te
          faire croire le contraire serait mentir.
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
      `${courtes} séance${courtes > 1 ? 's' : ''} trop courte${courtes > 1 ? 's' : ''} pour qu’iOS la tienne`,
    )
  }
  if (plafond > 0) bouts.push(`${plafond} au-delà des 20 qu’Apple autorise`)
  return `${bouts.join(', et ')}. Les plus longues ont été gardées.`
}
