import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees, type Obligation } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { dateLocale, duree, enHeure, type SegmentTemps } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { RoueDate, RoueHeure } from '@/ui/Roue'
import { AgendaJour } from '@/ui/AgendaJour'
import { CarteSemaine } from '@/ui/CarteSemaine'
import { FicheDetailEngagement } from '@/ui/FicheDetailEngagement'
import { Chevron, Croix, Plus } from '@/ui/icones'
import { TableauCapacite } from '@/ui/Capacite'
import { DemandeTemps } from '@/ui/DemandeTemps'
import { Repliable } from '@/ui/Repliable'
import { useLargeur } from '@/ui/largeur'
import { GEIST, MONO } from '@/ui/primitives'
import { ChargementVethos } from '@/ui/MouvementVethos'

/**
 * THESIS: le temps se voit avant de se lire. Une sélection relie semaine et jour.
 * OWN-WORLD: Vethos, neutres francs, Geist, rouge du présent, contours rares.
 * STORY: repérer sa semaine, toucher un jour, ajuster une obligation.
 * FIRST VIEWPORT: titre, dates, sept pistes 24 h, agenda sélectionné. Ajout en haut.
 * FORM: refonte locale des deux vues de temps dans l'identité Vethos existante.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
 */
export default function MonTemps() {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const d = useDonnees()
  const { jours, aujourdHui, minute, chargees, resultat } = usePlan()
  const [selection, setSelection] = useState<string | null>(null)
  const [ajout, setAjout] = useState(false)
  const [segmentDetail, setSegmentDetail] = useState<SegmentTemps | null>(null)
  const large = useLargeur().deuxColonnes
  const jour = jours.find((x) => x.date === selection) ?? jours[0]
  if (!jour || !chargees) return <ChargementVethos pleinEcran libelle="Vethos is mapping your week." />
  const dernier = jours[jours.length - 1]!
  const disponible = resultat.capacities.reduce((s, c) => s + c.effectiveCapacityMinutes, 0)

  const titreJour = jour.date === aujourdHui ? 'Today' : dateLocale(jour.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric' })
  return <>
    <ScrollView style={{ flex: 1, backgroundColor: j.bg }} contentContainerStyle={{ paddingTop: marges.top + 20, paddingBottom: 36, paddingHorizontal: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontFamily: GEIST.demi, fontSize: 30, letterSpacing: -0.8, color: j.text }}>My time</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a fixed commitment" onPress={() => setAjout(true)}
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 8, backgroundColor: j.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Plus couleur={j.text} taille={20} />
        </Pressable>
      </View>
      <Text style={{ fontFamily: GEIST.normal, fontSize: 14, color: j.text2, marginTop: 5 }}>
        {dateLocale(jours[0]!.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {dateLocale(dernier.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </Text>

      {/* Le chiffre de la page. Declarer du temps subi n'a d'interet que si
          l'on voit tout de suite ce qu'il reste — sinon on declare a l'aveugle. */}
      <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text style={{ fontFamily: MONO.demi, fontSize: 30, color: j.accentEncre, fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}>
          {duree(disponible)}
        </Text>
        <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: j.text3 }}>available across seven days</Text>
      </View>
      <CarteSemaine
        jours={jours}
        selection={jour.date}
        surSelection={setSelection}
        aujourdHui={aujourdHui}
        minute={minute}
        lever={d.reglages.lever}
        coucher={d.reglages.coucher}
        surChoisirSegment={setSegmentDetail}
      />
      <View style={{ marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: j.line }}>
        <Text style={{ fontFamily: GEIST.demi, fontSize: 20, color: j.text, textTransform: 'capitalize' }}>{titreJour}</Text>
        <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: j.text2, marginTop: 6 }}>
          {duree(jour.travail)} planned · {duree(jour.capacite)} of capacity
        </Text>
        <AgendaJour
          segments={jour.segments}
          {...(jour.date === aujourdHui ? { minute } : {})}
          surChoisirSegment={setSegmentDetail}
        />
      </View>
      {/* Le bureau met ces deux replis COTE A COTE, et le sommeil plus les
          obligations dans la colonne d'en face. Empiles, demander du temps
          libre exige de faire defiler par-dessus le detail qu'on vient de
          lire — or c'est ce detail qui dit si la demande a une chance. */}
      <View style={large
        ? { marginTop: 28, flexDirection: 'row', alignItems: 'flex-start', gap: 20 }
        : { marginTop: 28, gap: 10 }}>
        <View style={large ? { flex: 1, gap: 10 } : { gap: 10 }}>
          <Repliable titre="Day by day" resume="raw → free">
            <TableauCapacite capacites={resultat.capacities} />
          </Repliable>
          <Repliable titre="Ask for free time">
            <DemandeTemps capacites={resultat.capacities} aujourdHui={aujourdHui} />
          </Repliable>
        </View>
        {large ? <View style={{ flex: 1 }}><DeclarationsFixes /></View> : null}
      </View>

      {large ? null : <DeclarationsFixes />}
    </ScrollView>
    <Modal visible={ajout} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAjout(false)}>
      <Formulaire surFin={() => setAjout(false)} jourInitial={dateLocale(jour.date).getDay()} />
    </Modal>
    <FicheDetailEngagement segment={segmentDetail} fermer={() => setSegmentDetail(null)} />
  </>
}

/**
 * Le temps SUBI : le sommeil, et les obligations fixes.
 *
 * Un composant a part parce qu'il change de place selon la largeur. Sur un
 * telephone il vient sous les replis ; des qu'il y a deux colonnes, il monte a
 * cote — la ou le bureau le met. Ce qu'on declare ici et ce qu'on lit en face
 * repondent a la meme question, et les separer par un defilement fait perdre
 * le lien.
 */
function DeclarationsFixes() {
  const j = useJetons()
  const routeur = useRouter()
  const d = useDonnees()
  const [gestion, setGestion] = useState(false)
  const [suppression, setSuppression] = useState<string | null>(null)

  return (
  <View style={{ borderTopWidth: 1, borderTopColor: j.line }}>
      <Pressable accessibilityRole="button" onPress={() => routeur.push('/reglages')}
        style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 60, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ flex: 1, fontFamily: GEIST.moyen, fontSize: 15, color: j.text }}>Sleep</Text>
        <Text style={{ fontFamily: MONO.normal, fontSize: 12, color: j.text2 }}>{d.reglages.coucher}–{d.reglages.lever}</Text>
        <Chevron couleur={j.text2} taille={14} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: gestion }} onPress={() => setGestion(!gestion)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderTopWidth: 1, borderTopColor: j.line, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ flex: 1, fontFamily: GEIST.moyen, fontSize: 15, color: j.text }}>Fixed commitments</Text>
        <Text style={{ fontFamily: MONO.normal, fontSize: 12, color: j.text2 }}>{d.obligations.length}</Text>
        <View style={{ transform: [{ rotate: gestion ? '90deg' : '0deg' }] }}><Chevron couleur={j.text2} taille={14} /></View>
      </Pressable>
      {gestion && <View>
        {d.obligations.length === 0 && <Text style={{ fontFamily: GEIST.normal, fontSize: 14, color: j.text2, paddingVertical: 12 }}>Add your classes, your work or your commutes.</Text>}
        {[...d.obligations].sort((a, b) =>
          (a.date ?? '').localeCompare(b.date ?? '') ||
          ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7) ||
          a.startMinute - b.startMinute).map((o) =>
          <View key={o.id} style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: j.text }}>{o.label}</Text>
              <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: j.text2 }}>
                {CATEGORIE[o.categoryType]} · {o.date
                  ? dateLocale(o.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : JOURS[o.dayOfWeek]} · {enHeure(o.startMinute)}–{enHeure(o.endMinute)}
                {o.date ? ' · once only' : ''}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={suppression === o.id ? `Confirm deleting ${o.label}` : `Delete ${o.label}`}
              onPress={() => { if (suppression === o.id) { void d.supprimerObligation(o.id); setSuppression(null) } else setSuppression(o.id) }}
              style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
              {suppression === o.id ? <Text style={{ color: j.accentEncre, fontFamily: GEIST.moyen }}>Delete</Text> : <Croix couleur={j.text2} />}
            </Pressable>
            {suppression === o.id && <Pressable accessibilityRole="button" accessibilityLabel="Cancel deletion" onPress={() => setSuppression(null)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Croix couleur={j.text2} /></Pressable>}
          </View>)}
      </View>}
    </View>
  )
}

