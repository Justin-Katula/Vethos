import { describe, it, expect } from 'vitest'
import { planDuJour } from './construire'
import type { Ancre, Objectif, Tache } from '@/donnees/magasin'

const LEVER = 7 * 60 // 07:00
const COUCHER = 23 * 60 // 23:00
// Un lundi, pour que les ancres « en semaine » tombent.
const LUNDI = '2026-09-21'

const tache = (p: Partial<Tache> = {}): Tache => ({
  id: p.id ?? 't1',
  titre: p.titre ?? 'Dossier',
  intention: '',
  echeance: p.echeance ?? '2026-09-28',
  importance: p.importance ?? 5,
  minutesEstimees: p.minutesEstimees ?? 60,
  minutesRestantes: p.minutesRestantes ?? 60,
  nature: 'routine',
  terminee: p.terminee ?? false,
  creeeLe: '2026-09-20T10:00:00.000Z',
})

const ancre = (p: Partial<Ancre> = {}): Ancre => ({
  id: p.id ?? 'a1',
  nom: p.nom ?? 'Déjeuner',
  declencheur: '',
  couleur: '#2c3a56',
  minuteAncrage: p.minuteAncrage ?? 12 * 60 + 30,
  jours: p.jours ?? [1, 2, 3, 4, 5],
  dureeMinutes: p.dureeMinutes ?? 60,
  creeeLe: '2026-09-20T10:00:00.000Z',
})

const objectif = (p: Partial<Objectif> = {}): Objectif => ({
  id: p.id ?? 'o1',
  nom: p.nom ?? 'Piano',
  intention: '',
  couleur: '#55585c',
  cibleHebdoMinutes: p.cibleHebdoMinutes ?? 420,
  creeLe: '2026-09-20T10:00:00.000Z',
})

const construire = (p: {
  taches?: Tache[]
  objectifs?: Objectif[]
  ancres?: Ancre[]
}) =>
  planDuJour({
    taches: p.taches ?? [],
    objectifs: p.objectifs ?? [],
    ancres: p.ancres ?? [],
    lever: LEVER,
    coucher: COUCHER,
    date: LUNDI,
  })

describe('une journée vide', () => {
  it('ne place rien', () => {
    expect(construire({})).toEqual([])
  })
})

describe('les ancres ne bougent jamais', () => {
  it('tombe exactement à son heure', () => {
    const plan = construire({ ancres: [ancre({ minuteAncrage: 12 * 60 + 30 })] })
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ startMinute: 750, endMinute: 810, kind: 'ancre' })
  })

  it('reste en place même quand une tâche voudrait ce créneau', () => {
    // C'est toute la raison d'être d'une ancre : le reste s'organise AUTOUR.
    const plan = construire({
      ancres: [ancre({ minuteAncrage: 12 * 60 })],
      taches: [tache({ minutesEstimees: 600, minutesRestantes: 600 })],
    })
    const dejeuner = plan.find((b) => b.kind === 'ancre')
    expect(dejeuner).toMatchObject({ startMinute: 720, endMinute: 780 })
  })

  it('ne place pas une ancre qui n’est pas prévue ce jour-là', () => {
    // Lundi = jour 1 ; cette ancre ne vit que le week-end.
    expect(construire({ ancres: [ancre({ jours: [0, 6] })] })).toEqual([])
  })
})

describe('rien ne se chevauche, jamais', () => {
  it('les blocs se suivent sans se marcher dessus', () => {
    const plan = construire({
      ancres: [ancre()],
      taches: [
        tache({ id: 't1', titre: 'A', minutesEstimees: 120, minutesRestantes: 120 }),
        tache({ id: 't2', titre: 'B', minutesEstimees: 90, minutesRestantes: 90 }),
      ],
      objectifs: [objectif()],
    })
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i]!.startMinute).toBeGreaterThanOrEqual(plan[i - 1]!.endMinute)
    }
  })

  it('laisse respirer entre deux blocs', () => {
    // Une journée sans marge est un mur : on ne la tient pas.
    const plan = construire({
      taches: [
        tache({ id: 't1', minutesEstimees: 60, minutesRestantes: 60 }),
        tache({ id: 't2', minutesEstimees: 60, minutesRestantes: 60 }),
      ],
    })
    if (plan.length >= 2) {
      expect(plan[1]!.startMinute - plan[0]!.endMinute).toBeGreaterThan(0)
    }
  })
})

