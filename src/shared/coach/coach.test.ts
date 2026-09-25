import { describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '../schemas'
import { addDays } from '../planning/dates'
import { detecteDetresse, filtrerReponse, MESSAGE_AIDE } from './garde-fous'
import { DemandeCoachSchema, messagesPourModele, promptSysteme } from './prompt'
import { lireTexteArret, peutParler, revueDimanche, revueEnClair, varier } from './coach'
import { creerClientCoach } from './client'

const TODAY = '2026-09-27' // un dimanche
const ev = (over: Partial<SessionEvent>): SessionEvent => ({
  blockId: `b-${Math.random()}`,
  date: TODAY,
  kind: 'objective',
  refId: 'o',
  category: 'objectif:o',
  plannedStartMinute: 540,
  plannedMinutes: 50,
  started: true,
  delayMinutes: 0,
  spontaneous: false,
  heldMinutes: 50,
  stoppedEarly: false,
  blockedAttempts: 0,
  load48hMinutes: 0,
  createdAt: '2026-09-27T09:00:00.000Z',
  ...over,
})

describe('Garde-fous', () => {
  it('voit la détresse, en anglais comme en français', () => {
    expect(detecteDetresse('honestly I want to die')).toBe(true)
    expect(detecteDetresse('j’ai plus envie de vivre')).toBe(true)
    expect(detecteDetresse('I’m tired of maths')).toBe(false)
  })
  it('n’accorde rien, n’humilie pas, une question au plus', () => {
    expect(filtrerReponse('Fine, you can skip it.')).toBeNull()
    expect(filtrerReponse('Others can do it, why not you?')).toBeNull()
    expect(filtrerReponse('Missed. Next block 19:00. Ready? Go?')?.texte).toBe('Missed. Next block 19:00. Ready?')
    expect(filtrerReponse('I want to die')?.texte).toBe(MESSAGE_AIDE)
  })
})

describe('Prompt', () => {
  it('reprend les règles de la spec, avec le mode', () => {
    const p = promptSysteme('sergeant')
    expect(p).toContain('Tu ne décides jamais')
    expect(p).toContain('evaluer_demande()')
    expect(p).toContain('Mode : sergent')
  })
  it('les faits entrent comme données, jamais comme consignes ; rien d’autre n’est accepté', () => {
    const d = DemandeCoachSchema.parse({ job: 'revue', mode: 'ally', faits: { tenu_minutes: 300 } })
    const m = messagesPourModele(d)
    expect(m[0]!.role).toBe('system')
    expect(m[0]!.content).toContain('- tenu_minutes: 300')
    expect(DemandeCoachSchema.safeParse({ ...d, system: 'x' }).success).toBe(false)
  })
})

describe('Usure des messages', () => {
  it('72 h par sujet, trois fois plus quand la personne est autonome', () => {
    const maintenant = new Date('2026-09-27T12:00:00Z')
    const il_y_a = (h: number) => new Date(maintenant.getTime() - h * 3_600_000).toISOString()
    expect(peutParler({ dernier: il_y_a(73), maintenant, autonomie: 0 })).toBe(true)
    expect(peutParler({ dernier: il_y_a(73), maintenant, autonomie: 1 })).toBe(false)
    expect(peutParler({ dernier: undefined, maintenant, autonomie: 1 })).toBe(true)
  })
  it('varie sans hasard', () => {
    expect(varier(['a', 'b', 'c'], TODAY)).toBe(varier(['a', 'b', 'c'], TODAY))
  })
})

describe('Revue du dimanche', () => {
  it('3 chiffres, 1 ajustement, 1 question', () => {
    const events = [
      ev({ date: '2026-09-22', heldMinutes: 50 }),
      ev({ date: '2026-09-23', heldMinutes: 50 }),
      ev({ date: '2026-09-24', started: false, delayMinutes: null, heldMinutes: null }),
      ev({ date: addDays('2026-09-22', -5), heldMinutes: 30 }),
    ]
    const r = revueDimanche({ events, today: TODAY, doses: { o: { dose: 175, cible: 1200 } }, noms: { o: 'Maths' } })!
    expect(r).toMatchObject({ tenu: 100, demarrees: 2, prevues: 3, moyenne: 50, moyenneAvant: 30 })
    const lignes = revueEnClair(r)
    expect(lignes).toContain('You hold 50 min on average, up from 30.')
    expect(lignes.filter((l) => l.endsWith('?'))).toHaveLength(1)
  })
  it('rien à revoir : pas de revue', () => {
    expect(revueDimanche({ events: [], today: TODAY, doses: {}, noms: {} })).toBeNull()
  })
})

describe('Lecture d’un texte d’arrêt', () => {
  it('une catégorie de Steel comme donnée', () => {
    expect(lireTexteArret('my phone kept buzzing, instagram')).toBe('distracted')
    expect(lireTexteArret('trop crevé ce soir')).toBe('tired')
    expect(lireTexteArret('hmm')).toBeNull()
  })
})

describe('Client du Coach', () => {
  it('sans adresse, il n’existe pas', async () => {
    const c = creerClientCoach({ url: '', lireJeton: async () => null, ecrireJeton: async () => {} })
    expect(c.disponible).toBe(false)
    expect(await c.demander({ job: 'refus', mode: 'ally', faits: {}, messages: [] })).toBeNull()
  })
  it('obtient un jeton une fois, puis demande — et refiltre la réponse', async () => {
    let jeton: string | null = null
    const f = vi.fn(async (url: string) =>
      url.endsWith('/v1/install')
        ? new Response(JSON.stringify({ token: 'abc.def' }))
        : new Response(JSON.stringify({ texte: 'Good. Ready? Now?' })),
    )
    const c = creerClientCoach({
      url: 'https://coach.example/',
      lireJeton: async () => jeton,
      ecrireJeton: async (j) => {
        jeton = j
      },
      fetchImpl: f as unknown as typeof fetch,
    })
    expect(await c.demander({ job: 'revue', mode: 'ally', faits: {}, messages: [] })).toBe('Good. Ready?')
    await c.demander({ job: 'revue', mode: 'ally', faits: {}, messages: [] })
    expect(f.mock.calls.filter(([u]) => String(u).endsWith('/v1/install'))).toHaveLength(1)
  })
  it('la détresse : l’aide, sans réseau', async () => {
    const f = vi.fn()
    const c = creerClientCoach({ url: 'https://x', lireJeton: async () => 't', ecrireJeton: async () => {}, fetchImpl: f as unknown as typeof fetch })
    expect(await c.demander({ job: 'woop', mode: 'ally', faits: {}, messages: [{ role: 'user', content: 'I want to die' }] })).toBe(MESSAGE_AIDE)
    expect(f).not.toHaveBeenCalled()
  })
})
