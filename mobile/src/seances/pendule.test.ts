import { describe, it, expect } from 'vitest'
import { LearningStateSchema, SessionConfirmationsStateSchema } from '@shared/schemas'
import type { PlacedBlock } from '@shared/planning/types'
import type { Tache } from '@/donnees/magasin'
import { confirmer, seanceActive, tictac, type EtatSeances } from './pendule'

/**
 * La pendule du téléphone.
 *
 * La LOI est testée ailleurs — `@shared/planning/clock`, avec le bureau. Ce
 * qui se vérifie ici, c'est le tic : l'ordre des appels, et le fait que ce qui
 * est mesuré finisse vraiment par terminer une tâche. Un tic dans le mauvais
 * ordre ne lève aucune erreur ; il mesure simplement zéro, pour toujours.
 */

const JOUR = '2026-09-21'
const a = (h: number, m = 0) => new Date(2026, 8, 21, h, m, 0)

const vide = (): EtatSeances => ({
  apprentissage: LearningStateSchema.parse({}),
  confirmations: SessionConfirmationsStateSchema.parse({ date: JOUR }),
})

const bloc = (p: Partial<PlacedBlock> = {}): PlacedBlock => ({
  id: p.id ?? 'b1',
  date: JOUR,
  startMinute: p.startMinute ?? 9 * 60,
  endMinute: p.endMinute ?? 10 * 60,
  durationMinutes: (p.endMinute ?? 10 * 60) - (p.startMinute ?? 9 * 60),
  breakMinutes: p.breakMinutes ?? 0,
  workMinutes: p.workMinutes ?? 60,
  kind: p.kind ?? 'task',
  refId: p.refId ?? 't1',
  label: p.label ?? 'Dossier',
  color: '#c1121f',
  cognitiveWindow: 'NORMALE',
  ...p,
})

const tache = (p: Partial<Tache> = {}): Tache => ({
  id: p.id ?? 't1',
  titre: p.titre ?? 'Dossier',
  intention: 'Rédiger',
  echeance: '2026-09-25',
  importance: 5,
  minutesEstimees: p.minutesEstimees ?? 60,
  minutesRestantes: p.minutesRestantes ?? 60,
  facteurCorrection: 1.4,
  minutesSupplementaires: p.minutesSupplementaires ?? 0,
  parentId: p.parentId ?? null,
  rangPartie: p.rangPartie ?? null,
  nature: 'routine',
  terminee: p.terminee ?? false,
  creeeLe: '2026-09-20T10:00:00.000Z',
})

const tic = (p: {
  maintenant: Date
  blocs?: PlacedBlock[]
  taches?: Tache[]
  etat?: EtatSeances
}) =>
  tictac({
    maintenant: p.maintenant,
    aujourdHui: JOUR,
    blocsDuJour: p.blocs ?? [],
    taches: p.taches ?? [],
    etat: p.etat ?? vide(),
  })

describe('le bloc qui attend son « Je commence »', () => {
  it('signale le bloc dont la fenêtre vient de s’ouvrir', () => {
    const r = tic({ maintenant: a(9, 5), blocs: [bloc()] })
    expect(r.enAttente?.id).toBe('b1')
  })

  it('ne signale rien avant l’heure', () => {
    expect(tic({ maintenant: a(8, 30), blocs: [bloc()] }).enAttente).toBeNull()
  })

  it('se tait dès que le bloc est confirmé', () => {
    const apres = confirmer({ maintenant: a(9, 5), bloc: bloc(), etat: vide() })
    const r = tic({ maintenant: a(9, 10), blocs: [bloc()], etat: apres })
    expect(r.enAttente).toBeNull()
  })
})

describe('D.7 — le retard se mesure, il ne se suppose pas', () => {
  it('compte le retard à la confirmation, et pas une minute avant', () => {
    const r = confirmer({ maintenant: a(9, 17), bloc: bloc(), etat: vide() })
    expect(r.retardMinutes).toBe(17)
    expect(r.apprentissage.dailyDelayMinutes[JOUR]).toBe(17)
  })

  it('ne compte aucun retard quand on démarre à l’heure', () => {
    expect(confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() }).retardMinutes).toBe(0)
  })

  it('refuse une seconde confirmation du même bloc', () => {
    // 71 confirmations pour un meme objectif, une par minute, mesurees le
    // 2026-08-23. Un bloc qui redemarre chaque minute n'aboutit jamais.
    const une = confirmer({ maintenant: a(9, 5), bloc: bloc(), etat: vide() })
    const deux = confirmer({ maintenant: a(9, 6), bloc: bloc(), etat: une })
    expect(deux.refuse).toBeDefined()
  })

  it('crédite tout le retard d’un bloc jamais confirmé', () => {
    // La fenêtre s'est fermée sans que rien ne démarre : toute sa durée est du
    // retard. On passe d'abord DANS le bloc pour que la pendule le retienne,
    // puis après — elle ne peut créditer que ce qu'elle a vu.
    const dedans = tic({ maintenant: a(9, 30), blocs: [bloc()] })
    const apres = tic({
      maintenant: a(10, 5),
      blocs: [bloc()],
      etat: { apprentissage: dedans.apprentissage, confirmations: dedans.confirmations },
    })
    expect(apres.apprentissage.dailyDelayMinutes[JOUR]).toBe(60)
  })

  it('fait avancer le compteur de ratés d’une ancre jamais confirmée', () => {
    const ancre = bloc({ kind: 'ancre', refId: 'a1', label: 'Course' })
    const dedans = tic({ maintenant: a(9, 30), blocs: [ancre] })
    const apres = tic({
      maintenant: a(10, 5),
      blocs: [ancre],
      etat: { apprentissage: dedans.apprentissage, confirmations: dedans.confirmations },
    })
    expect(apres.apprentissage.anchorMissCounts['a1']).toBe(1)
  })

  it('remet le compteur à zéro dès qu’on démarre, même en retard', () => {
    // D.7 : une confirmation tardive n'est PAS une ratée. Elle a bien démarré.
    const rate = { ...vide() }
    rate.apprentissage = { ...rate.apprentissage, consecutiveDelays: { t1: 2 } }
    const r = confirmer({ maintenant: a(9, 40), bloc: bloc(), etat: rate })
    expect(r.apprentissage.consecutiveDelays['t1']).toBe(0)
  })
})