const JOURS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** La date par defaut d'une occurrence unique : dans une semaine. */
function dansNJours(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const CATEGORIES = [ ['school', 'Cours'], ['work', 'Travail'], ['commute', 'Trajet'], ['commitment', 'Engagement'], ['custom', 'Autre'] ] as const

/**
 * La categorie, mot pour mot celle du bureau.
 *
 * Elle n'a PAS de couleur propre ici : sur une piste de 25 px, six gris
 * voisins ne se distinguent pas, et une legende de six pastilles identiques
 * ment plus qu'elle n'informe. La categorie se lit donc en toutes lettres,
 * la ou elle sert vraiment — sur la ligne de l'obligation.
 */
const CATEGORIE: Record<Obligation['categoryType'], string> = {
  sleep: 'Sleep', school: 'School', work: 'Work',
  commute: 'Commute', commitment: 'Commitment', custom: 'Other',
}

function Formulaire({ surFin, jourInitial }: { surFin: () => void; jourInitial: number }) {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const ajouter = useDonnees((d) => d.ajouterObligation)
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState<Obligation['categoryType']>('school')
  const [debut, setDebut] = useState('09:00')
  const [fin, setFin] = useState('12:00')
  const [jours, setJours] = useState([jourInitial])
  const [recurrence, setRecurrence] = useState<'hebdo' | 'unique'>('hebdo')
  const [dateUnique, setDateUnique] = useState(dansNJours(7))
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const heure = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN
  const sauver = async () => {
    const a = heure(debut)
    const b = fin === '24:00' ? 1440 : heure(fin)
    if (!nom.trim()) { setErreur('Give this commitment a name.'); return }
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) { setErreur('Enter valid times, with an end after the start.'); return }
    const commun = { label: nom.trim(), startMinute: a, endMinute: b, categoryType: categorie, color: j.text3 }
    if (recurrence === 'unique') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateUnique) || Number.isNaN(dateLocale(dateUnique).getTime())) {
        setErreur('Enter a date as YYYY-MM-DD.'); return
      }
      setEnCours(true)
      try {
        // Une occurrence unique porte son propre jour, derive de sa DATE — pas
        // du jour qu'on avait ouvert, qui ne servait qu'a parcourir.
        await ajouter({ ...commun, dayOfWeek: dateLocale(dateUnique).getDay(), date: dateUnique })
        surFin()
      } catch { setErreur('Could not save. Try again.') }
      finally { setEnCours(false) }
      return
    }
    if (!jours.length) { setErreur('Pick at least one day.'); return }
    setEnCours(true)
    try {
      for (const dayOfWeek of jours) await ajouter({ ...commun, dayOfWeek })
      surFin()
    } catch { setErreur('Could not save. Try again.') }
    finally { setEnCours(false) }
  }
  const champ = { fontFamily: GEIST.normal, fontSize: 17, color: j.text, backgroundColor: j.surface2, borderRadius: 8, padding: 14, minHeight: 50 } as const
  const label = { fontFamily: GEIST.moyen, fontSize: 13, color: j.text2, marginBottom: 8 } as const
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: j.bg }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingTop: Math.max(24, marges.top + 12), paddingBottom: marges.bottom + 32, gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontFamily: GEIST.demi, fontSize: 24, color: j.text }}>New fixed commitment</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={surFin} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Croix couleur={j.text2} taille={20} /></Pressable>
      </View>
      <View><Text style={label}>Name</Text><TextInput accessibilityLabel="Name of the commitment" value={nom} onChangeText={setNom} maxLength={60} placeholder="Maths class" placeholderTextColor={j.text2} style={champ} /></View>
      <View><Text style={label}>Category</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{CATEGORIES.map(([cle, texte]) => <Pressable key={cle} accessibilityRole="button" accessibilityState={{ selected: categorie === cle }} onPress={() => setCategorie(cle)}
        style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 6, backgroundColor: categorie === cle ? j.text : j.surface2, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: categorie === cle ? j.bg : j.text }}>{texte}</Text>
      </Pressable>)}</View></View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1 }}><Text style={label}>Start</Text><RoueHeure valeur={debut} changer={setDebut} etiquette="Start time" compact /></View>
        <View style={{ flex: 1 }}><Text style={label}>End</Text><RoueHeure valeur={fin} changer={setFin} etiquette="End time" compact /></View>
      </View>
      <View><Text style={label}>Repeat</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {([['hebdo', 'Every week'], ['unique', 'Once only']] as const).map(([cle, texte]) =>
            <Pressable key={cle} accessibilityRole="button" accessibilityState={{ selected: recurrence === cle }} onPress={() => setRecurrence(cle)}
              style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: recurrence === cle ? j.text : j.surface2, opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ fontFamily: GEIST.moyen, fontSize: 13, color: recurrence === cle ? j.bg : j.text }}>{texte}</Text>
            </Pressable>)}
        </View>
        {recurrence === 'unique'
          ? <>
              <RoueDate valeur={dateUnique} changer={setDateUnique} min={dansNJours(0)} compact />
              <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: j.text2, marginTop: 8 }}>
                That day only. The following week stays untouched.
              </Text>
            </>
          : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[1, 2, 3, 4, 5, 6, 0].map((n) => <Pressable key={n} accessibilityRole="button" accessibilityLabel={JOURS[n]} accessibilityState={{ selected: jours.includes(n) }} onPress={() => setJours((liste) => liste.includes(n) ? liste.filter((v) => v !== n) : [...liste, n])}
              style={({ pressed }) => ({ minWidth: 44, minHeight: 44, borderRadius: 6, backgroundColor: jours.includes(n) ? j.text : j.surface2, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ fontFamily: GEIST.moyen, fontSize: 13, color: jours.includes(n) ? j.bg : j.text }}>{JOURS[n]}</Text>
            </Pressable>)}</View>}
      </View>
      {erreur ? <Text accessibilityRole="alert" style={{ fontFamily: GEIST.normal, color: j.accentEncre, fontSize: 14 }}>{erreur}</Text> : null}
      <Pressable accessibilityRole="button" disabled={enCours} accessibilityState={{ disabled: enCours, busy: enCours }} onPress={() => void sauver()}
        style={({ pressed }) => ({ minHeight: 52, borderRadius: 8, backgroundColor: j.text, alignItems: 'center', justifyContent: 'center', opacity: enCours || pressed ? 0.6 : 1 })}>
        <Text style={{ fontFamily: GEIST.demi, color: j.bg, fontSize: 16 }}>{enCours ? 'Saving…' : 'Add'}</Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>
}
