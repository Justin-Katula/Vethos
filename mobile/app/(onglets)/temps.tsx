import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees, type Obligation } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { dateLocale, duree, enHeure } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { AgendaJour } from '@/ui/AgendaJour'
import { CarteSemaine } from '@/ui/CarteSemaine'
import { Chevron, Croix, Plus } from '@/ui/icones'
import { GEIST, MONO } from '@/ui/primitives'

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
  const routeur = useRouter()
  const d = useDonnees()
  const { jours, aujourdHui, minute, chargees } = usePlan()
  const [selection, setSelection] = useState<string | null>(null)
  const [ajout, setAjout] = useState(false)
  const [gestion, setGestion] = useState(false)
  const [suppression, setSuppression] = useState<string | null>(null)
  const jour = jours.find((x) => x.date === selection) ?? jours[0]
  if (!jour || !chargees) return <View style={{ flex: 1, backgroundColor: j.bg }} accessibilityLabel="Chargement du planning" />
  const dernier = jours[jours.length - 1]!
  const titreJour = jour.date === aujourdHui ? 'Aujourd’hui' : dateLocale(jour.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })
  return <>
    <ScrollView style={{ flex: 1, backgroundColor: j.bg }} contentContainerStyle={{ paddingTop: marges.top + 20, paddingBottom: 36, paddingHorizontal: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontFamily: GEIST.demi, fontSize: 30, letterSpacing: -0.8, color: j.text }}>Mon temps</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Ajouter une obligation" onPress={() => setAjout(true)}
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 8, backgroundColor: j.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Plus couleur={j.text} taille={20} />
        </Pressable>
      </View>
      <Text style={{ fontFamily: GEIST.normal, fontSize: 14, color: j.text2, marginTop: 5 }}>
        {dateLocale(jours[0]!.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — {dateLocale(dernier.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
      </Text>
      <CarteSemaine jours={jours} selection={jour.date} surSelection={setSelection} aujourdHui={aujourdHui} minute={minute} />
      <View style={{ marginTop: 28, paddingTop: 24, borderTopWidth: 1, borderTopColor: j.line }}>
        <Text style={{ fontFamily: GEIST.demi, fontSize: 20, color: j.text, textTransform: 'capitalize' }}>{titreJour}</Text>
        <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: j.text2, marginTop: 6 }}>
          {duree(jour.travail)} planifiées · {duree(jour.capacite)} de capacité
        </Text>
        <AgendaJour segments={jour.segments} {...(jour.date === aujourdHui ? { minute } : {})} />
      </View>
      <View style={{ marginTop: 28, borderTopWidth: 1, borderTopColor: j.line }}>
        <Pressable accessibilityRole="button" onPress={() => routeur.push('/reglages')}
          style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 60, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ flex: 1, fontFamily: GEIST.moyen, fontSize: 15, color: j.text }}>Sommeil</Text>
          <Text style={{ fontFamily: MONO.normal, fontSize: 12, color: j.text2 }}>{d.reglages.coucher}–{d.reglages.lever}</Text>
          <Chevron couleur={j.text2} taille={14} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: gestion }} onPress={() => setGestion(!gestion)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderTopWidth: 1, borderTopColor: j.line, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ flex: 1, fontFamily: GEIST.moyen, fontSize: 15, color: j.text }}>Obligations fixes</Text>
          <Text style={{ fontFamily: MONO.normal, fontSize: 12, color: j.text2 }}>{d.obligations.length}</Text>
          <View style={{ transform: [{ rotate: gestion ? '90deg' : '0deg' }] }}><Chevron couleur={j.text2} taille={14} /></View>
        </Pressable>
        {gestion && <View>
          {d.obligations.length === 0 && <Text style={{ fontFamily: GEIST.normal, fontSize: 14, color: j.text2, paddingVertical: 12 }}>Ajoute tes cours, ton travail ou tes trajets.</Text>}
          {[...d.obligations].sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7) || a.startMinute - b.startMinute).map((o) =>
            <View key={o.id} style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: j.text }}>{o.label}</Text>
                <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: j.text2 }}>{JOURS[o.dayOfWeek]} · {enHeure(o.startMinute)}–{enHeure(o.endMinute)}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={suppression === o.id ? `Confirmer la suppression de ${o.label}` : `Supprimer ${o.label}`}
                onPress={() => { if (suppression === o.id) { void d.supprimerObligation(o.id); setSuppression(null) } else setSuppression(o.id) }}
                style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
                {suppression === o.id ? <Text style={{ color: j.accentEncre, fontFamily: GEIST.moyen }}>Supprimer</Text> : <Croix couleur={j.text2} />}
              </Pressable>
              {suppression === o.id && <Pressable accessibilityRole="button" accessibilityLabel="Annuler la suppression" onPress={() => setSuppression(null)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Croix couleur={j.text2} /></Pressable>}
            </View>)}
        </View>}
      </View>
    </ScrollView>
    <Modal visible={ajout} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAjout(false)}>
      <Formulaire surFin={() => setAjout(false)} jourInitial={dateLocale(jour.date).getDay()} />
    </Modal>
  </>
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const CATEGORIES = [ ['school', 'Cours'], ['work', 'Travail'], ['commute', 'Trajet'], ['commitment', 'Engagement'], ['custom', 'Autre'] ] as const