describe('B.5.2 — le travail fait, minute par minute', () => {
  it('crédite la séance en cours sans attendre la fin de sa fenêtre', () => {
    // Sinon le travail restant resterait figé jusqu'à la fin du bloc — et le
    // compteur ne « démarrerait » jamais vraiment.
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() })
    const r = tic({ maintenant: a(9, 25), blocs: [bloc()], etat: ouverte })
    expect(r.apprentissage.workedMinutesByRef['t1']).toBe(25)
  })

  it('compte depuis la confirmation, jamais depuis l’heure prévue', () => {
    // Le chronomètre démarre à « Je commence » (B.2.1). L'écart d'avant est du
    // retard, pas du travail — le compter doublerait la mesure.
    const tardive = confirmer({ maintenant: a(9, 20), bloc: bloc(), etat: vide() })
    const r = tic({ maintenant: a(9, 40), blocs: [bloc()], etat: tardive })
    expect(r.apprentissage.workedMinutesByRef['t1']).toBe(20)
  })

  it('ne crédite jamais deux fois la même minute', () => {
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() })
    let etat: EtatSeances = ouverte
    for (const m of [10, 20, 20, 30, 25]) {
      const r = tic({ maintenant: a(9, m), blocs: [bloc()], etat })
      etat = { apprentissage: r.apprentissage, confirmations: r.confirmations }
    }
    expect(etat.apprentissage.workedMinutesByRef['t1']).toBe(30)
  })

  it('ne crédite aucun travail à une ancre', () => {
    // Une ancre est un rendez-vous avec soi. Elle n'avance aucune tâche.
    const ancre = bloc({ kind: 'ancre', refId: 'a1' })
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: ancre, etat: vide() })
    const r = tic({ maintenant: a(9, 30), blocs: [ancre], etat: ouverte })
    expect(r.apprentissage.workedMinutesByRef['a1']).toBeUndefined()
  })
})

describe('la complétion que personne ne déclare', () => {
  it('termine la tâche quand le temps planifié a été fait', () => {
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() })
    const r = tic({
      maintenant: a(10, 0),
      blocs: [bloc()],
      taches: [tache({ minutesRestantes: 60 })],
      etat: ouverte,
    })
    expect(r.terminees).toEqual(['t1'])
  })

  it('ne la termine pas tant qu’il manque une minute', () => {
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() })
    const r = tic({
      maintenant: a(9, 59),
      blocs: [bloc()],
      taches: [tache({ minutesRestantes: 60 })],
      etat: ouverte,
    })
    expect(r.terminees).toEqual([])
  })

  it('repousse la ligne d’arrivée quand du temps a été accordé', () => {
    // B.5.2 : « +25 min » ajoute des minutes reelles. La tache ne peut pas se
    // terminer sur l'ancienne cible, sinon le geste n'aurait servi a rien.
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() })
    const r = tic({
      maintenant: a(10, 0),
      blocs: [bloc()],
      taches: [tache({ minutesRestantes: 60, minutesSupplementaires: 25 })],
      etat: ouverte,
    })
    expect(r.terminees).toEqual([])
  })

  it('enregistre une observation sur le temps RÉELLEMENT mesuré', () => {
    // G.1 : c'est cette observation qui corrigera les estimations suivantes.
    // Sans elle, la boucle d'apprentissage tourne a vide pour toujours.
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() })
    const r = tic({
      maintenant: a(10, 0),
      blocs: [bloc()],
      taches: [tache({ minutesEstimees: 40, minutesRestantes: 60 })],
      etat: ouverte,
    })
    const obs = r.apprentissage.observations[0]
    expect(obs?.actualMinutes).toBe(60)
    // L'estime reste celui d'origine : sinon le facteur ne verrait jamais que
    // la tache a coute plus cher que prevu.
    expect(obs?.estimatedMinutes).toBe(40)
  })
})

describe('la séance en cours, vue par le moteur', () => {
  it('existe pendant sa fenêtre et pas après', () => {
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() })
    expect(seanceActive(ouverte.confirmations, JOUR, 9 * 60 + 30)?.refId).toBe('t1')
    expect(seanceActive(ouverte.confirmations, JOUR, 10 * 60 + 1)).toBeNull()
  })

  it('n’existe pas un autre jour', () => {
    // Le lendemain a ses propres obligations et n'hérite jamais de la veille.
    const ouverte = confirmer({ maintenant: a(9, 0), bloc: bloc(), etat: vide() })
    expect(seanceActive(ouverte.confirmations, '2026-09-22', 9 * 60 + 30)).toBeNull()
  })
})

describe('un tic qui ne mesure rien n’écrit rien', () => {
  it('ne signale aucun changement quand il ne se passe rien', () => {
    const calme = tic({ maintenant: a(3, 0) })
    expect(calme.change).toBe(false)
    expect(calme.terminees).toEqual([])
  })
})
