import { describe, it, expect, vi } from 'vitest'
import { creerPontDepuis, type ModuleEcran } from './pont-natif'
import type { Plage } from './contrat'

/**
 * Le seul chemin de Vethos qui touche vraiment au système — et, jusqu'ici, le
 * seul que rien ne vérifiait.
 *
 * On ne peut pas installer sur un iPhone depuis ici : il faut un compte Apple,
 * une compilation signée, et l'entitlement Family Controls qu'Apple accorde sur
 * formulaire. Mais on peut vérifier **exactement ce que Vethos demande au
 * système**, et c'est là que vivent les erreurs qui comptent.
 *
 * Ce fichier a déjà trouvé deux défauts qui ne se voyaient sur aucun écran :
 * `startMonitoring` seul ne bloque rien, et `intervalDidStart` ne se déclenche
 * jamais pour une fenêtre déjà commencée. Les deux se seraient manifestés de la
 * même façon — une application de blocage qui ne bloque pas, sans une erreur à
 * montrer pour l'expliquer.
 */

function moduleEspion(disponible = true) {
  const appels: string[] = []
  const natif = {
    isAvailable: vi.fn(() => disponible),
    getAuthorizationStatus: vi.fn(() => 'approved'),
    requestAuthorization: vi.fn(async () => undefined),
    configureActions: vi.fn((a: { activityName: string; callbackName: string; actions: unknown[] }) => {
      const type = (a.actions[0] as { type?: string } | undefined)?.type ?? '?'
      appels.push(`configureActions:${a.callbackName}:${type}`)
    }),
    startMonitoring: vi.fn(async (nom: string) => {
      appels.push(`startMonitoring:${nom}`)
    }),
    stopMonitoring: vi.fn(() => {
      appels.push('stopMonitoring')
    }),
    blockSelection: vi.fn((sel: { activitySelectionId?: string }) => {
      appels.push(`blockSelection:${sel.activitySelectionId}`)
    }),
    resetBlocks: vi.fn(() => {
      appels.push('resetBlocks')
    }),
    getActivities: vi.fn(() => ['vethos.a']),
    cleanUpAfterActivity: vi.fn((n: string) => {
      appels.push(`cleanUp:${n}`)
    }),
  } as unknown as ModuleEcran & { [k: string]: ReturnType<typeof vi.fn> }

  return { natif, appels }
}

const plage = (p: Partial<Plage> = {}): Plage => ({
  blocId: p.blocId ?? 'b1',
  debutMinute: p.debutMinute ?? 9 * 60,
  finMinute: p.finMinute ?? 10 * 60,
  selectionId: p.selectionId ?? 'vethos.ecarte',
})

describe('le module absent', () => {
  it('refuse de se faire passer pour réel', () => {
    // C'est ce refus qui fait basculer sur le simulateur, et qui fait dire à
    // l'écran « Simulé sur cet appareil ». Sans lui, Expo Go promettait un
    // masquage qui n'arriverait jamais.
    expect(() => creerPontDepuis(moduleEspion(false).natif)).toThrow()
  })
})

describe('programmer une plage', () => {
  it('lie les deux actions AVANT de lancer la surveillance', async () => {
    // `startMonitoring` ne bloque RIEN : il demande seulement à iOS de
    // réveiller l'extension aux bornes. Ce sont les actions qui lèvent et
    // baissent le bouclier. Lancer la surveillance d'abord laisserait une
    // fenêtre où l'extension pourrait se réveiller sans savoir quoi faire.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], 8 * 60)

    expect(appels).toEqual([
      'stopMonitoring',
      'configureActions:intervalDidStart:blockSelection',
      'configureActions:intervalDidEnd:resetBlocks',
      'startMonitoring:vethos.b1',
      'resetBlocks',
    ])
  })

  it('lève le bouclier TOUT DE SUITE pour une fenêtre déjà commencée', async () => {
    // Une séance qu'on vient de confirmer a déjà franchi sa borne de départ :
    // `intervalDidStart` ne viendra jamais. Sans ce geste-ci, le bouclier de
    // la séance en cours — le seul qui compte, c'est maintenant qu'on
    // travaille — ne se serait jamais levé.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], 9 * 60 + 15)

    expect(appels.at(-1)).toBe('blockSelection:vethos.ecarte')
  })

  it('baisse ce qui traînait quand aucune séance n’est en cours', async () => {
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], 11 * 60)
    expect(appels.at(-1)).toBe('resetBlocks')
  })

  it('repart de zéro à chaque fois', async () => {
    // Réconcilier des surveillances existantes avec un plan recalculé coûte
    // plus cher que de tout reposer, et laisse des boucliers orphelins au
    // moindre écart.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage(), plage({ blocId: 'b2', debutMinute: 660, finMinute: 720 })], 8 * 60)
    expect(appels.filter((a) => a === 'stopMonitoring')).toHaveLength(1)
    expect(appels.filter((a) => a.startsWith('startMonitoring'))).toHaveLength(2)
  })

  it('préfixe chaque activité, pour ne jamais arrêter celles des autres', async () => {
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage({ blocId: 'obj-o1-2026-09-21-540' })], 8 * 60)
    expect(appels).toContain('startMonitoring:vethos.obj-o1-2026-09-21-540')
  })

  it('utilise l’identifiant de sélection de la plage, jamais un autre', async () => {
    const { natif } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage({ selectionId: 'autre' })], 9 * 60 + 5)
    expect(natif.blockSelection).toHaveBeenCalledWith(
      { activitySelectionId: 'autre' },
      expect.stringContaining('vethos:seance:'),
    )
  })
})

describe('tout lever', () => {
  it('arrête la surveillance, nettoie, et baisse les boucliers déjà levés', async () => {
    // `stopMonitoring` seul laisserait l'utilisateur derrière un écran que
    // plus rien ne viendrait retirer.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).toutLever()

    expect(appels).toEqual(['stopMonitoring', 'cleanUp:vethos.a', 'resetBlocks'])
  })
})

describe('l’autorisation', () => {
  it('traduit ce qu’Apple répond, sans l’interpréter', async () => {
    const { natif } = moduleEspion()
    const pont = creerPontDepuis(natif)
    expect(await pont.lireAutorisation()).toBe('accordee')

    const refus = moduleEspion()
    ;(refus.natif.getAuthorizationStatus as unknown as ReturnType<typeof vi.fn>).mockReturnValue('denied')
    expect(await creerPontDepuis(refus.natif).lireAutorisation()).toBe('refusee')
  })

  it('relit le statut APRÈS la demande, au lieu de supposer un oui', async () => {
    // La feuille système peut se refermer sans réponse. Supposer l'accord
    // ferait afficher « ACCORDÉE » sur un refus, et le masquage ne viendrait
    // jamais expliquer pourquoi.
    const { natif } = moduleEspion()
    await creerPontDepuis(natif).demanderAutorisation()
    expect(natif.getAuthorizationStatus).toHaveBeenCalled()
  })
})