function Formulaire({ surFin, jourInitial }: { surFin: () => void; jourInitial: number }) {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const ajouter = useDonnees((d) => d.ajouterObligation)
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState<Obligation['categoryType']>('school')
  const [debut, setDebut] = useState('09:00')
  const [fin, setFin] = useState('12:00')
  const [jours, setJours] = useState([jourInitial])
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const heure = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN
  const sauver = async () => {
    const a = heure(debut)
    const b = fin === '24:00' ? 1440 : heure(fin)
    if (!nom.trim()) { setErreur('Donne un nom à cette obligation.'); return }
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) { setErreur('Indique des heures valides, avec une fin après le début.'); return }
    if (!jours.length) { setErreur('Choisis au moins un jour.'); return }
    setEnCours(true)
    try {
      for (const dayOfWeek of jours) await ajouter({ label: nom.trim(), dayOfWeek, startMinute: a, endMinute: b, categoryType: categorie, color: j.text3 })
      surFin()
    } catch { setErreur('Enregistrement impossible. Réessaie.') }
    finally { setEnCours(false) }
  }
  const champ = { fontFamily: GEIST.normal, fontSize: 17, color: j.text, backgroundColor: j.surface2, borderRadius: 8, padding: 14, minHeight: 50 } as const
  const label = { fontFamily: GEIST.moyen, fontSize: 13, color: j.text2, marginBottom: 8 } as const
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: j.bg }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingTop: Math.max(24, marges.top + 12), paddingBottom: marges.bottom + 32, gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontFamily: GEIST.demi, fontSize: 24, color: j.text }}>Nouvelle obligation</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={surFin} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Croix couleur={j.text2} taille={20} /></Pressable>
      </View>
      <View><Text style={label}>Nom</Text><TextInput accessibilityLabel="Nom de l’obligation" value={nom} onChangeText={setNom} maxLength={60} placeholder="Cours de maths" placeholderTextColor={j.text2} style={champ} /></View>
      <View><Text style={label}>Catégorie</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{CATEGORIES.map(([cle, texte]) => <Pressable key={cle} accessibilityRole="button" accessibilityState={{ selected: categorie === cle }} onPress={() => setCategorie(cle)}
        style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 6, backgroundColor: categorie === cle ? j.text : j.surface2, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: categorie === cle ? j.bg : j.text }}>{texte}</Text>
      </Pressable>)}</View></View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1 }}><Text style={label}>Début</Text><TextInput accessibilityLabel="Heure de début, heures et minutes" value={debut} onChangeText={setDebut} maxLength={5} style={champ} /></View>
        <View style={{ flex: 1 }}><Text style={label}>Fin</Text><TextInput accessibilityLabel="Heure de fin, heures et minutes" value={fin} onChangeText={setFin} maxLength={5} style={champ} /></View>
      </View>
      <View><Text style={label}>Répéter</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[1, 2, 3, 4, 5, 6, 0].map((n) => <Pressable key={n} accessibilityRole="button" accessibilityLabel={JOURS[n]} accessibilityState={{ selected: jours.includes(n) }} onPress={() => setJours((liste) => liste.includes(n) ? liste.filter((v) => v !== n) : [...liste, n])}
        style={({ pressed }) => ({ minWidth: 44, minHeight: 44, borderRadius: 6, backgroundColor: jours.includes(n) ? j.text : j.surface2, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 13, color: jours.includes(n) ? j.bg : j.text }}>{JOURS[n]}</Text>
      </Pressable>)}</View></View>
      {erreur ? <Text accessibilityRole="alert" style={{ fontFamily: GEIST.normal, color: j.accentEncre, fontSize: 14 }}>{erreur}</Text> : null}
      <Pressable accessibilityRole="button" disabled={enCours} accessibilityState={{ disabled: enCours, busy: enCours }} onPress={() => void sauver()}
        style={({ pressed }) => ({ minHeight: 52, borderRadius: 8, backgroundColor: j.text, alignItems: 'center', justifyContent: 'center', opacity: enCours || pressed ? 0.6 : 1 })}>
        <Text style={{ fontFamily: GEIST.demi, color: j.bg, fontSize: 16 }}>{enCours ? 'Enregistrement…' : 'Ajouter'}</Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>
}
