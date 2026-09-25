import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { effectiveContract } from '@shared/contract'
import type { Job } from '@shared/coach/prompt'
import { useDonnees } from '@/donnees/magasin'
import { A, GEIST } from '@/ui/app-briques'
import { coach } from './client'

/**
 * Une demande au Coach, sur place : un bouton, puis ses lignes. N'apparaît
 * que si le Coach existe (serveur configuré) — sinon, rien ne fait semblant.
 */
export function CoachEnLigne({ job, faits, libelle }: { job: Job; faits: Record<string, string | number>; libelle: string }) {
  const contrat = useDonnees((d) => d.reglages.contrat)
  const [lignes, setLignes] = useState<string[] | null>(null)
  const [attente, setAttente] = useState(false)
  if (!coach().disponible) return null
  const demander = async () => {
    setAttente(true)
    const mode = contrat ? effectiveContract(contrat, new Date()).mode : 'ally'
    const t = await coach().demander({ job, mode, faits, messages: [] })
    setAttente(false)
    setLignes(t ? t.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 8) : null)
  }
  if (lignes)
    return (
      <View style={{ gap: 4 }}>
        {lignes.map((l, i) => (
          <Text key={i} style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 14, lineHeight: 20 }}>
            {l}
          </Text>
        ))}
      </View>
    )
  return (
    <Pressable
      accessibilityRole="button"
      disabled={attente}
      onPress={() => void demander()}
      style={({ pressed }) => ({ alignSelf: 'flex-start', height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(242,242,242,0.2)', justifyContent: 'center', opacity: attente ? 0.5 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
    >
      <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>{attente ? '…' : libelle}</Text>
    </Pressable>
  )
}
