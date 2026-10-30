import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { A, Carte, Chevron, GEIST, MONO } from '@/ui/app-briques'
import { pontEcran } from '@/blocage/ecran-natif'
import { useBlocage } from '@/blocage/etat'
import { useJournal, viderJournal, type Entree } from './journal'

const AFFICHEES = 200

/** « vethos.task-abc-2026-10-31-600.2026-10-31 » → « task 10-31 ». */
function nomCourt(activite: string): string {
  const reste = activite.replace(/^vethos\./, '')
  const date = /\.(\d{4})-(\d{2})-(\d{2})$/.exec(reste)
  const genre = reste.split(/[-.]/)[0] ?? reste
  return date ? `${genre} ${date[2]}-${date[3]}` : `${genre} today`
}

const heure = (t: number) => new Date(t).toTimeString().slice(0, 8)
const jour = (t: number) => {
  const d = new Date(t)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Le journal, dans Profil — seulement pour un compte testeur. Ce que Vethos a
 * demandé (blocage, rappels, boutons touchés), mêlé aux réveils de
 * l'extension par iOS, les plus récents en haut.
 */
export function CarteJournal() {
  const actif = useJournal((e) => e.actif)
  const entrees = useJournal((e) => e.entrees)
  const diagnostic = useBlocage((e) => e.diagnostic)
  const [ouvert, setOuvert] = useState(false)
  const [releve, setReleve] = useState(0)

  const lignes = useMemo(() => {
    if (!ouvert) return []
    const extension: Entree[] = (pontEcran().evenementsExtension?.() ?? []).map((e) => ({
      t: e.aMs,
      sujet: 'Extension',
      texte: `${e.rappel === 'intervalDidStart' ? 'Window started, shield raised' : e.rappel === 'intervalDidEnd' ? 'Window ended, shield lowered' : e.rappel} (${nomCourt(e.activite)})`,
    }))
    return [...entrees, ...extension].sort((a, b) => b.t - a.t).slice(0, AFFICHEES)
    // `releve` : relire les réveils de l'extension à la demande.
  }, [ouvert, entrees, releve])

  if (!actif) return null
  return (
    <Carte style={{ marginTop: 12, paddingVertical: 18, paddingHorizontal: 16, gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (!ouvert) useBlocage.getState().verifier()
          setOuvert(!ouvert)
        }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>Debug log</Text>
        <Chevron sens={ouvert ? 'bas' : 'droite'} taille={14} />
      </Pressable>
      {ouvert ? (
        <>
          <Text style={{ color: A.t2, fontFamily: MONO.normal, fontSize: 12, lineHeight: 17 }}>
            {diagnostic
              ? `iOS now: ${diagnostic.surveillances} window${diagnostic.surveillances === 1 ? '' : 's'} monitored · shield ${diagnostic.bouclierLeve ? 'UP' : 'down'}`
              : 'iOS now: unknown'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                useBlocage.getState().verifier()
                setReleve((n) => n + 1)
              }}
            >
              <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 14 }}>Refresh</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={viderJournal}>
              <Text style={{ color: A.rouge, fontFamily: GEIST.moyen, fontSize: 14 }}>Clear</Text>
            </Pressable>
          </View>
          {lignes.length === 0 ? <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 13 }}>Nothing yet.</Text> : null}
          {lignes.map((l, i) => (
            <View key={`${l.t}-${i}`} style={{ gap: 2 }}>
              <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 11 }}>
                {`${jour(l.t)} ${heure(l.t)} · ${l.sujet}`}
              </Text>
              <Text selectable style={{ color: A.t1, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>
                {l.texte}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </Carte>
  )
}
