import { describe, it, expect } from 'vitest'
import {
  decodeJournal,
  emptyJournal,
  encodeJournal,
  planReplay,
  removeEntry,
  upsertEntry,
  type Journal,
  type JournalEntry,
} from './journal'

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    hwnd: '1000',
    pid: 42,
    exeName: 'blender.exe',
    processCreatedAt: '133700000000000000',
    taskbarWasVisible: true,
    originalShowState: 'normal',
    audioWasMuted: false,
    ...overrides,
  }
}

describe('encodeJournal / decodeJournal', () => {
  it('fait un aller-retour sans perte', () => {
    const journal: Journal = {
      version: 1,
      sessionStartedAt: '2026-07-28T09:00:00.000Z',
      entries: [makeEntry(), makeEntry({ hwnd: '2000', pid: 43 })],
    }
    const decoded = decodeJournal(encodeJournal(journal))
    expect(decoded).toEqual(journal)
  })

  it('renvoie null sur du JSON invalide plutôt que de lever', () => {
    expect(decodeJournal('pas du json')).toBeNull()
    expect(decodeJournal('')).toBeNull()
  })

  it('renvoie null sur une version inconnue — jamais deviner un format', () => {
    expect(decodeJournal('{"version":99,"sessionStartedAt":"x","entries":[]}')).toBeNull()
  })

  it("renvoie null si entries n'est pas un tableau", () => {
    expect(decodeJournal('{"version":1,"sessionStartedAt":"x","entries":{}}')).toBeNull()
  })

  it('écarte une entrée malformée sans jeter tout le journal', () => {
    const raw = JSON.stringify({
      version: 1,
      sessionStartedAt: '2026-07-28T09:00:00.000Z',
      entries: [makeEntry(), { hwnd: 12 }, { pasDuTout: true }],
    })
    const decoded = decodeJournal(raw)
    expect(decoded?.entries).toHaveLength(1)
    expect(decoded?.entries[0]?.hwnd).toBe('1000')
  })
})

describe('planReplay', () => {
  const journal: Journal = {
    version: 1,
    sessionStartedAt: '2026-07-28T09:00:00.000Z',
    entries: [
      makeEntry({ hwnd: '1000', pid: 42, processCreatedAt: '111' }),
      makeEntry({ hwnd: '2000', pid: 43, processCreatedAt: '222' }),
      makeEntry({ hwnd: '3000', pid: 44, processCreatedAt: '333' }),
    ],
  }

  it('retient les entrées dont le processus est toujours vivant', () => {
    const plan = planReplay(journal, [
      { pid: 42, processCreatedAt: '111' },
      { pid: 44, processCreatedAt: '333' },
    ])
    expect(plan.map((e) => e.hwnd)).toEqual(['1000', '3000'])
  })

  it("écarte un PID réutilisé par un autre processus", () => {
    // Meme PID, heure de creation differente : Windows a recycle le PID.
    // Restaurer ici toucherait un processus etranger.
    const plan = planReplay(journal, [{ pid: 42, processCreatedAt: '999' }])
    expect(plan).toEqual([])
  })

  it('écarte les processus disparus', () => {
    expect(planReplay(journal, [])).toEqual([])
  })

  it('gère un journal vide', () => {
    expect(planReplay(emptyJournal('2026-07-28T09:00:00.000Z'), [{ pid: 1, processCreatedAt: '1' }])).toEqual([])
  })
})

describe('upsertEntry / removeEntry', () => {
  it('ajoute une entrée absente', () => {
    const journal = upsertEntry(emptyJournal('x'), makeEntry())
    expect(journal.entries).toHaveLength(1)
  })

  it('ne réécrit pas une entrée existante — la première capture fait foi', () => {
    // Sinon on memoriserait l'etat DEJA modifie et la restauration serait fausse.
    const first = upsertEntry(emptyJournal('x'), makeEntry({ taskbarWasVisible: true }))
    const second = upsertEntry(first, makeEntry({ taskbarWasVisible: false }))
    expect(second.entries).toHaveLength(1)
    expect(second.entries[0]?.taskbarWasVisible).toBe(true)
  })

  it('retire une entrée par hwnd', () => {
    const journal = upsertEntry(upsertEntry(emptyJournal('x'), makeEntry()), makeEntry({ hwnd: '2000' }))
    const after = removeEntry(journal, '1000')
    expect(after.entries.map((e) => e.hwnd)).toEqual(['2000'])
  })

  it("ignore le retrait d'un hwnd absent", () => {
    const journal = upsertEntry(emptyJournal('x'), makeEntry())
    expect(removeEntry(journal, 'inconnu').entries).toHaveLength(1)
  })

  it('upsertEntry ne modifie pas le journal reçu en entrée', () => {
    const original: Journal = { version: 1, sessionStartedAt: 'x', entries: [makeEntry()] }
    const updated = upsertEntry(original, makeEntry({ hwnd: '2000' }))
    expect(original.entries).toHaveLength(1)
    expect(original.entries.map((e) => e.hwnd)).toEqual(['1000'])
    expect(updated.entries).toHaveLength(2)
    expect(updated.entries.map((e) => e.hwnd)).toEqual(['1000', '2000'])
  })

  it('removeEntry ne modifie pas le journal reçu en entrée', () => {
    const original: Journal = {
      version: 1,
      sessionStartedAt: 'x',
      entries: [makeEntry(), makeEntry({ hwnd: '2000' })],
    }
    const updated = removeEntry(original, '1000')
    expect(original.entries).toHaveLength(2)
    expect(original.entries.map((e) => e.hwnd)).toEqual(['1000', '2000'])
    expect(updated.entries).toHaveLength(1)
    expect(updated.entries.map((e) => e.hwnd)).toEqual(['2000'])
  })
})
