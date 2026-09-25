import { useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { effectiveContract } from '@shared/contract'
import { useDonnees } from '@/donnees/magasin'
import { A, Feuille, GEIST } from '@/ui/app-briques'
import { coach } from './client'

type Message = { role: 'user' | 'assistant'; content: string }

/**
 * L'entretien d'entrée du Coach (WOOP : souhait, résultat, obstacle, plan
 * si-alors), une étape par message. Le plan si-alors final est gardé : il
 * nomme le déclencheur-événement de l'habitude. Le Coach parle ; il ne
 * décide et n'accorde rien.
 */
export function FeuilleCoach({ ouverte, fermer }: { ouverte: boolean; fermer: () => void }) {
  const { reglages, majReglages } = useDonnees()
  const mode = reglages.contrat ? effectiveContract(reglages.contrat, new Date()).mode : 'ally'
  const [messages, setMessages] = useState<Message[]>([])
  const [texte, setTexte] = useState('')
  const [attente, setAttente] = useState(false)
  const [horsLigne, setHorsLigne] = useState(false)
  const defil = useRef<ScrollView>(null)

  const demander = async (historique: Message[]) => {
    setAttente(true)
    const r = await coach().demander({ job: 'woop', mode, faits: {}, messages: historique.slice(-12) })
    setAttente(false)
    if (r === null) {
      setHorsLigne(true)
      return
    }
    setHorsLigne(false)
    const suite = [...historique, { role: 'assistant' as const, content: r }]
    setMessages(suite)
    const plan = /PLAN:\s*(.+)$/im.exec(r)?.[1]?.trim()
    if (plan) void majReglages({ planSiAlors: plan.slice(0, 200) })
  }

  useEffect(() => {
    if (ouverte && messages.length === 0) void demander([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte])

  const envoyer = () => {
    const t = texte.trim()
    if (!t || attente) return
    const suite = [...messages, { role: 'user' as const, content: t.slice(0, 1000) }]
    setMessages(suite)
    setTexte('')
    void demander(suite)
  }

  return (
    <Feuille ouverte={ouverte} fermer={() => (Keyboard.dismiss(), fermer())} style={{ paddingHorizontal: 20, paddingBottom: 20, height: '80%' }}>
      <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}>
        Coach
      </Text>
      <ScrollView
        ref={defil}
        style={{ flex: 1, marginTop: 12 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
        onContentSizeChange={() => defil.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m, i) => (
          <View
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '86%',
              borderRadius: 14,
              paddingVertical: 10,
              paddingHorizontal: 14,
              backgroundColor: m.role === 'user' ? 'rgba(242,242,242,0.14)' : A.s1,
            }}
          >
            <Text style={{ color: A.t1, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21 }}>{m.content}</Text>
          </View>
        ))}
        {attente ? <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 15 }}>…</Text> : null}
        {horsLigne ? (
          <Pressable accessibilityRole="button" onPress={() => void demander(messages)} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
            <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 14 }}>Try again</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={texte}
          onChangeText={(v) => setTexte(v.slice(0, 1000))}
          onSubmitEditing={envoyer}
          returnKeyType="send"
          placeholder="Message"
          placeholderTextColor={A.t4}
          accessibilityLabel="Message to the Coach"
          selectionColor={A.t1}
          style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 16, color: A.t1, fontFamily: GEIST.normal, fontSize: 15 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={envoyer}
          disabled={!texte.trim() || attente}
          style={({ pressed }) => ({ height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: A.t1, justifyContent: 'center', opacity: !texte.trim() || attente ? 0.4 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
        >
          <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 14 }}>Send</Text>
        </Pressable>
      </View>
    </Feuille>
  )
}
