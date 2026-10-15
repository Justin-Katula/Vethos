import { useRef, useState } from 'react'
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import { texteSuffisant } from '@shared/planning/report'
import { usePlan } from '@/plan/Plan'
import { useSeances } from '@/seances/magasin-seances'
import { A, BoutonBlanc, Feuille, GEIST, hm, MONO } from '@/ui/app-briques'
import { faitsPourGarder, type NatureRetrait } from './retrait'
import { useRetrait } from './useRetrait'

export type CibleRetrait = {
  nature: NatureRetrait
  refId: string
  nom: string
  /** L'engagement et ses parties. */
  ids: string[]
  /** Le travail total demandé (tâche), sinon null. */
  total: number | null
  creeLe: string
}

type Etape = 'raison' | 'garder' | 'attente'

/**
 * « Remove » : s'expliquer d'abord, puis voir ce qu'on perdrait. « Keep it »
 * ferme tout, sans trace. « Remove anyway » ne retire rien : la demande attend
 * une heure dans Profil.
 */
export function FeuilleRetrait({ cible, fermer }: { cible: CibleRetrait | null; fermer: () => void }) {
  const { maintenant } = usePlan()
  const events = useSeances((e) => e.apprentissage.sessionEvents ?? [])
  const travaille = useSeances((e) => e.apprentissage.workedMinutesByRef)
  const { demander } = useRetrait()
  const [etape, setEtape] = useState<Etape>('raison')
  const [texte, setTexte] = useState('')
  const precedente = useRef<string | null>(null)
  // Une nouvelle cible repart de zéro.
  if (cible && precedente.current !== cible.refId) {
    precedente.current = cible.refId
    setEtape('raison')
    setTexte('')
  }
  if (!cible && precedente.current) precedente.current = null

  const quitter = () => {
    Keyboard.dismiss()
    fermer()
  }
  const f = cible
    ? faitsPourGarder({ ids: cible.ids, events, travaille, total: cible.total, creeLe: cible.creeLe, maintenantMs: maintenant.getTime() })
    : null
  const titre = { color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 } as const
  const tuile = (valeur: string, libelle: string) => (
    <View key={libelle} style={{ flex: 1, minWidth: '45%', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(242,242,242,0.06)', gap: 2 }}>
      <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 24, lineHeight: 28, fontVariant: ['tabular-nums'] }}>{valeur}</Text>
      <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 12 }}>{libelle}</Text>
    </View>
  )

  return (
    <Feuille ouverte={!!cible} fermer={quitter} style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
      {cible && etape === 'raison' ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={titre}>{`Remove ${cible.nom}?`}</Text>
          <TextInput
            value={texte}
            onChangeText={(v) => setTexte(v.slice(0, 500))}
            placeholder="Why?"
            placeholderTextColor={A.t4}
            accessibilityLabel="Why"
            selectionColor={A.t1}
            multiline
            style={{ minHeight: 72, maxHeight: 140, borderRadius: 10, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, color: A.t1, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' }}
          />
          <BoutonBlanc
            actif={texteSuffisant(texte)}
            onPress={() => {
              if (!texteSuffisant(texte)) return
              Keyboard.dismiss()
              setEtape('garder')
            }}
          >
            Continue
          </BoutonBlanc>
        </View>
      ) : null}

      {cible && f && etape === 'garder' ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={titre}>{`Keep ${cible.nom}?`}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              tuile(hm(f.fait), 'already done'),
              ...(f.pourcent !== null ? [tuile(`${f.pourcent}%`, 'of it')] : []),
              tuile(String(f.seances), f.seances === 1 ? 'session' : 'sessions'),
              tuile(String(f.jours), f.jours === 1 ? 'day in' : 'days in'),
            ]}
          </View>
          <BoutonBlanc onPress={quitter} hauteur={56}>Keep it</BoutonBlanc>
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              await demander({ nature: cible.nature, refId: cible.refId, nom: cible.nom.slice(0, 80), texte: texte.trim().slice(0, 500) })
              setEtape('attente')
            }}
            style={({ pressed }) => ({ height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 15 }}>Remove anyway</Text>
          </Pressable>
        </View>
      ) : null}

      {cible && etape === 'attente' ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={titre}>In Profile for 1 h</Text>
          <BoutonBlanc onPress={quitter}>OK</BoutonBlanc>
        </View>
      ) : null}
    </Feuille>
  )
}
