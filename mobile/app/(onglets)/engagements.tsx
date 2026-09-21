import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { teinteSuivante } from '@shared/teintes'
import { useDonnees, type Tache } from '@/donnees/magasin'
import { useSeances } from '@/seances/magasin-seances'
import { usePlan } from '@/plan/Plan'
import { maxTaskMinutesPerDay } from '@shared/planning/placement'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { duree, enHeure } from '@/ui/Horloge'
import { Coche, Croix, Plus } from '@/ui/icones'
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
export default function Engagements() {
  const marges = useSafeAreaInsets()
  const j = useJetons()
  const d = useDonnees()

  const [ajout, setAjout] = useState<'aucun' | 'tache' | 'objectif' | 'ancre'>('aucun')

  const fait = useSeances((e) => e.apprentissage.workedMinutesByRef)
  const ouvertes = d.taches.filter((t) => !t.terminee)
  const faites = d.taches.filter((t) => t.terminee)
  // Le compte affiche les RACINES, pas les lignes : une tache decoupee en
  // cinq parties reste une tache a faire, pas cinq.
  const groupes = grouperTaches(ouvertes, fait)

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
      <TitreEcran>Engagements</TitreEcran>

      <Section
        premiere
        titre="Tâches"
        compte={groupes.length}
        loi="Une échéance et une quantité finie de travail. Gouvernée par la marge : ce qui est dû en premier passe en premier."
        action={<BoutonAjout ouvert={ajout === 'tache'} quoi="une tâche" surPression={() => setAjout(ajout === 'tache' ? 'aucun' : 'tache')} />}
      >
        {ajout === 'tache' ? <FormulaireTache surFin={() => setAjout('aucun')} /> : null}

        {ouvertes.length === 0 && ajout !== 'tache' ? (
          <Texte ton="doux">
            Rien à finir. Une tâche a une fin et une date — le moteur décide quand la faire.
          </Texte>
        ) : null}

        {groupes.map((g, i) => (
          <GroupeTache key={g.racine.id} groupe={g} premiere={i === 0} />
        ))}

        {faites.length > 0 ? (
          <>
            <Espace h={4} />
            <Texte ton="eteint" taille={12.5}>
              {faites.length} terminée{faites.length > 1 ? 's' : ''}
            </Texte>
            {faites.map((t) => (
              <LigneTache key={t.id} tache={t} />
            ))}
          </>
        ) : null}
      </Section>

      <Section
        titre="Objectifs"
        compte={d.objectifs.length}
        loi="Une cible par semaine, jamais d’échéance. Gouverné par le rythme : il avance sans jamais être en retard."
        action={<BoutonAjout ouvert={ajout === 'objectif'} quoi="un objectif" surPression={() => setAjout(ajout === 'objectif' ? 'aucun' : 'objectif')} />}
      >
        {ajout === 'objectif' ? <FormulaireObjectif surFin={() => setAjout('aucun')} /> : null}

        {d.objectifs.length === 0 && ajout !== 'objectif' ? (
          <Texte ton="doux">
            Rien encore. Un objectif ne se termine pas : il se mesure en heures par semaine.
          </Texte>
        ) : null}

        {d.objectifs.map((o, i) => (
          <Rangee key={o.id} premiere={i === 0}>
            <Marque couleur={o.couleur} />
            <View style={{ flex: 1 }}>
              <Texte>{o.nom}</Texte>
              <Texte ton="eteint" taille={12.5}>
                {duree(Math.round(o.cibleHebdoMinutes / 7))} par jour
              </Texte>
            </View>
            <Valeur>{duree(o.cibleHebdoMinutes)}</Valeur>
            <Supprimer quoi={o.nom} surPression={() => void d.supprimerObjectif(o.id)} />
          </Rangee>
        ))}
      </Section>

      <Section
        titre="Ancres"
        compte={d.ancres.length}
        loi="Une heure fixe, choisie une fois. Gouvernée par la stabilité : elle ne bouge jamais d’un jour à l’autre."
        action={<BoutonAjout ouvert={ajout === 'ancre'} quoi="une ancre" surPression={() => setAjout(ajout === 'ancre' ? 'aucun' : 'ancre')} />}
      >
        {ajout === 'ancre' ? <FormulaireAncre surFin={() => setAjout('aucun')} /> : null}

        {d.ancres.length === 0 && ajout !== 'ancre' ? (
          <Texte ton="doux">
            Rien encore. Une ancre est un rendez-vous que le plan contourne, jamais l’inverse.
          </Texte>
        ) : null}

        {d.ancres.map((a, i) => (
          <Rangee key={a.id} premiere={i === 0}>
            <Marque couleur={a.couleur} />
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
        ))}
      </Section>
    </ScrollView>
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
  return partie.rangPartie !== null ? `Partie ${partie.rangPartie}` : partie.titre
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
        <View style={{ flex: 1, gap: 3 }}>
          <Texte>{racine.titre}</Texte>
          <Texte ton="eteint" taille={12.5}>
            {quandEcheance(racine.echeance)}
            {parties.length > 0 ? ` · ${parties.length} parties` : ''}
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
          accessibilityLabel={`Accorder ${PAS_DE_TEMPS} minutes de plus à ${racine.titre}`}
          onPress={() => void d.ajouterDuTemps(parties[0]?.id ?? racine.id, PAS_DE_TEMPS)}
          hitSlop={8}
          style={({ pressed }) => ({ minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
        >
          <Text style={{ fontFamily: MONO.demi, fontSize: 12, color: j.text2 }}>+{PAS_DE_TEMPS}</Text>
        </Pressable>

        <Supprimer quoi={racine.titre} surPression={() => void d.supprimerTache(racine.id)} />
      </View>

      {/* Ce qui a ete MESURE, pas ce qui a ete promis. La barre ne bouge
          qu'apres un « Je commence » et une fenetre ecoulee. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[2] }}>
        <View style={{ flex: 1, height: 2, backgroundColor: j.line }}>
          <View style={{ width: `${part * 100}%`, height: 2, backgroundColor: j.accent }} />
        </View>
        <Text style={{ fontFamily: MONO.normal, fontSize: 10.5, color: j.text3, fontVariant: ['tabular-nums'] }}>
          {duree(mesure)} faites
        </Text>
      </View>

      {parties.map((p) => {
        // B.5.1 : verrouillee tant qu'une soeur de rang anterieur est active.
        const verrouillee = parties.some(
          (s) => s.rangPartie !== null && p.rangPartie !== null && s.rangPartie < p.rangPartie,
        )
        return (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[2], paddingLeft: PAS[4] }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: verrouillee ? j.text3 : j.accentEncre }} />
            <Text style={{ flex: 1, fontFamily: GEIST.normal, fontSize: 12.5, color: verrouillee ? j.text3 : j.text2 }}>
              {titreDePartie(p, racine)}
              {verrouillee ? ' · en attente' : ''}
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
        accessibilityLabel={tache.terminee ? 'Terminée' : 'En cours'}
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
          {tache.terminee ? 'terminée — temps fait' : quandEcheance(tache.echeance)}
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
      accessibilityLabel={`Supprimer ${quoi}`}
      onPress={surPression}
      hitSlop={12}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
    >
      <Croix couleur={j.text3} taille={15} />
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
      accessibilityLabel={ouvert ? 'Fermer le formulaire' : `Ajouter ${quoi}`}
      accessibilityState={{ expanded: ouvert }}
      onPress={surPression}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        borderRadius: RAYON.sm,
        borderWidth: 1,
        borderColor: ouvert ? j.accent : j.lineForte,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: ouvert ? '45deg' : '0deg' }, { translateY: pressed ? 1 : 0 }],
      })}
    >
      <Plus couleur={ouvert ? j.accentEncre : j.text2} taille={15} />
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
  const [jours, setJours] = useState('7')
  const [importance, setImportance] = useState(5)
  const [nature, setNature] = useState<Tache['nature']>('routine')

  const complet = !!titre.trim() && !!intention.trim()

  const valider = async () => {
    if (!complet) return
    await d.ajouterTache(
      {
        titre: titre.trim(),
        intention: intention.trim(),
        echeance: dansNJours(Number(jours) || 7),
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
      <Champ etiquette="Titre de la tâche" valeur={titre} surChangement={setTitre} exemple="Finir le dossier" premier />
      <Champ
        etiquette="Le plan : en quoi ça consiste concrètement"
        valeur={intention}
        surChangement={setIntention}
        exemple="Ce soir à mon bureau, je rédige les trois premières pages."
        multiligne
      />
      <View style={{ flexDirection: 'row', gap: PAS[2] }}>
        <Champ etiquette="Durée estimée en minutes" valeur={minutes} surChangement={setMinutes} exemple="60" suffixe="min" numerique />
        <Champ etiquette="Échéance, dans combien de jours" valeur={jours} surChangement={setJours} exemple="7" suffixe="jours" numerique />
      </View>
      <Bascule
        valeur={nature}
        surChangement={setNature}
        choix={[
          ['routine', 'Deja fait'],
          ['nouveau', 'Premiere fois'],
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
      // La teinte est ATTRIBUEE par rang de creation, jamais choisie. Un
      // selecteur de couleur transformerait la liste des engagements en
      // decoration personnelle, et rien de ce temps-la n'avance le plan.
      couleur: teinteSuivante(d.objectifs.length),
      cibleHebdoMinutes: Math.max(0, Math.round((Number(heures) || 5) * 60)),
    })
    surFin()
  }

  return (
    <Formulaire surAnnuler={surFin} surValider={() => void valider()} peutValider={complet}>
      <Champ etiquette="Nom de l’objectif" valeur={nom} surChangement={setNom} exemple="Guitare, sport, lecture…" premier />
      <Champ
        etiquette="Le plan : en quoi ça consiste concrètement"
        valeur={intention}
        surChangement={setIntention}
        exemple="En quoi ça consiste ? Ex. : tous les soirs au studio, une heure de gammes."
        multiligne
      />
      <Champ etiquette="Heures par semaine" valeur={heures} surChangement={setHeures} exemple="5" suffixe="h / semaine" numerique />
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
        // D.3 : le declencheur derive du NOM, comme sur le bureau. Deux ancres
        // qui s'appellent pareil sont la meme ancre, et le conflit doit le dire.
        declencheur: nom.trim().toLowerCase(),
        intention: intention.trim(),
        couleur: j.blocAncre,
        minuteAncrage: versMinuteSure(heure),
        jours,
        dureeMinutes: Math.max(15, Number(minutes) || 60),
      })
      surFin()
    } catch (e) {
      // D.3 : l'ancre est REFUSEE, jamais decalee en silence. Le refus doit
      // donc se lire — une creation qui n'aboutit pas sans un mot passe pour
      // une panne.
      setErreur(e instanceof Error ? e.message : 'Création impossible.')
    }
  }

  return (
    <Formulaire surAnnuler={surFin} surValider={() => void valider()} peutValider={complet}>
      <Champ etiquette="Nom de l’ancre" valeur={nom} surChangement={setNom} exemple="Sport, lecture, méditation…" premier />
      <Champ
        etiquette="Le plan : en quoi ça consiste concrètement"
        valeur={intention}
        surChangement={setIntention}
        exemple="En quoi ça consiste ? Ex. : ce soir à la salle, 45 min de haut du corps."
        multiligne
      />
      <View style={{ flexDirection: 'row', gap: PAS[2] }}>
        <Champ etiquette="Heure de l’ancre" valeur={heure} surChangement={setHeure} exemple="12:30" suffixe="à" />
        <Champ etiquette="Durée en minutes" valeur={minutes} surChangement={setMinutes} exemple="60" suffixe="min" numerique />
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
        backgroundColor: j.surface,
      }}
    >
      {children}
      <View style={{ flexDirection: 'row', gap: PAS[2], marginTop: PAS[1] }}>
        <BoutonPlat onPress={surAnnuler} style={{ flex: 1 }}>
          Annuler
        </BoutonPlat>
        <BoutonIris onPress={surValider} desactive={!peutValider} style={{ flex: 1 }}>
          Ajouter
        </BoutonIris>
      </View>
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
  const noms = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
  const basculer = (n: number) =>
    surChangement(valeur.includes(n) ? valeur.filter((v) => v !== n) : [...valeur, n])

  return (
    <View style={{ gap: PAS[2] }}>
      <Texte ton="eteint" taille={12.5}>Jours</Texte>
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
            accessibilityLabel={`Importance ${n} sur 10`}
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
  if (jours < 0) return `en retard de ${-jours} j`
  if (jours === 0) return 'due aujourd’hui'
  if (jours === 1) return 'due demain'
  return `due dans ${jours} jours`
}

function joursEnTexte(jours: readonly number[]): string {
  const noms = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
  if (jours.length === 7) return 'tous les jours'
  if (jours.length === 5 && jours.every((n) => n >= 1 && n <= 5)) return 'en semaine'
  if (jours.length === 2 && jours.includes(0) && jours.includes(6)) return 'le week-end'
  return jours.map((n) => noms[n]).join(' · ')
}

function versMinuteSure(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return Math.min(1439, Math.max(0, (h ?? 12) * 60 + (m ?? 0)))
}
