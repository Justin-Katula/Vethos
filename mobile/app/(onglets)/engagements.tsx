import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  allouerCouleurAncre,
  allouerCouleurObjectif,
  allouerCouleurTache,
  assainirCouleur,
  couleurAncre,
  couleurObjectif,
  couleurTache,
} from '@shared/palettes'
import { useDonnees, type Tache } from '@/donnees/magasin'
import { useSeances } from '@/seances/magasin-seances'
import { usePlan } from '@/plan/Plan'
import { maxTaskMinutesPerDay } from '@shared/planning/placement'
import { useJetons } from '@/theme/Theme'
import { RoueDuree, RoueHeure, RoueJour } from '@/ui/Roue'
import { useLargeur } from '@/ui/largeur'
import { PAS, RAYON } from '@/theme/jetons'
import { duree, enHeure } from '@/ui/Horloge'
import { Coche, Croix, GlypheAncre, GlypheObjectif, GlypheTache, Moins, Plus } from '@/ui/icones'
import {
  BoutonIris,
  BoutonPlat,
  Espace,
  GEIST,
  Marque,
  MONO,
  Rangee,
  Section,
  Texte,
  TitreEcran,
  Valeur,
} from '@/ui/primitives'

/**
 * Engagements : les trois natures, sur un seul écran.
 *
 * Elles répondent à la même question — qu'est-ce que je me suis promis ? — mais
 * obéissent à des lois différentes, et c'est précisément ce que cet écran doit
 * enseigner. Chaque section porte sa loi en toutes lettres : quelqu'un qui ouvre
 * l'application pour la première fois ne connaît pas le vocabulaire du moteur.
 *
 * Les séparer en trois écrans obligeait à trois voyages pour voir une seule
 * chose, et effaçait le contraste qui les rend compréhensibles.
 */
const LIMITE_VISIBLE = 2