describe('les limites de la journée', () => {
  it('ne pose rien avant le lever ni après le coucher', () => {
    const plan = construire({
      taches: [tache({ minutesEstimees: 3000, minutesRestantes: 3000 })],
      objectifs: [objectif({ cibleHebdoMinutes: 6000 })],
    })
    for (const b of plan) {
      expect(b.startMinute).toBeGreaterThanOrEqual(LEVER)
      expect(b.endMinute).toBeLessThanOrEqual(COUCHER)
    }
  })

  it('une ancre tardive est coupée au coucher, pas rejetée', () => {
    const plan = construire({
      ancres: [ancre({ minuteAncrage: 22 * 60 + 30, dureeMinutes: 120 })],
    })
    expect(plan[0]?.endMinute).toBe(COUCHER)
  })
})

describe('ce qui passe en premier', () => {
  it('l’échéance la plus proche gagne', () => {
    const plan = construire({
      taches: [
        tache({ id: 'loin', titre: 'Loin', echeance: '2026-12-31' }),
        tache({ id: 'proche', titre: 'Proche', echeance: '2026-09-22' }),
      ],
    })
    expect(plan[0]?.label).toBe('Proche')
  })

  it('à échéance égale, l’importance départage', () => {
    const plan = construire({
      taches: [
        tache({ id: 'a', titre: 'Peu', echeance: '2026-09-25', importance: 2 }),
        tache({ id: 'b', titre: 'Beaucoup', echeance: '2026-09-25', importance: 9 }),
      ],
    })
    expect(plan[0]?.label).toBe('Beaucoup')
  })

  it('une tâche terminée ne prend plus de place', () => {
    expect(construire({ taches: [tache({ terminee: true })] })).toEqual([])
  })
})

describe('la forme des blocs', () => {
  it('la pause est INCLUSE dans l’empreinte, jamais ajoutée après', () => {
    // La règle du bureau. L'enfreindre ferait déborder chaque journée.
    for (const b of construire({ taches: [tache({ minutesEstimees: 90, minutesRestantes: 90 })] })) {
      expect(b.workMinutes + b.breakMinutes).toBe(b.durationMinutes)
      expect(b.durationMinutes).toBe(b.endMinute - b.startMinute)
    }
  })

  it('aucune séance ne dépasse 90 minutes d’un trait', () => {
    // Au-delà, l'attention s'effondre — découper vaut mieux qu'étirer.
    const plan = construire({ taches: [tache({ minutesEstimees: 300, minutesRestantes: 300 })] })
    for (const b of plan) expect(b.endMinute - b.startMinute).toBeLessThanOrEqual(90)
  })

  it('le matin est marqué comme fenêtre profonde', () => {
    const plan = construire({ taches: [tache()] })
    expect(plan[0]?.cognitiveWindow).toBe('PROFONDE')
  })
})

describe('les objectifs prennent ce qui reste', () => {
  it('passent APRÈS les tâches, jamais avant', () => {
    const plan = construire({
      taches: [tache({ titre: 'Urgent', echeance: '2026-09-21' })],
      objectifs: [objectif({ nom: 'Piano' })],
    })
    const premiereTache = plan.findIndex((b) => b.kind === 'task')
    const premierObjectif = plan.findIndex((b) => b.kind === 'objective')
    expect(premiereTache).toBeGreaterThanOrEqual(0)
    expect(premierObjectif).toBeGreaterThan(premiereTache)
  })

  it('répartissent leur cible hebdomadaire sur la journée', () => {
    const plan = construire({ objectifs: [objectif({ cibleHebdoMinutes: 420 })] })
    const total = plan.reduce((s, b) => s + (b.endMinute - b.startMinute), 0)
    // 420 / 7 = 60 minutes par jour.
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(90)
  })
})
