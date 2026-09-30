import { useEffect, useState } from 'react'
import { Alert, Platform, Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { A, Carte, GEIST, useToast } from '@/ui/app-briques'
import { connecterApple, connecterGoogle, deconnecter, fournisseurs, supprimerCompte, useSession, type Resultat } from './compte'

/** Le « G » de Google, dans ses quatre couleurs (charte de Google). */
export function LogoGoogle() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  )
}

export function LogoApple({ couleur }: { couleur: string }) {
  return (
    <Svg width={16} height={18} viewBox="0 0 814 1000">
      <Path
        fill={couleur}
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
      />
    </Svg>
  )
}

function Bouton({ onPress, fond, encre, bord, children }: { onPress: () => void; fond: string; encre: string; bord?: string; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        height: 48,
        borderRadius: 8,
        backgroundColor: fond,
        borderWidth: bord ? 1 : 0,
        borderColor: bord,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        transform: [{ scale: pressed ? 0.975 : 1 }],
      })}
    >
      {typeof children === 'string' ? <Text style={{ color: encre, fontFamily: GEIST.demi, fontSize: 16 }}>{children}</Text> : children}
    </Pressable>
  )
}

/** Confirmer une action qui ne se défait pas. */
function confirmer(titre: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${titre}\n\n${message}`) ?? false)
  return new Promise((ok) =>
    Alert.alert(titre, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => ok(false) },
      { text: action, style: 'destructive', onPress: () => ok(true) },
    ]),
  )
}

/** Ce que cet appareil peut proposer, et la connexion qui s'en sert. */
export function useConnexion() {
  const toast = useToast()
  const [dispo, setDispo] = useState<{ apple: boolean; google: boolean } | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [echec, setEchec] = useState(false)
  useEffect(() => {
    void fournisseurs().then(setDispo)
  }, [])
  const lancer = async (f: () => Promise<Resultat>) => {
    if (occupe) return
    setOccupe(true)
    setEchec(false)
    const r = await f()
    setOccupe(false)
    if (!r.ok && r.raison === 'erreur') {
      setEchec(true)
      toast('Couldn’t sign in.')
    }
  }
  return { dispo, lancer, echec }
}

/** « Continue with Apple », « Continue with Google » : seulement ce qui est vraiment configuré. */
export function BoutonsConnexion({ dispo, lancer }: Pick<ReturnType<typeof useConnexion>, 'dispo' | 'lancer'>) {
  if (!dispo) return null
  return (
    <View style={{ gap: 10 }}>
      {dispo.apple ? (
        <Bouton fond={A.t1} encre="#000" onPress={() => void lancer(connecterApple)}>
          <LogoApple couleur="#000" />
          <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 16 }}>Continue with Apple</Text>
        </Bouton>
      ) : null}
      {dispo.google ? (
        <Bouton fond="transparent" encre={A.t1} bord={A.s} onPress={() => void lancer(connecterGoogle)}>
          <LogoGoogle />
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 16 }}>Continue with Google</Text>
        </Bouton>
      ) : null}
    </View>
  )
}

/**
 * Le compte, dans Profil : l'adresse, se déconnecter, supprimer le compte.
 * Sans compte, l'app est derrière la porte (`PorteCompte`) : rien à montrer ici.
 */
export function CarteCompte() {
  const session = useSession()
  const toast = useToast()
  if (session) {
    const u = session.user
    const nom = u.email ?? (u.user_metadata?.full_name as string | undefined) ?? 'Signed in'
    const via = u.app_metadata?.provider === 'apple' ? 'Apple' : u.app_metadata?.provider === 'google' ? 'Google' : null
    return (
      <Carte style={{ marginTop: 12, paddingVertical: 18, paddingHorizontal: 16, gap: 14 }}>
        <View style={{ gap: 3 }}>
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>Account</Text>
          <Text numberOfLines={1} style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>
            {via ? `${nom} · ${via}` : nom}
          </Text>
        </View>
        <Bouton fond="transparent" encre={A.t1} bord={A.s} onPress={() => void deconnecter()}>
          Sign out
        </Bouton>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            if (!(await confirmer('Delete account?', 'Your account is erased for good. This can’t be undone.', 'Delete'))) return
            const r = await supprimerCompte()
            toast(r.ok ? 'Account deleted.' : 'Couldn’t delete the account.')
          }}
          style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: A.rouge, fontFamily: GEIST.moyen, fontSize: 14 }}>Delete account</Text>
        </Pressable>
      </Carte>
    )
  }

  return null
}