export default function Engagements() {
  const marges = useSafeAreaInsets()
  const j = useJetons()
  const d = useDonnees()

  const [ajout, setAjout] = useState<'aucun' | 'tache' | 'objectif' | 'ancre'>('aucun')
  const [etenduTaches, setEtenduTaches] = useState(false)
  const [etenduObjectifs, setEtenduObjectifs] = useState(false)
  const [etenduAncres, setEtenduAncres] = useState(false)

  const largeur = useLargeur()
  // Une colonne sous 760 points, deux jusqu'a 1100, trois au-dela — comme le
  // bureau. La largeur est CALCULEE plutot que laissee a `flex: 1` : avec
  // `flexWrap`, trois enfants extensibles se serrent sur une seule ligne quoi
  // qu'il arrive, et on obtiendrait trois colonnes etranglees a 760.
  // Sur ecran large, la largeur est plafonnee a 1200 points pour eviter le
  // "canyon" de vide entre libelle et duree (Board.tsx).
  const colonnes = largeur.troisColonnes ? 3 : largeur.deuxColonnes ? 2 : 1
  const largeurMax = Math.min(largeur.points, 1200)
  const dispo = largeurMax - PAS[5] * 2
  const ecart = PAS[5]
  const largeurColonne = colonnes === 1 ? undefined : (dispo - ecart * (colonnes - 1)) / colonnes

  const fait = useSeances((e) => e.apprentissage.workedMinutesByRef)
  const ouvertes = d.taches.filter((t) => !t.terminee)
  const faites = d.taches.filter((t) => t.terminee)
  // Le compte affiche les RACINES, pas les lignes : une tache decoupee en
  // cinq parties reste une tache a faire, pas cinq.
  const groupes = grouperTaches(ouvertes, fait)

  // Troncature a 2 elements par defaut pour chaque section
  const totalTaches = groupes.length + faites.length
  const tachesCachees = Math.max(0, totalTaches - LIMITE_VISIBLE)
  const groupesVisibles = etenduTaches ? groupes : groupes.slice(0, LIMITE_VISIBLE)
  const restePourFaites = etenduTaches ? faites.length : Math.max(0, LIMITE_VISIBLE - groupesVisibles.length)
  const faitesVisibles = etenduTaches ? faites : faites.slice(0, restePourFaites)

  const totalObjectifs = d.objectifs.length
  const objectifsCaches = Math.max(0, totalObjectifs - LIMITE_VISIBLE)
  const objectifsVisibles = etenduObjectifs ? d.objectifs : d.objectifs.slice(0, LIMITE_VISIBLE)

  const totalAncres = d.ancres.length
  const ancresCachees = Math.max(0, totalAncres - LIMITE_VISIBLE)
  const ancresVisibles = etenduAncres ? d.ancres : d.ancres.slice(0, LIMITE_VISIBLE)

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: j.bg }}
      contentContainerStyle={{
        paddingTop: marges.top + PAS[5],
        paddingBottom: PAS[12],
        paddingHorizontal: PAS[5],
        alignItems: 'center',
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: 1200 }}>
        {/* Titre */}
        <View style={{ marginBottom: PAS[5] }}>
          <TitreEcran>Commitments</TitreEcran>
          <Text
            style={{
              fontFamily: GEIST.normal,
              fontSize: 14,
              color: j.text3,
              marginTop: 4,
              lineHeight: 20,
            }}
          >
            Three natures, one architecture. What you promised yourself, ruled by law.
          </Text>
        </View>

        {/* Les trois natures encadrées chacune dans leur boîte (« carré »),
            côte à côte dès qu'elles tiennent, empilées sur téléphone. */}
        <View
          style={
            colonnes === 1
              ? { flexDirection: 'column', gap: PAS[5] }
              : {
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  gap: PAS[5],
                }
          }
        >
          <CarteEngagement
            largeur={largeurColonne}
            badge="Slack Engine · Deadlines"
            badgeCouleur={j.text2}
          >
            <Section
              premiere
              enColonne
              titre="Tasks"
              compte={groupes.length}
              loi="A deadline and a finite amount of work. Ruled by slack: whatever is due first goes first."
              action={
                <BoutonAjout
                  ouvert={ajout === 'tache'}
                  quoi="a task"
                  surPression={() => setAjout(ajout === 'tache' ? 'aucun' : 'tache')}
                />
              }
            >
              {ajout === 'tache' ? (
                <FormulaireTache
                  surFin={() => {
                    setAjout('aucun')
                    setEtenduTaches(true)
                  }}
                />
              ) : null}

              {ouvertes.length === 0 && ajout !== 'tache' ? (
                <EtatVide
                  icone={<GlypheTache couleur={j.text3} taille={18} />}
                  titre="No open tasks"
                  description="A task has an end and a date. The engine decides when to do it based on slack."
                  actionTexte="Add a task"
                  surAction={() => setAjout('tache')}
                />
              ) : null}

              {groupesVisibles.map((g, i) => (
                <GroupeTache key={g.racine.id} groupe={g} premiere={i === 0} />
              ))}

              {faitesVisibles.length > 0 ? (
                <>
                  <Espace h={4} />
                  <Texte ton="eteint" taille={12.5}>
                    {faites.length} finished
                  </Texte>
                  {faitesVisibles.map((t, i) => (
                    <LigneTache
                      key={t.id}
                      tache={t}
                      premiere={groupesVisibles.length === 0 && i === 0}
                    />
                  ))}
                </>
              ) : null}

              {tachesCachees > 0 ? (
                <BoutonVoirPlus
                  nombreCache={tachesCachees}
                  ouvert={etenduTaches}
                  surBasculer={() => setEtenduTaches((v) => !v)}
                  quoi="tasks"
                />
              ) : null}
            </Section>
          </CarteEngagement>

          <CarteEngagement
            largeur={largeurColonne}
            badge="Rhythm Engine · Habits"
            badgeCouleur={j.accentEncre}
          >
            <Section
              premiere
              enColonne
              titre="Goals"
              compte={d.objectifs.length}
              loi="A weekly target, never a deadline. Ruled by rhythm: it moves forward without ever being late."
              action={
                <BoutonAjout
                  ouvert={ajout === 'objectif'}
                  quoi="a goal"
                  surPression={() => setAjout(ajout === 'objectif' ? 'aucun' : 'objectif')}
                />
              }
            >
              {ajout === 'objectif' ? (
                <FormulaireObjectif
                  surFin={() => {
                    setAjout('aucun')
                    setEtenduObjectifs(true)
                  }}
                />
              ) : null}

              {d.objectifs.length === 0 && ajout !== 'objectif' ? (
                <EtatVide
                  icone={<GlypheObjectif couleur={j.text3} taille={18} />}
                  titre="No weekly goals"
                  description="A goal never finishes: it is measured in hours per week and repeated rhythm."
                  actionTexte="Add a goal"
                  surAction={() => setAjout('objectif')}
                />
              ) : null}

              {objectifsVisibles.map((o, i) => {
                const indexReel = d.objectifs.indexOf(o)
                return (
                  <Rangee key={o.id} premiere={i === 0}>
                    <Marque couleur={assainirCouleur('objective', o.couleur, indexReel >= 0 ? indexReel : i)} />
                    <View style={{ flex: 1 }}>
                      <Texte>{o.nom}</Texte>
                      <Texte ton="eteint" taille={12.5}>
                        {duree(Math.round(o.cibleHebdoMinutes / 7))} a day
                      </Texte>
                    </View>
                    <Valeur>{duree(o.cibleHebdoMinutes)}</Valeur>
                    <Supprimer quoi={o.nom} surPression={() => void d.supprimerObjectif(o.id)} />
                  </Rangee>
                )
              })}

              {objectifsCaches > 0 ? (
                <BoutonVoirPlus
                  nombreCache={objectifsCaches}
                  ouvert={etenduObjectifs}
                  surBasculer={() => setEtenduObjectifs((v) => !v)}
                  quoi="goals"
                />
              ) : null}
            </Section>
          </CarteEngagement>

          <CarteEngagement
            largeur={largeurColonne}
            badge="Stability Engine · Appointments"
            badgeCouleur={j.blocEncreAncre}
          >
            <Section
              premiere
              enColonne
              titre="Anchors"
              compte={d.ancres.length}
              loi="A fixed hour, chosen once. Ruled by stability: it never moves from one day to the next."
              action={
                <BoutonAjout
                  ouvert={ajout === 'ancre'}
                  quoi="an anchor"
                  surPression={() => setAjout(ajout === 'ancre' ? 'aucun' : 'ancre')}
                />
              }
            >
              {ajout === 'ancre' ? (
                <FormulaireAncre
                  surFin={() => {
                    setAjout('aucun')
                    setEtenduAncres(true)
                  }}
                />
              ) : null}

              {d.ancres.length === 0 && ajout !== 'ancre' ? (
                <EtatVide
                  icone={<GlypheAncre couleur={j.text3} taille={18} />}
                  titre="No fixed anchors"
                  description="An anchor is an appointment the plan works around, never the other way."
                  actionTexte="Add an anchor"
                  surAction={() => setAjout('ancre')}
                />
              ) : null}

              {ancresVisibles.map((a, i) => {
                const indexReel = d.ancres.indexOf(a)
                return (
                  <Rangee key={a.id} premiere={i === 0}>
                    <Marque couleur={assainirCouleur('ancre', a.couleur, indexReel >= 0 ? indexReel : i)} />
                    <View style={{ flex: 1 }}>
                      <Texte>{a.nom}</Texte>
                      <Texte ton="eteint" taille={12.5}>
                        {joursEnTexte(a.jours)}
                      </Texte>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Valeur>{enHeure(a.minuteAncrage)}</Valeur>
                      <Valeur ton="doux" taille={11.5}>
                        {duree(a.dureeMinutes)}
                      </Valeur>
                    </View>
                    <Supprimer quoi={a.nom} surPression={() => void d.supprimerAncre(a.id)} />
                  </Rangee>
                )
              })}

              {ancresCachees > 0 ? (
                <BoutonVoirPlus
                  nombreCache={ancresCachees}
                  ouvert={etenduAncres}
                  surBasculer={() => setEtenduAncres((v) => !v)}
                  quoi="anchors"
                />
              ) : null}
            </Section>
          </CarteEngagement>
        </View>
      </View>
    </ScrollView>
  )
}

