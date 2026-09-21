import { describe, it, expect } from 'vitest'
import { calculerPlan } from './moteur'
import type { Ancre, Objectif, Obligation, Reglages, Tache } from '@/donnees/magasin'

/**
 * Le vrai moteur, appelé depuis le téléphone.
 *
 * Ces tests ne revérifient PAS le moteur : il a les siens, 271, et il est
 * déclaré intouchable. Ils vérifient la seule chose qui puisse casser ici —
 * la traduction. Un champ mal nommé, une unité inversée, une nuit oubliée, et
 * le moteur rend un plan vide sans rien dire.
 */

const REGLAGES: Reglages = { prenom: '', apparence: 'system', clairDes: '07:00', sombreDes: '19:00', introductionFaite: true, coucher: '23:30', lever: '07:00' }
const LUNDI = new Date(2026, 8, 21, 8, 0, 0) // 21 septembre 2026, 08:00 local

const tache = (p: Partial<Tache> = {}): Tache => ({
  id: p.id ?? 't1',
  titre: p.titre ?? 'Dossier',
  intention: '',
  echeance: p.echeance ?? '2026-09-25',
  importance: p.importance ?? 5,
  minutesEstimees: p.minutesEstimees ?? 120,
  minutesRestantes: p.minutesRestantes ?? 120,
  facteurCorrection: p.facteurCorrection ?? 1.4,
  minutesSupplementaires: p.minutesSupplementaires ?? 0,
  parentId: p.parentId ?? null,
  rangPartie: p.rangPartie ?? null,
  nature: p.nature ?? 'routine',
  terminee: p.terminee ?? false,
  creeeLe: '2026-09-20T10:00:00.000Z',
})

const appeler = (p: {
  taches?: Tache[]
  objectifs?: Objectif[]
  ancres?: Ancre[]
  obligations?: Obligation[]
  reglages?: Reglages
}) =>
  calculerPlan({
    taches: p.taches ?? [],
    objectifs: p.objectifs ?? [],
    ancres: p.ancres ?? [],
    obligations: p.obligations ?? [],
    reglages: p.reglages ?? REGLAGES,
    maintenant: LUNDI,
  })

describe('la traduction vers le moteur', () => {
  it('rend un résultat complet, même sans rien à placer', () => {
    const r = appeler({})
    expect(r.blocks).toEqual([])
    expect(r.capacities.length).toBeGreaterThan(0)
    expect(r.feasibility).toBeDefined()
  })

  it('place réellement une tâche', () => {
    // Si la traduction est fausse — un champ mal nommé, une unité inversée —
    // le moteur rend un plan vide sans lever d'erreur. C'est le seul test qui
    // attrape ça.
    const r = appeler({ taches: [tache()] })
    expect(r.blocks.length).toBeGreaterThan(0)
    expect(r.blocks.some((b) => b.kind === 'task')).toBe(true)
  })

  it('calcule une capacité pour chaque jour de l’horizon', () => {
    const r = appeler({ taches: [tache()] })
    expect(r.capacities).toHaveLength(7)
  })

  it('transmet le temps supplémentaire accordé', () => {
    // B.5.2 : « il m'en faut plus » ajoute des minutes APRES le facteur. Si ce
    // champ n'arrivait pas au moteur, le bouton existerait sans rien changer
    // au plan — la pire des pannes, celle qui ne se voit pas.
    const sans = appeler({ taches: [tache({ minutesRestantes: 120 })] })
    const avec = appeler({ taches: [tache({ minutesRestantes: 120, minutesSupplementaires: 60 })] })

    const pose = (r: typeof sans) => r.blocks.reduce((s, b) => s + b.workMinutes, 0)
    expect(pose(avec)).toBe(pose(sans) + 60)
  })

  it('verrouille la partie 2 tant que la partie 1 est active', () => {
    // B.5.1 : une partie de rang superieur ne se travaille pas avant sa soeur.
    // Le moteur la pose quand meme, mais en APERCU — elle occupe la place sans
    // etre creditee. Sans `partOrder`, les deux parties seraient travaillables
    // le meme jour, dans un ordre arbitraire.
    const r = appeler({
      taches: [
        tache({ id: 'p1', titre: 'Dossier — Partie 1', parentId: 'mere', rangPartie: 1, minutesEstimees: 300, minutesRestantes: 300 }),
        tache({ id: 'p2', titre: 'Dossier — Partie 2', parentId: 'mere', rangPartie: 2, minutesEstimees: 300, minutesRestantes: 300 }),
      ],
    })
    const deuxieme = r.blocks.filter((b) => b.refId === 'p2')
    expect(deuxieme.length).toBeGreaterThan(0)
    expect(deuxieme.every((b) => b.preview === true)).toBe(true)
  })
})

