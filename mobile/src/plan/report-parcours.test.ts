import { describe, expect, it, vi } from 'vitest'
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }))
vi.mock('@/compte/nuage', () => ({ noterEcriture: async () => undefined }))
import { LearningStateSchema, SessionConfirmationsStateSchema } from '@shared/schemas'
import { noterReport, optionsPlusTard, pliesParReport } from '@shared/planning/report'
import { creerPromesse } from '@shared/planning/trust'
import { ReglagesSchema, TacheSchema } from '@/donnees/magasin'
import { tictac } from '@/seances/pendule'
import { cleDate, entreeEtPlan } from './moteur'

// Le parcours réel de « Later » : le bloc en attente disparaît d'aujourd'hui,
// la promesse se pose à l'heure choisie, et rien n'est compté comme raté.
describe('« Later », de bout en bout', () => {
  const maintenant = new Date(2026, 9, 15, 14, 2)
  const aujourdHui = cleDate(maintenant)
  const tache = TacheSchema.parse({
    id: 't1', titre: 'Portfolio site', intention: 'Finir la page', couleur: '#505359',
    creeeLe: '2026-10-10T10:00:00.000Z', echeance: '2026-10-25', importance: 5,
    minutesEstimees: 180, minutesRestantes: 180,
  })
  const reglages = ReglagesSchema.parse({ lever: '07:00', coucher: '23:00' })
  const base = { taches: [tache], objectifs: [], ancres: [], obligations: [], reglages }

  const etat = (apprentissage: ReturnType<typeof LearningStateSchema.parse>, confirmations: ReturnType<typeof SessionConfirmationsStateSchema.parse>, quand = maintenant) => {
    const { resultat } = entreeEtPlan({ ...base, apprentissage, maintenant: quand, plies: pliesParReport(apprentissage, cleDate(quand), ['t1']) })
    const blocs = resultat.blocks.filter((b) => b.date === cleDate(quand) && b.preview !== true)
    return { resultat, blocs, t: tictac({ maintenant: quand, aujourdHui: cleDate(quand), blocsDuJour: blocs, taches: base.taches, etat: { apprentissage, confirmations } }) }
  }

  it('l’écran se ferme, la séance passe à demain, et sa fenêtre n’est pas un raté', () => {
    let apprentissage = LearningStateSchema.parse({})
    let confirmations = SessionConfirmationsStateSchema.parse({ date: aujourdHui })
    // Le premier bloc de la journée commence maintenant.
    const premier = entreeEtPlan({ ...base, apprentissage, maintenant }).resultat.blocks.find((b) => b.date === aujourdHui && b.refId === 't1')!
    const a = etat(apprentissage, confirmations, new Date(2026, 9, 15, Math.floor(premier.startMinute / 60), premier.startMinute % 60 + 2))
    const bloc = a.t.enAttente!
    expect(bloc).toBeTruthy()
    confirmations = a.t.confirmations
    apprentissage = a.t.apprentissage

    const quand = new Date(2026, 9, 15, Math.floor(bloc.startMinute / 60), bloc.startMinute % 60 + 2)
    const options = optionsPlusTard({ plan: a.resultat, today: aujourdHui, nowMinute: bloc.startMinute + 2, bloc, deadline: tache.echeance })
    const demain = options.find((o) => o.date !== aujourdHui)!
    expect(demain).toBeTruthy()

    apprentissage = noterReport(
      creerPromesse(apprentissage, { id: `report-${bloc.id}`, kind: 'task', refId: 't1', label: bloc.label, fromBlockId: bloc.id, date: demain.date, startMinute: demain.startMinute, minutes: bloc.workMinutes, createdAt: quand.toISOString() }),
      { date: aujourdHui, kind: 'later', blockId: bloc.id, refId: 't1' },
    )
    confirmations = { ...confirmations, observedPending: null }

    const apres = etat(apprentissage, confirmations, quand)
    expect(apres.t.enAttente).toBeNull()
    expect(apres.blocs.some((b) => b.refId === 't1')).toBe(false)
    expect(apres.resultat.blocks.some((b) => b.id === `promesse-report-${bloc.id}` && b.date === demain.date)).toBe(true)

    // Bien après la fenêtre d'origine : aucun retard ni raté crédité aujourd'hui.
    const tard = etat(apres.t.apprentissage, apres.t.confirmations, new Date(2026, 9, 15, 22, 0))
    expect(tard.t.apprentissage.dailyDelayMinutes?.[aujourdHui] ?? 0).toBe(0)
  })
})