/**
 * Une boîte (« carré ») qui encadre et sépare nettement chacune des trois natures.
 *
 * En colonne unique ou sur plusieurs colonnes, chaque section vit
 * dans son propre cadre en surface sombre, avec sa bordure et ses marges.
 */
function CarteEngagement({
  largeur,
  badge,
  badgeCouleur,
  children,
}: {
  largeur: number | undefined
  badge: string
  badgeCouleur: string
  children: React.ReactNode
}) {
  const j = useJetons()
  return (
    <View
      style={{
        width: largeur ?? '100%',
        backgroundColor: j.surface,
        borderWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.12)',
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
        borderLeftColor: 'rgba(255, 255, 255, 0.08)',
        borderRightColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: RAYON.xl,
        padding: PAS[5],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginBottom: PAS[3],
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: badgeCouleur,
          }}
        />
        <Text
          style={{
            fontFamily: MONO.demi,
            fontSize: 10,
            letterSpacing: 0.8,
            color: j.text3,
            textTransform: 'uppercase',
          }}
        >
          {badge}
        </Text>
      </View>
      {children}
    </View>
  )
}


/**
 * État vide accueillant avec icône de nature et action directe.
 */
function EtatVide({
  icone,
  titre,
  description,
  actionTexte,
  surAction,
}: {
  icone: React.ReactNode
  titre: string
  description: string
  actionTexte: string
  surAction: () => void
}) {
  const j = useJetons()
  return (
    <View
      style={{
        paddingVertical: PAS[5],
        paddingHorizontal: PAS[3],
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RAYON.md,
        borderWidth: 1,
        borderColor: j.line,
        borderStyle: 'dashed',
        backgroundColor: 'rgba(255, 255, 255, 0.01)',
        gap: PAS[2],
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: j.surface2,
          borderWidth: 1,
          borderColor: j.line,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icone}
      </View>
      <Text style={{ fontFamily: GEIST.demi, fontSize: 13, color: j.text2 }}>{titre}</Text>
      <Text
        style={{
          fontFamily: GEIST.normal,
          fontSize: 11.5,
          color: j.text3,
          textAlign: 'center',
          maxWidth: 240,
          lineHeight: 16,
        }}
      >
        {description}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={surAction}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: PAS[1],
          marginTop: PAS[2],
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: RAYON.sm,
          borderWidth: 1,
          borderColor: j.lineForte,
          backgroundColor: pressed ? j.surface2 : 'transparent',
          transform: [{ translateY: pressed ? 1 : 0 }],
        })}
      >
        <Plus couleur={j.accentEncre} taille={12} />
        <Text style={{ fontFamily: GEIST.demi, fontSize: 12, color: j.text2 }}>{actionTexte}</Text>
      </Pressable>
    </View>
  )
}

