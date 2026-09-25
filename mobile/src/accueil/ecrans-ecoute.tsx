/**
 * Acte 1 — écouter. Le prénom, ce qui compte, combien de soirs finissent sans
 * ce qui était prévu, ce qui est repoussé, puis trois questions par chose, et
 * ce qui l'arrête. Une seule question par écran ; toucher une réponse suffit.
 */
import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, TextInput, View } from 'react-native'
import {
  chosesDe,
  FREQ,
  GOALS,
  ITEM,
  nowOpts,
  NOWO,
  PRIOS,
  SINCE,
  SOUS_FREQ,
  STOPS,
  WORK,
  type Choix,
} from './catalogue-introduction'
import { besoin } from './catalogue-introduction'
import { choses, frequence, priorites, type Ctx, type EtatIntro } from './etat-introduction'
import { Bouton, C, Entree, GEIST, Ligne, PiedDegrade, T, Titre, vibrer } from './briques-introduction'

/** Des minuteries qui meurent avec l'écran. */
export function useMinuteries() {
  const t = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => t.current.forEach(clearTimeout), [])
  return (ms: number, f: () => void) => {
    t.current.push(setTimeout(f, ms))
  }
}

const Haut = ({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) => (
  <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>{children}</View>
)

/** Une liste qui défile sous son pied. */
const Defile = ({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) => (
  <ScrollView
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    contentContainerStyle={{ paddingTop: ctx.haut, paddingHorizontal: 24, paddingBottom: 140 + ctx.bas }}
    showsVerticalScrollIndicator={false}
  >
    {children}
  </ScrollView>
)

// ——— 1 · Le prénom ———
export function EcranNom({ ctx }: { ctx: Ctx }) {
  const ok = ctx.e.name.trim().length > 0
  const continuer = () => {
    if (!ok) return
    vibrer('light')
    ctx.suivant()
  }
  return (
    <View style={{ flex: 1 }}>
      <Haut ctx={ctx}>
        <Entree dl={150} reduit={ctx.reduit}>
          <Titre grand>First, what should I call you?</Titre>
        </Entree>
        <Entree dl={260} reduit={ctx.reduit} style={{ marginTop: 32 }}>
          <Text style={T.gris}>Your name</Text>
        </Entree>
        <Entree dl={370} reduit={ctx.reduit} style={{ marginTop: 8 }}>
          <View style={{ height: 56, backgroundColor: C.s1, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 16 }}>
            <TextInput
              value={ctx.e.name}
              onChangeText={(v) => ctx.maj(() => ({ name: v.slice(0, 24) }))}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="givenName"
              returnKeyType="done"
              onSubmitEditing={continuer}
              accessibilityLabel="Your name"
              selectionColor={C.t1}
              style={{ color: C.t1, fontFamily: GEIST.normal, fontSize: 17, padding: 0 }}
            />
          </View>
        </Entree>
      </Haut>
      <Entree dl={480} reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
        <Bouton actif={ok} onPress={continuer}>
          Continue
        </Bouton>
      </Entree>
    </View>
  )
}

// ——— 1b · Bonjour ———
export function EcranBonjour({ ctx }: { ctx: Ctx }) {
  const apres = useMinuteries()
  useEffect(() => {
    apres(300, () => vibrer('light'))
    apres(1900, ctx.suivant)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <View style={{ position: 'absolute', left: 24, right: 24, top: 0, bottom: 120, justifyContent: 'center' }}>
      <Entree dl={200} reduit={ctx.reduit}>
        <Titre grand>{`Nice to meet you, ${ctx.e.name.trim() || 'friend'}.`}</Titre>
      </Entree>
    </View>
  )
}

// ——— 2 · Ce qui compte ———
export function EcranPriorites({ ctx }: { ctx: Ctx }) {
  const bascule = (p: string) => {
    vibrer('light')
    ctx.maj((e) => ({ prios: e.prios.includes(p) ? e.prios.filter((x) => x !== p) : [...e.prios, p] }))
  }
  return (
    <View style={{ flex: 1 }}>
      <Defile ctx={ctx}>
        <Entree dl={260} reduit={ctx.reduit} style={{ marginTop: 12 }}>
          <Titre>What matters most to you right now?</Titre>
        </Entree>
        <Entree dl={370} reduit={ctx.reduit} style={{ marginTop: 8 }}>
          <Text style={T.gris}>Choose everything that’s true.</Text>
        </Entree>
        <View style={{ gap: 8, marginTop: 24 }}>
          {PRIOS.map(([p, sous], i) => (
            <Entree key={p} dl={480 + i * 110} reduit={ctx.reduit}>
              <Ligne titre={p} sous={sous} forme="check" pris={ctx.e.prios.includes(p)} onPress={() => bascule(p)} />
            </Entree>
          ))}
        </View>
      </Defile>
      <PiedDegrade bas={ctx.bas} reduit={ctx.reduit}>
        <Bouton
          actif={ctx.e.prios.length > 0}
          onPress={() => {
            vibrer('light')
            ctx.suivant()
          }}
        >
          Continue
        </Bouton>
      </PiedDegrade>
    </View>
  )
}

// ——— 3 · Combien de soirs ———
export function EcranFrequence({ ctx }: { ctx: Ctx }) {
  const apres = useMinuteries()
  const occupe = useRef(false)
  const [verif, setVerif] = useState(false)
  const toucher = (i: number) => {
    if (occupe.current) return
    occupe.current = true
    ctx.maj(() => ({ freq: i }))
    if (i === 3 && !verif) {
      // « Rarely » se vérifie une fois, doucement, sans reproche.
      vibrer('light')
      apres(500, () => {
        occupe.current = false
        setVerif(true)
      })
      return
    }
    vibrer('medium')
    apres(500, ctx.suivant)
  }
  const verifier = (garder: boolean) => {
    if (occupe.current) return
    occupe.current = true
    ctx.maj(() => ({ freq: garder ? 3 : 1, chk3: garder ? 'y' : 'n' }))
    vibrer('medium')
    apres(500, ctx.suivant)
  }
  return (
    <Haut ctx={ctx}>
      {!verif ? (
        <>
          <Entree dl={260} reduit={ctx.reduit} style={{ marginTop: 12 }}>
            <Titre>How often does an evening end without what you planned?</Titre>
          </Entree>
          <View style={{ gap: 8, marginTop: 24 }}>
            {FREQ.map((f, i) => (
              <Entree key={f.k} dl={480 + i * 110} reduit={ctx.reduit}>
                <Ligne titre={f.k} sous={SOUS_FREQ[i]} forme="radio" pris={ctx.e.freq === i} onPress={() => toucher(i)} />
              </Entree>
            ))}
          </View>
        </>
      ) : (
        <>
          <Entree dl={100} reduit={ctx.reduit} style={{ marginTop: 12 }}>
            <Titre>Even counting the evenings you scrolled instead?</Titre>
          </Entree>
          <View style={{ gap: 8, marginTop: 32 }}>
            <Entree dl={210} reduit={ctx.reduit}>
              <Ligne titre="No — then a few evenings a week" forme="radio" pris={ctx.e.chk3 === 'n'} onPress={() => verifier(false)} />
            </Entree>
            <Entree dl={320} reduit={ctx.reduit}>
              <Ligne titre="Yes, rarely" forme="radio" pris={ctx.e.chk3 === 'y'} onPress={() => verifier(true)} />
            </Entree>
          </View>
        </>
      )}
    </Haut>
  )
}

// ——— 4 · Ce qui est repoussé ———
export function EcranRepousse({ ctx }: { ctx: Ctx }) {
  const prs = priorites(ctx.e)
  const bascule = (id: string) => {
    vibrer('light')
    ctx.maj((e) => ({ things: e.things.includes(id) ? e.things.filter((x) => x !== id) : [...e.things, id] }))
  }
  let dl = 480
  const groupes = prs.map((p) => {
    const g = { p, dl, items: [] as { id: string; label: string; dl: number }[] }
    dl += 60
    for (const it of chosesDe(p)) {
      g.items.push({ id: it.id, label: it.label, dl })
      dl += 70
    }
    return g
  })
  const n = ctx.e.things.filter((id) => prs.includes(ITEM[id]!.prio)).length
  return (
    <View style={{ flex: 1 }}>
      <Defile ctx={ctx}>
        <Entree dl={260} reduit={ctx.reduit} style={{ marginTop: 12 }}>
          <Titre>{frequence(ctx.e).title}</Titre>
        </Entree>
        <Entree dl={370} reduit={ctx.reduit} style={{ marginTop: 8 }}>
          <Text style={T.gris}>Choose everything that’s true.</Text>
        </Entree>
        <View style={{ gap: 24, marginTop: 24 }}>
          {groupes.map((g) => (
            <View key={g.p} style={{ gap: 8 }}>
              {prs.length > 1 ? (
                <Entree dl={g.dl} reduit={ctx.reduit}>
                  <Text style={T.petit}>{g.p}</Text>
                </Entree>
              ) : null}
              {g.items.map((it) => (
                <Entree key={it.id} dl={it.dl} reduit={ctx.reduit}>
                  <Ligne titre={it.label} forme="check" pris={ctx.e.things.includes(it.id)} onPress={() => bascule(it.id)} />
                </Entree>
              ))}
            </View>
          ))}
        </View>
      </Defile>
      <PiedDegrade bas={ctx.bas} reduit={ctx.reduit}>
        <Bouton
          actif={n > 0}
          onPress={() => {
            ctx.maj((e) => ({ things: e.things.filter((id) => prs.includes(ITEM[id]!.prio)) }))
            vibrer('light')
            ctx.suivant()
          }}
        >
          {n > 1 ? 'These are the ones' : 'That’s the one'}
        </Bouton>
      </PiedDegrade>
    </View>
  )
}

// ——— 5 · Trois questions par chose ———
type Champ = 'since' | 'work' | 'goal' | 'now'
export function EcranDetail({ ctx }: { ctx: Ctx }) {
  const apres = useMinuteries()
  const occupe = useRef(false)
  const k = ctx.etape.k
  const t = ctx.etape.t ?? 0
  const ids = choses(ctx.e)
  const id = ids[t] ?? ids[0]!
  const it = ITEM[id]!
  const raw = ctx.e.det[id] ?? {}
  const sous = it.kind === 'once' ? ['5a', '5b', '5c'] : ['5a', '5g', '5c']
  const pos = sous.indexOf(k)
  const tete = (ids.length > 1 ? `${t + 1} of ${ids.length} · ` : '') + it.label
  const repondre = (champ: Champ, i: number) => {
    if (occupe.current) return
    occupe.current = true
    ctx.maj((e: EtatIntro) => ({ det: { ...e.det, [id]: { ...(e.det[id] ?? {}), [champ]: i } } }))
    vibrer('medium')
    apres(500, ctx.suivant)
  }
  let titre = ''
  let options: Choix[] | [string, ...unknown[]][] = []
  let champ: Champ = 'since'
  if (k === '5a') {
    titre = `Since when have you been meaning to ${it.since}?`
    options = SINCE
  } else if (k === '5b') {
    titre = 'How much work does it really need?'
    options = WORK
    champ = 'work'
  } else if (k === '5g') {
    titre = 'What are you really after?'
    options = GOALS[id] ?? []
    champ = 'goal'
  } else {
    titre = it.kind === 'once' ? 'How many hours a week do you actually put into it?' : `How often do you actually ${it.kind === 'rep' ? it.now : ''} now?`
    options = it.kind === 'once' ? NOWO : nowOpts(besoin(id, raw).per)
    champ = 'now'
  }
  const liste = (
    <View style={{ gap: 8, marginTop: k === '5c' ? 40 : 32 }}>
      {options.map((o, i) => (
        <Entree key={String(o[0])} dl={(k === '5c' ? 400 : 330) + i * 110} reduit={ctx.reduit}>
          <Ligne titre={String(o[0])} forme="radio" pris={raw[champ] === i} onPress={() => repondre(champ, i)} />
        </Entree>
      ))}
    </View>
  )
  return (
    <View style={{ flex: 1 }}>
      <Haut ctx={ctx}>
        <Entree dl={100} reduit={ctx.reduit}>
          <Text style={T.gris}>{tete}</Text>
        </Entree>
        <Entree dl={100} reduit={ctx.reduit} style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
          {sous.map((s, i) => (
            <View key={s} style={{ width: 24, height: 2, backgroundColor: i <= pos ? C.t1 : C.s2 }} />
          ))}
        </Entree>
        {k !== '5c' ? (
          <>
            <Entree dl={220} reduit={ctx.reduit} style={{ marginTop: 32 }}>
              <Titre>{titre}</Titre>
            </Entree>
            {liste}
          </>
        ) : null}
      </Haut>
      {k === '5c' ? (
        // La question honnête : seule, au milieu, plus grande.
        <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut + 111, bottom: 60, justifyContent: 'center' }}>
          <Entree dl={260} reduit={ctx.reduit}>
            <Titre grand>{titre}</Titre>
          </Entree>
          {liste}
        </View>
      ) : null}
    </View>
  )
}

// ——— 6 · Ce qui l'arrête ———
export function EcranFreins({ ctx }: { ctx: Ctx }) {
  const bascule = (i: number) => {
    vibrer('light')
    ctx.maj((e) => ({ stops: e.stops.includes(i) ? e.stops.filter((x) => x !== i) : [...e.stops, i] }))
  }
  return (
    <View style={{ flex: 1 }}>
      <Haut ctx={ctx}>
        <Entree dl={260} reduit={ctx.reduit} style={{ marginTop: 12 }}>
          <Titre>What usually stops you?</Titre>
        </Entree>
        <Entree dl={370} reduit={ctx.reduit} style={{ marginTop: 8 }}>
          <Text style={T.gris}>Choose everything that’s true.</Text>
        </Entree>
        <View style={{ gap: 8, marginTop: 24 }}>
          {STOPS.map((s, i) => (
            <Entree key={s} dl={480 + i * 110} reduit={ctx.reduit}>
              <Ligne titre={s} forme="check" pris={ctx.e.stops.includes(i)} onPress={() => bascule(i)} />
            </Entree>
          ))}
        </View>
      </Haut>
      <Entree dl={900} reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
        <Bouton
          actif={ctx.e.stops.length > 0}
          onPress={() => {
            vibrer('light')
            ctx.suivant()
          }}
        >
          Show me what it cost
        </Bouton>
      </Entree>
    </View>
  )
}