describe('le sommeil, et la nuit qui franchit minuit', () => {
  it('ne place JAMAIS rien pendant la nuit', () => {
    // 23h30 → 07h00 traverse minuit. Si la coupure en deux entrées manquait,
    // la nuit disparaîtrait du calcul et le moteur croirait la journée deux
    // fois plus longue — en plaçant du travail à 3 h du matin.
    const r = appeler({
      taches: [tache({ minutesEstimees: 2000, minutesRestantes: 2000 })],
      objectifs: [
        {
          id: 'o1',
          nom: 'Piano',
          intention: '',
          couleur: '#55585c',
          cibleHebdoMinutes: 3000,
          creeLe: '2026-09-20T10:00:00.000Z',
        },
      ],
    })
    for (const b of r.blocks) {
      const nuitSoir = b.startMinute >= 23 * 60 + 30
      const nuitMatin = b.endMinute <= 7 * 60
      expect(nuitSoir || nuitMatin, `${b.label} à ${b.startMinute} tombe dans la nuit`).toBe(false)
    }
  })

  it('garde une nuit même quand l’heure est en train d’être tapée', () => {
    // Le champ des reglages est un TextInput libre. Pendant qu'on efface
    // « 23:30 » pour taper autre chose, il vaut « 2 », puis « 23 », puis
    // « 23: » — et aucune de ces valeurs n'est une heure. Sans repli, la nuit
    // disparaitrait du calcul a cet instant-la et le moteur poserait du
    // travail a 3 h du matin, sur un ecran que l'utilisateur regarde.
    for (const coucher of ['2', '23', '23:', '', 'nawak']) {
      const r = appeler({
        taches: [tache({ minutesEstimees: 2000, minutesRestantes: 2000 })],
        reglages: { ...REGLAGES, coucher },
      })
      const nuit = r.blocks.filter((b) => b.startMinute >= 1 * 60 && b.endMinute <= 6 * 60)
      expect(nuit, `coucher « ${coucher} » : ${nuit.length} blocs en pleine nuit`).toHaveLength(0)
    }
  })

  it('respecte une obligation déclarée', () => {
    // Un cours de 9 h à 12 h le lundi : rien ne doit s'y poser.
    const cours: Obligation = {
      id: 'ob1',
      dayOfWeek: 1,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      categoryType: 'school',
      label: 'Cours',
      color: '#55585c',
    }
    const r = appeler({
      taches: [tache({ minutesEstimees: 600, minutesRestantes: 600 })],
      obligations: [cours],
    })
    const duLundi = r.blocks.filter((b) => b.date === '2026-09-21')
    for (const b of duLundi) {
      const chevauche = b.startMinute < cours.endMinute && b.endMinute > cours.startMinute
      expect(chevauche, `${b.label} chevauche le cours`).toBe(false)
    }
  })
})

describe('les lois que le moteur fait respecter', () => {
  it('une ancre tombe exactement à son heure', () => {
    const ancre: Ancre = {
      id: 'a1',
      nom: 'Déjeuner',
      intention: 'Manger sans écran',
      declencheur: '',
      couleur: '#2c3a56',
      minuteAncrage: 12 * 60 + 30,
      jours: [1, 2, 3, 4, 5],
      dureeMinutes: 60,
      creeeLe: '2026-09-20T10:00:00.000Z',
    }
    const r = appeler({ ancres: [ancre], taches: [tache({ minutesEstimees: 600, minutesRestantes: 600 })] })
    const dejeuner = r.blocks.find((b) => b.kind === 'ancre' && b.date === '2026-09-21')
    expect(dejeuner?.startMinute).toBe(12 * 60 + 30)
  })

  it('aucun bloc ne se chevauche, quel que soit le jour', () => {
    const r = appeler({
      taches: [
        tache({ id: 't1', titre: 'A', minutesEstimees: 300, minutesRestantes: 300 }),
        tache({ id: 't2', titre: 'B', minutesEstimees: 240, minutesRestantes: 240, echeance: '2026-09-23' }),
      ],
    })
    const parJour = new Map<string, typeof r.blocks>()
    for (const b of r.blocks) parJour.set(b.date, [...(parJour.get(b.date) ?? []), b])

    for (const [date, blocs] of parJour) {
      const tries = [...blocs].sort((a, b) => a.startMinute - b.startMinute)
      for (let i = 1; i < tries.length; i++) {
        expect(
          tries[i]!.startMinute,
          `${date} : ${tries[i]!.label} commence avant la fin de ${tries[i - 1]!.label}`,
        ).toBeGreaterThanOrEqual(tries[i - 1]!.endMinute)
      }
    }
  })

  it('la pause est incluse dans l’empreinte du bloc', () => {
    const r = appeler({ taches: [tache({ minutesEstimees: 240, minutesRestantes: 240 })] })
    for (const b of r.blocks) {
      expect(b.workMinutes + b.breakMinutes).toBe(b.durationMinutes)
      expect(b.durationMinutes).toBe(b.endMinute - b.startMinute)
    }
  })

  it('ne pose jamais ce qu’il n’a pas prévu de poser', () => {
    // Le moteur signale lui-meme tout ecart entre prevu et pose. Un ecart est
    // un bug interne, jamais quelque chose que l'on absorbe en silence.
    const r = appeler({ taches: [tache({ minutesEstimees: 400, minutesRestantes: 400 })] })
    expect(r.internalError).toBeUndefined()
  })
})