/**
 * Bouton discret avec glyphe "+" pour déplier/replier les éléments au-delà de 2.
 */
function BoutonVoirPlus({
  nombreCache,
  ouvert,
  surBasculer,
  quoi,
}: {
  nombreCache: number
  ouvert: boolean
  surBasculer: () => void
  quoi: string
}) {
  const j = useJetons()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ouvert ? `Show fewer ${quoi}` : `Show ${nombreCache} more ${quoi}`}
      accessibilityState={{ expanded: ouvert }}
      onPress={surBasculer}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: PAS[2],
        paddingVertical: PAS[2] + 2,
        paddingHorizontal: PAS[3],
        marginTop: PAS[4],
        borderRadius: RAYON.md,
        borderWidth: 1,
        borderColor: ouvert ? j.lineForte : j.line,
        backgroundColor: pressed ? j.surface2 : 'rgba(255, 255, 255, 0.02)',
        transform: [{ translateY: pressed ? 1 : 0 }],
      })}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: j.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ouvert ? (
          <Moins couleur={j.text2} taille={11} />
        ) : (
          <Plus couleur={j.accentEncre} taille={11} />
        )}
      </View>
      <Text style={{ fontFamily: GEIST.demi, fontSize: 12.5, color: j.text2 }}>
        {ouvert ? 'Show less' : `+${nombreCache} more ${quoi}`}
      </Text>
    </Pressable>
  )
}

// ─── Lignes ────────────────────────────────────────────────────────────────

/** B.5.2 : le pas de « il m'en faut plus », le meme que sur l'accueil. */
const PAS_DE_TEMPS = 25

type Groupe = {
  racine: Tache
  /** Vide si la tache n'a pas ete decoupee. */
  parties: Tache[]
  /** Ce qu'il y a a faire en tout, correction et temps accorde compris. */
  prevu: number
  /** Ce qui a ete REELLEMENT mesure. Jamais declare. */
  mesure: number
}

/**
 * Les parties sous leur tache d'origine, jamais a cote.
 *
 * Mises a plat, « Dossier », « Dossier — Partie 1 » et « Dossier — Partie 2 »
 * se lisent comme trois travaux distincts, et le total de la liste compte deux
 * fois le meme temps. Le regroupement n'est pas une commodite d'affichage : il
 * dit ce qui est vrai.
 */
function grouperTaches(ouvertes: readonly Tache[], fait: Record<string, number>): Groupe[] {
  const total = (t: Tache) => t.minutesRestantes + t.minutesSupplementaires
  const racines = ouvertes.filter((t) => t.parentId === null)

  return racines.map((racine) => {
    const parties = ouvertes
      .filter((t) => t.parentId === racine.id)
      .sort((a, b) => (a.rangPartie ?? 0) - (b.rangPartie ?? 0))

    if (parties.length === 0) {
      return { racine, parties, prevu: total(racine), mesure: fait[racine.id] ?? 0 }
    }
    // La racine d'un groupe ne porte aucun travail propre : tout est passe aux
    // parties. La compter reviendrait a la compter deux fois.
    return {
      racine,
      parties,
      prevu: parties.reduce((s, p) => s + total(p), 0),
      mesure: parties.reduce((s, p) => s + (fait[p.id] ?? 0), 0),
    }
  })
}

/** Le titre d'une partie, sans repeter celui de sa tache. */
function titreDePartie(partie: Tache, racine: Tache): string {
  const prefixe = `${racine.titre} — `
  if (partie.titre.startsWith(prefixe)) return partie.titre.slice(prefixe.length)
  return partie.rangPartie !== null ? `Part ${partie.rangPartie}` : partie.titre
}

