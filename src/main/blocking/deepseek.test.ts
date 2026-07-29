import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { judgeJustification } from './deepseek'

// Mock du logger pour éviter le bruit + s'assurer qu'il ne lève pas.
vi.mock('@main/logging/setup', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock de readFileSync pour injecter une clé .env sans dépendre du disque.
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn((path: string) => {
      if (typeof path === 'string' && path.endsWith('.env')) {
        return 'DEEPSEEK_API_KEY=test-key-fake\n'
      }
      return ''
    }),
  }
})

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(() => {
  vi.resetModules()
})

describe('judgeJustification', () => {
  it('refuse quand la justification est trop courte', async () => {
    const verdict = await judgeJustification('ok', {})
    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toMatch(/court/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepte quand l\'IA renvoie valid=true', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"valid": true, "reason": "Raison pro valable."}',
            },
          },
        ],
      }),
    })

    const verdict = await judgeJustification('Je dois finir un rendu client pour demain matin.', {
      appName: 'Photoshop',
    })

    expect(verdict.valid).toBe(true)
    expect(verdict.reason).toBe('Raison pro valable.')
    expect(fetchMock).toHaveBeenCalledOnce()
    // Vérifie le payload de la requête
    const call = fetchMock.mock.calls[0]
    const body = JSON.parse(call?.[1]?.body)
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.temperature).toBe(0)
    expect(body.response_format).toEqual({ type: 'json_object' })
    // Le contexte appName doit apparaître dans le prompt utilisateur
    const userMsg = body.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('Photoshop')
  })

  it('refuse quand l\'IA renvoie valid=false', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"valid": false, "reason": "Pas une vraie raison."}' } }],
      }),
    })

    const verdict = await judgeJustification('parce que je veux scroller instagram lol', {
      appName: 'Instagram',
    })

    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toBe('Pas une vraie raison.')
  })

  it('parse la réponse même enrobée dans de la prose', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                'Voici ma réponse :\n{"valid": true, "reason": "Urgence client."}\nBonne journée.',
            },
          },
        ],
      }),
    })

    const verdict = await judgeJustification(' Urgence client : prod down. ')
    expect(verdict.valid).toBe(true)
  })

  it('refuse par sécurité quand l\'IA renvoie une erreur HTTP', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })

    const verdict = await judgeJustification('une justification raisonnable ici')
    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toMatch(/500|erreur/i)
  })

  it('refuse par sécurité quand la réponse est illisible', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Je ne peux pas répondre à ça.' } }],
      }),
    })

    const verdict = await judgeJustification('une justification raisonnable ici')
    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toMatch(/illisible/i)
  })

  it('refuse quand le fetch lève (réseau coupé)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    const verdict = await judgeJustification('une justification raisonnable ici')
    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toMatch(/injoignable|réseau/i)
  })

  it('accepte les variantes de champ de réponse (allowed/ok)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"allowed": true, "raison": "Ok."}' } }],
      }),
    })

    const verdict = await judgeJustification('une justification raisonnable ici')
    expect(verdict.valid).toBe(true)
    expect(verdict.reason).toBe('Ok.')
  })
})
