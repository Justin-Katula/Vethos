import { useState } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees, type Tache } from '@/donnees/magasin'
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

  const ouvertes = d.taches.filter((t) => !t.terminee)
  const faites = d.taches.filter((t) => t.terminee)

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
        compte={ouvertes.length}
        loi="Une échéance et une quantité finie de travail. Gouvernée par la marge : ce qui est dû en premier passe en premier."
        action={<BoutonAjout ouvert={ajout === 'tache'} surPression={() => setAjout(ajout === 'tache' ? 'aucun' : 'tache')} />}
      >
        {ajout === 'tache' ? <FormulaireTache surFin={() => setAjout('aucun')} /> : null}

        {ouvertes.length === 0 && ajout !== 'tache' ? (
          <Texte ton="doux">
            Rien à finir. Une tâche a une fin et une date — le moteur décide quand la faire.
          </Texte>
        ) : null}

        {ouvertes.map((t, i) => (
          <LigneTache key={t.id} tache={t} premiere={i === 0} />
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
        action={<BoutonAjout ouvert={ajout === 'objectif'} surPression={() => setAjout(ajout === 'objectif' ? 'aucun' : 'objectif')} />}
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
            <Supprimer surPression={() => void d.supprimerObjectif(o.id)} />
          </Rangee>
        ))}
      </Section>

      <Section
        titre="Ancres"
        compte={d.ancres.length}
        loi="Une heure fixe, choisie une fois. Gouvernée par la stabilité : elle ne bouge jamais d’un jour à l’autre."
        action={<BoutonAjout ouvert={ajout === 'ancre'} surPression={() => setAjout(ajout === 'ancre' ? 'aucun' : 'ancre')} />}
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
            <Supprimer surPression={() => void d.supprimerAncre(a.id)} />
          </Rangee>
        ))}
      </Section>
    </ScrollView>
  )
}

// ─── Lignes ────────────────────────────────────────────────────────────────

function LigneTache({ tache, premiere }: { tache: Tache; premiere?: boolean }) {
  const j = useJetons()
  const d = useDonnees()
  return (
    <Rangee premiere={premiere}>
      <Pressable
        onPress={() => void d.basculerTache(tache.id)}
        hitSlop={10}
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
      </Pressable>

      <View style={{ flex: 1, opacity: tache.terminee ? 0.45 : 1 }}>
        <Texte>{tache.titre}</Texte>
        <Texte ton="eteint" taille={12.5}>
          {quandEcheance(tache.echeance)}
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

      <Supprimer surPression={() => void d.supprimerTache(tache.id)} />
    </Rangee>
  )
}

function Supprimer({ surPression }: { surPression: () => void }) {
  const j = useJetons()
  return (
    <Pressable onPress={surPression} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <Croix couleur={j.text3} taille={15} />
    </Pressable>
  )
}

function BoutonAjout({ ouvert, surPression }: { ouvert: boolean; surPression: () => void }) {
  const j = useJetons()
  return (
    <Pressable
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
      <Champ valeur={titre} surChangement={setTitre} exemple="Finir le dossier" premier />
      <Champ
        valeur={intention}
        surChangement={setIntention}
        exemple="Ce soir a mon bureau, je redige les trois premieres pages."
        multiligne
      />
      <View style={{ flexDirection: 'row', gap: PAS[2] }}>
        <Champ valeur={minutes} surChangement={setMinutes} exemple="60" suffixe="min" numerique />
        <Champ valeur={jours} surChangement={setJours} exemple="7" suffixe="jours" numerique />
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
  const j = useJetons()
  const [nom, setNom] = useState('')
  const [heures, setHeures] = useState('5')

  const valider = async () => {
    if (!nom.trim()) return
    await d.ajouterObjectif({
      nom: nom.trim(),
      intention: '',
      couleur: j.blocObjectif,
      cibleHebdoMinutes: Math.max(0, Math.round((Number(heures) || 5) * 60)),
    })
    surFin()
  }

  return (
    <Formulaire surAnnuler={surFin} surValider={() => void valider()} peutValider={!!nom.trim()}>
      <Champ valeur={nom} surChangement={setNom} exemple="Apprendre le piano" premier />
      <Champ valeur={heures} surChangement={setHeures} exemple="5" suffixe="h / semaine" numerique />
    </Formulaire>
  )
}

function FormulaireAncre({ surFin }: { surFin: () => void }) {
  const d = useDonnees()
  const j = useJetons()
  const [nom, setNom] = useState('')
  const [heure, setHeure] = useState('12:30')
  const [minutes, setMinutes] = useState('60')

  const valider = async () => {
    if (!nom.trim()) return
    await d.ajouterAncre({
      nom: nom.trim(),
      declencheur: '',
      couleur: j.blocAncre,
      minuteAncrage: versMinuteSure(heure),
      jours: [1, 2, 3, 4, 5],
      dureeMinutes: Math.max(15, Number(minutes) || 60),
    })
    surFin()
  }

  return (
    <Formulaire surAnnuler={surFin} surValider={() => void valider()} peutValider={!!nom.trim()}>
      <Champ valeur={nom} surChangement={setNom} exemple="Déjeuner" premier />
      <View style={{ flexDirection: 'row', gap: PAS[2] }}>
        <Champ valeur={heure} surChangement={setHeure} exemple="12:30" suffixe="à" />
        <Champ valeur={minutes} surChangement={setMinutes} exemple="60" suffixe="min" numerique />
      </View>
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
}: {
  valeur: string
  surChangement: (v: string) => void
  exemple: string
  suffixe?: string
  numerique?: boolean
  premier?: boolean
  multiligne?: boolean
}) {
  const j = useJetons()
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: PAS[2] }}>
      <TextInput
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
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
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