function GroupeTache({ groupe, premiere }: { groupe: Groupe; premiere?: boolean }) {
  const j = useJetons()
  const d = useDonnees()
  const fait = useSeances((e) => e.apprentissage.workedMinutesByRef)
  const { racine, parties, prevu, mesure } = groupe
  const part = prevu > 0 ? Math.min(1, mesure / prevu) : 0

  return (
    <View style={{ borderTopWidth: premiere ? 0 : 1, borderTopColor: j.line, paddingVertical: PAS[3], gap: PAS[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[3] }}>
        <Marque couleur={assainirCouleur('task', racine.couleur, 0)} />
        <View style={{ flex: 1, gap: 3 }}>
          <Texte>{racine.titre}</Texte>
          <Texte ton="eteint" taille={12.5}>
            {quandEcheance(racine.echeance)}
            {parties.length > 0 ? ` · ${parties.length} parts` : ''}
            {racine.minutesSupplementaires > 0 ? ` · +${duree(racine.minutesSupplementaires)}` : ''}
          </Texte>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Valeur ton={racine.importance >= 8 ? 'accent' : 'normal'}>{duree(prevu)}</Valeur>
          <Valeur ton="doux" taille={11.5}>{racine.importance}/10</Valeur>
        </View>

        {/* B.5.2 : le seul geste qui touche encore a une tache. Il ne la
            termine pas — il reconnait que l'estimation etait courte. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Grant ${PAS_DE_TEMPS} more minutes to ${racine.titre}`}
          onPress={() => void d.ajouterDuTemps(parties[0]?.id ?? racine.id, PAS_DE_TEMPS)}
          hitSlop={6}
          style={({ pressed }) => ({
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: RAYON.sm,
            borderWidth: 1,
            borderColor: pressed ? j.lineForte : j.line,
            backgroundColor: pressed ? j.surface3 : j.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ translateY: pressed ? 1 : 0 }],
          })}
        >
          <Text style={{ fontFamily: MONO.demi, fontSize: 11, color: j.text2 }}>+{PAS_DE_TEMPS}m</Text>
        </Pressable>

        <Supprimer quoi={racine.titre} surPression={() => void d.supprimerTache(racine.id)} />
      </View>

      {/* Ce qui a ete MESURE, pas ce qui a ete promis. La barre ne bouge
          qu'apres un « Je commence » et une fenetre ecoulee. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[2], paddingLeft: PAS[4] }}>
        <View style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
          <View style={{ width: `${part * 100}%`, height: 3, borderRadius: 1.5, backgroundColor: j.accent }} />
        </View>
        <Text style={{ fontFamily: MONO.normal, fontSize: 10.5, color: j.text3, fontVariant: ['tabular-nums'] }}>
          {duree(mesure)} done
        </Text>
      </View>

      {parties.map((p) => {
        // B.5.1 : verrouillee tant qu'une soeur de rang anterieur est active.
        const verrouillee = parties.some(
          (s) => s.rangPartie !== null && p.rangPartie !== null && s.rangPartie < p.rangPartie,
        )
        return (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[2], paddingLeft: PAS[4] }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: verrouillee ? j.text3 : j.text2 }} />
            <Text style={{ flex: 1, fontFamily: GEIST.normal, fontSize: 12.5, color: verrouillee ? j.text3 : j.text2 }}>
              {titreDePartie(p, racine)}
              {verrouillee ? ' · waiting' : ''}
            </Text>
            <Text style={{ fontFamily: MONO.normal, fontSize: 11, color: j.text3, fontVariant: ['tabular-nums'] }}>
              {duree(fait[p.id] ?? 0)} / {duree(p.minutesRestantes + p.minutesSupplementaires)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function LigneTache({ tache, premiere }: { tache: Tache; premiere?: boolean }) {
  const j = useJetons()
  const d = useDonnees()
  return (
    <Rangee premiere={premiere}>
      {/* Une case, pas une commande. La complétion se CONSTATE : elle arrive
          quand le temps planifié a réellement été fait, mesuré séance après
          séance (B.5.2). Un clic qui termine une tâche serait une déclaration,
          et une déclaration n'apprend rien au moteur. */}
      <View
        accessible
        accessibilityLabel={tache.terminee ? 'Finished' : 'In progress'}
        style={{
          width: 20,
          height: 20,
          borderRadius: RAYON.sm,
          borderWidth: 1,
          borderColor: tache.terminee ? j.accent : j.lineForte,
          backgroundColor: tache.terminee ? j.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {tache.terminee ? <Coche couleur={j.accentSur} taille={12} /> : null}
      </View>

      <View style={{ flex: 1, opacity: tache.terminee ? 0.45 : 1 }}>
        <Texte>{tache.titre}</Texte>
        <Texte ton="eteint" taille={12.5}>
          {tache.terminee ? 'finished — the time was done' : quandEcheance(tache.echeance)}
        </Texte>
      </View>

      <View style={{ alignItems: 'flex-end', opacity: tache.terminee ? 0.45 : 1 }}>
        <Valeur ton={tache.importance >= 8 && !tache.terminee ? 'accent' : 'normal'}>
          {duree(tache.minutesEstimees)}
        </Valeur>
        <Valeur ton="doux" taille={11.5}>
          {tache.importance}/10
        </Valeur>
      </View>

      <Supprimer quoi={tache.titre} surPression={() => void d.supprimerTache(tache.id)} />
    </Rangee>
  )
}

function Supprimer({ surPression, quoi }: { surPression: () => void; quoi: string }) {
  const j = useJetons()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Delete ${quoi}`}
      onPress={surPression}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? j.surface2 : 'transparent',
        opacity: pressed ? 1 : 0.65,
        transform: [{ translateY: pressed ? 1 : 0 }],
      })}
    >
      <Croix couleur={j.text3} taille={14} />
    </Pressable>
  )
}

/**
 * Le « + » d'une section.
 *
 * Il porte un NOM, et c'est obligatoire : un bouton dont le seul contenu est
 * un glyphe dessine n'a rien a annoncer a VoiceOver. Trois boutons identiques
 * et muets sur le meme ecran, c'etait trois « bouton » lus a la suite, sans
 * moyen de savoir lequel ajoutait quoi.
 */
function BoutonAjout({ ouvert, quoi, surPression }: { ouvert: boolean; quoi: string; surPression: () => void }) {
  const j = useJetons()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ouvert ? 'Close the form' : `Add ${quoi}`}
      accessibilityState={{ expanded: ouvert }}
      onPress={surPression}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: ouvert ? j.accent : j.lineForte,
        backgroundColor: ouvert ? j.accentDoux : pressed ? j.surface2 : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: ouvert ? '45deg' : '0deg' }, { translateY: pressed ? 1 : 0 }],
      })}
    >
      <Plus couleur={ouvert ? j.accentEncre : j.text2} taille={14} />
    </Pressable>
  )
}

// ─── Formulaires ───────────────────────────────────────────────────────────

/**
 * Le formulaire de tache, celui du bureau.
 *
 * Deux champs y sont obligatoires, pas un : le titre **et le plan**. Le
 * bureau l'exige parce qu'une tache sans plan est un vœu — « avancer sur le
 * memoire » ne dit ni ou, ni quoi, ni comment commencer, et c'est exactement
 * la forme qu'on ne demarre jamais.
 *
 * La nature se declare aussi, parce qu'elle change le chiffre : une premiere
 * fois est majoree de 70 %, un travail connu de 40 % (B.1).
 */
function FormulaireTache({ surFin }: { surFin: () => void }) {
  const d = useDonnees()
  const { resultat } = usePlan()
  const [titre, setTitre] = useState('')
  const [intention, setIntention] = useState('')
  const [minutes, setMinutes] = useState('60')
  // Une tâche se termine dans le mois : on la déplace ensuite si besoin.
  const [echeance, setEcheance] = useState(() => dansNJours(7))
  const [importance, setImportance] = useState(5)
  const [nature, setNature] = useState<Tache['nature']>('routine')

  const complet = !!titre.trim() && !!intention.trim()

  const valider = async () => {
    if (!complet) return
    const couleur = allouerCouleurTache(d.taches.filter((x) => !x.terminee))
    await d.ajouterTache(
      {
        titre: titre.trim(),
        intention: intention.trim(),
        couleur,
        echeance,
        importance,
        minutesEstimees: Math.max(5, Number(minutes) || 60),
        nature,
      },
      // B.5 : le decoupage a besoin de savoir ce qu'une journee absorbe. Ce
      // plafond vient du plan courant, jamais d'une constante.
      { maxParJourMinutes: maxTaskMinutesPerDay(resultat.capacities) },
    )
    surFin()
  }

  return (
    <Formulaire surAnnuler={surFin} surValider={() => void valider()} peutValider={complet}>
      <Champ etiquette="Task title" valeur={titre} surChangement={setTitre} exemple="Finish the report" premier />
      <Champ
        etiquette="The plan: what this concretely involves"
        valeur={intention}
        surChangement={setIntention}
        exemple="Tonight at my desk, I write the first three pages."
        multiligne
      />
      <Etiquetee titre="How long it will take">
        <RoueDuree minutes={Number(minutes) || 0} changer={(v) => setMinutes(String(v))} etiquette="Estimated duration" maxHeures={150} pasMinutes={15} minimum={15} compact />
      </Etiquetee>
      <Etiquetee titre="Done by (at most a month ahead)">
        <RoueJour valeur={echeance} changer={setEcheance} jours={30} etiquette="Deadline" />
      </Etiquetee>
      <Bascule
        valeur={nature}
        surChangement={setNature}
        choix={[
          ['routine', 'Done before'],
          ['nouveau', 'First time'],
        ]}
      />
      <Echelle valeur={importance} surChangement={setImportance} />
    </Formulaire>
  )
}

/** Deux cibles exclusives, assez larges pour le pouce. */
function Bascule<T extends string>({
  valeur,
  surChangement,
  choix,
}: {
  valeur: T
  surChangement: (v: T) => void
  choix: readonly (readonly [T, string])[]
}) {
  const j = useJetons()
  return (
    <View style={{ flexDirection: 'row', gap: PAS[2] }}>
      {choix.map(([cle, nom]) => {
        const actif = cle === valeur
        return (
          <Pressable
            key={cle}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
            onPress={() => surChangement(cle)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 40,
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
              {nom}
            </Texte>
          </Pressable>
        )
      })}
    </View>
  )
}

function FormulaireObjectif({ surFin }: { surFin: () => void }) {
  const d = useDonnees()
  const [nom, setNom] = useState('')
  const [intention, setIntention] = useState('')
  const [heures, setHeures] = useState('5')

  const complet = !!nom.trim() && !!intention.trim()

  const valider = async () => {
    if (!complet) return
    await d.ajouterObjectif({
      nom: nom.trim(),
      intention: intention.trim(),
      couleur: allouerCouleurObjectif(d.objectifs),
      cibleHebdoMinutes: Math.max(0, Math.round((Number(heures) || 5) * 60)),
    })
    surFin()
  }

  return (
    <Formulaire surAnnuler={surFin} surValider={() => void valider()} peutValider={complet}>
      <Champ etiquette="Goal name" valeur={nom} surChangement={setNom} exemple="Guitar, sport, reading…" premier />
      <Champ
        etiquette="The plan: what this concretely involves"
        valeur={intention}
        surChangement={setIntention}
        exemple="What does it involve? E.g. every evening at the studio, an hour of scales."
        multiligne
      />
      <Etiquetee titre="Every week">
        <RoueDuree minutes={Math.round((Number(heures.replace(',', '.')) || 0) * 60)} changer={(v) => setHeures(String(v / 60))} etiquette="Time per week" maxHeures={100} pasMinutes={15} minimum={15} compact />
      </Etiquetee>
    </Formulaire>
  )
}

function FormulaireAncre({ surFin }: { surFin: () => void }) {
  const d = useDonnees()
  const j = useJetons()
  const [nom, setNom] = useState('')
  const [intention, setIntention] = useState('')
  const [heure, setHeure] = useState('12:30')
  const [minutes, setMinutes] = useState('60')
  const [jours, setJours] = useState([1, 2, 3, 4, 5])
  const [erreur, setErreur] = useState('')

  const complet = !!nom.trim() && !!intention.trim() && jours.length > 0

  const valider = async () => {
    if (!complet) return
    setErreur('')
    try {
      await d.ajouterAncre({
        nom: nom.trim(),
        declencheur: nom.trim().toLowerCase(),
        intention: intention.trim(),
        couleur: allouerCouleurAncre(d.ancres),
        minuteAncrage: versMinuteSure(heure),
        jours,
        dureeMinutes: Math.max(15, Number(minutes) || 60),
      })
      surFin()
    } catch (e) {
      // D.3 : l'ancre est REFUSEE, jamais decalee en silence. Le refus doit
      // donc se lire — une creation qui n'aboutit pas sans un mot passe pour
      // une panne.
      setErreur(e instanceof Error ? e.message : 'Could not create.')
    }
  }

  return (
    <Formulaire surAnnuler={surFin} surValider={() => void valider()} peutValider={complet}>
      <Champ etiquette="Anchor name" valeur={nom} surChangement={setNom} exemple="Sport, reading, meditation…" premier />
      <Champ
        etiquette="The plan: what this concretely involves"
        valeur={intention}
        surChangement={setIntention}
        exemple="What does it involve? E.g. tonight at the gym, 45 min upper body."
        multiligne
      />
      <View style={{ flexDirection: 'row', gap: PAS[2] }}>
        <Etiquetee titre="At">
          <RoueHeure valeur={heure} changer={setHeure} etiquette="Anchor time" compact />
        </Etiquetee>
        <Etiquetee titre="For">
          <RoueDuree minutes={Number(minutes) || 0} changer={(v) => setMinutes(String(v))} etiquette="Anchor duration" maxHeures={8} minimum={15} compact />
        </Etiquetee>
      </View>
      <ChoixJours valeur={jours} surChangement={setJours} />
      {erreur ? (
        <Text accessibilityRole="alert" style={{ fontFamily: GEIST.normal, fontSize: 12.5, lineHeight: 19, color: j.accentEncre }}>
          {erreur}
        </Text>
      ) : null}
    </Formulaire>
  )
}

/** Le cadre commun : un panneau, un seul, jamais imbriqué. */
function Formulaire({
  children,
  surAnnuler,
  surValider,
  peutValider,
}: {
  children: React.ReactNode
  surAnnuler: () => void
  surValider: () => void
  peutValider: boolean
}) {
  const j = useJetons()
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: j.line,
        borderRadius: RAYON.md,
        padding: PAS[4],
        marginBottom: PAS[4],
        gap: PAS[3],
        backgroundColor: j.surface2,
      }}
    >
      {children}
      <View style={{ flexDirection: 'row', gap: PAS[2], marginTop: PAS[1] }}>
        <BoutonPlat onPress={surAnnuler} style={{ flex: 1 }}>
          Cancel
        </BoutonPlat>
        <BoutonIris onPress={surValider} desactive={!peutValider} style={{ flex: 1 }}>
          Add
        </BoutonIris>
      </View>
    </View>
  )
}

/** Une roue et ce qu'elle règle, au-dessus. */
function Etiquetee({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, gap: PAS[2] }}>
      <Texte ton="eteint" taille={12.5}>
        {titre}
      </Texte>
      {children}
    </View>
  )
}

function Champ({
  valeur,
  surChangement,
  exemple,
  suffixe,
  numerique,
  premier,
  multiligne,
  etiquette,
}: {
  valeur: string
  surChangement: (v: string) => void
  exemple: string
  suffixe?: string
  numerique?: boolean
  premier?: boolean
  multiligne?: boolean
  /**
   * Ce que le champ demande, pour qui ne le voit pas.
   *
   * L'exemple sert de repli, mais il ne le remplace pas : un lecteur d'ecran
   * n'annonce le placeholder que tant que le champ est VIDE. Une fois rempli,
   * un champ sans etiquette ne dit plus que sa valeur — « 60 », sans jamais
   * dire 60 quoi.
   */
  etiquette?: string
}) {
  const j = useJetons()
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: PAS[2] }}>
      <TextInput
        accessibilityLabel={etiquette ?? exemple}
        value={valeur}
        onChangeText={surChangement}
        placeholder={exemple}
        placeholderTextColor={j.text3}
        keyboardType={numerique ? 'number-pad' : 'default'}
        multiline={multiligne}
        numberOfLines={multiligne ? 3 : 1}
        style={{
          flex: 1,
          ...(multiligne ? { minHeight: 68, textAlignVertical: 'top' as const } : {}),
          backgroundColor: j.champBg,
          borderWidth: 1,
          borderColor: j.lineForte,
          borderRadius: RAYON.md,
          paddingHorizontal: PAS[3],
          paddingVertical: PAS[2] + 2,
          color: j.text,
          // Les valeurs se saisissent en chiffres alignés, comme elles s'affichent.
          fontFamily: numerique ? MONO.normal : GEIST.normal,
          fontSize: premier ? 15 : 14,
        }}
      />
      {suffixe ? <Texte ton="eteint" taille={12.5}>{suffixe}</Texte> : null}
    </View>
  )
}

/**
 * Les sept jours d'une ancre.
 *
 * L'ordre part du lundi, celui de la semaine vecue — pas du dimanche, qui
 * n'est la convention que de JavaScript.
 */
function ChoixJours({ valeur, surChangement }: { valeur: number[]; surChangement: (v: number[]) => void }) {
  const j = useJetons()
  const noms = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const basculer = (n: number) =>
    surChangement(valeur.includes(n) ? valeur.filter((v) => v !== n) : [...valeur, n])

  return (
    <View style={{ gap: PAS[2] }}>
      <Texte ton="eteint" taille={12.5}>Days</Texte>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {[1, 2, 3, 4, 5, 6, 0].map((n) => {
          const actif = valeur.includes(n)
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={noms[n]}
              accessibilityState={{ selected: actif }}
              onPress={() => basculer(n)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: RAYON.sm,
                borderWidth: 1,
                borderColor: actif ? j.accent : j.line,
                backgroundColor: actif ? j.accentDoux : 'transparent',
                transform: [{ translateY: pressed ? 1 : 0 }],
              })}
            >
              <Texte ton={actif ? 'accent' : 'eteint'} taille={11.5}>{noms[n]![0]!.toUpperCase()}</Texte>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** Dix cibles plutôt qu'une glissière : le doigt vise mieux qu'il ne glisse. */
function Echelle({ valeur, surChangement }: { valeur: number; surChangement: (v: number) => void }) {
  const j = useJetons()
  return (
    <View style={{ gap: PAS[2] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Texte ton="eteint" taille={12.5}>
          Importance
        </Texte>
        <Valeur ton="doux" taille={12}>
          {valeur}/10
        </Valeur>
      </View>
      {/* Dix barres de couleur, et RIEN d'autre : sans role ni nom, un lecteur
          d'ecran ne les voyait pas du tout. L'importance — le champ qui decide
          de l'ordre de passage de toute la semaine — etait simplement
          impossible a regler autrement qu'a l'œil. */}
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`Importance ${n} out of 10`}
            accessibilityState={{ selected: n === valeur }}
            onPress={() => surChangement(n)}
            style={{
              flex: 1,
              height: 26,
              borderRadius: 2,
              backgroundColor: n <= valeur ? j.accent : j.surface3,
            }}
          />
        ))}
      </View>
    </View>
  )
}

// ─── Petites conversions ───────────────────────────────────────────────────

function dansNJours(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + Math.max(0, n))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function quandEcheance(iso: string): string {
  const cible = new Date(`${iso}T00:00:00`)
  const auj = new Date()
  auj.setHours(0, 0, 0, 0)
  const jours = Math.round((cible.getTime() - auj.getTime()) / 86_400_000)
  if (jours < 0) return `${-jours} d overdue`
  if (jours === 0) return 'due today'
  if (jours === 1) return 'due tomorrow'
  return `due in ${jours} days`
}

function joursEnTexte(jours: readonly number[]): string {
  const noms = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (jours.length === 7) return 'every day'
  if (jours.length === 5 && jours.every((n) => n >= 1 && n <= 5)) return 'weekdays'
  if (jours.length === 2 && jours.includes(0) && jours.includes(6)) return 'weekends'
  return jours.map((n) => noms[n]).join(' · ')
}

function versMinuteSure(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return Math.min(1439, Math.max(0, (h ?? 12) * 60 + (m ?? 0)))
}
