import { describe, it, expect, vi } from 'vitest'
import { creerPontDepuis, type ModuleEcran } from './pont-natif'
import type { Plage } from './contrat'
import { habillageBouclier } from './bouclier'

/**
 * Le seul chemin de Vethos qui touche vraiment au système — et, jusqu'ici, le
 * seul que rien ne vérifiait.
 *
 * On ne peut pas installer sur un iPhone depuis ici : il faut un compte Apple,
 * une compilation signée, et l'entitlement Family Controls qu'Apple accorde sur
 * formulaire. Mais on peut vérifier **exactement ce que Vethos demande au
 * système**, et c'est là que vivent les erreurs qui comptent.
 *
 * Ce fichier a déjà trouvé trois défauts qui ne se voyaient sur aucun écran :
 * `startMonitoring` seul ne bloque rien, `intervalDidStart` ne se déclenche
 * jamais pour une fenêtre déjà commencée, et `resetBlocks` ne défait pas le
 * mode profond. Les trois se seraient manifestés de la même façon — une
 * application de blocage qui ne bloque pas (ou qui ne débloque plus), sans une
 * erreur à montrer pour l'expliquer.
 */

function moduleEspion(disponible = true) {
  const appels: string[] = []
  const natif = {
    isAvailable: vi.fn(() => disponible),
    getAuthorizationStatus: vi.fn(() => 'approved'),
    requestAuthorization: vi.fn(async () => undefined),
    configureActions: vi.fn((a: { activityName: string; callbackName: string; actions: unknown[] }) => {
      const types = a.actions.map((x) => (x as { type?: string }).type ?? '?').join('+')
      appels.push(`configureActions:${a.callbackName}:${types}`)
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
    updateShield: vi.fn(() => {
      appels.push('updateShield')
    }),
    isShieldActive: vi.fn(() => true),
    enableBlockAllMode: vi.fn(() => {
      appels.push('enableBlockAllMode')
    }),
    disableBlockAllMode: vi.fn(() => {
      appels.push('disableBlockAllMode')
    }),
    addSelectionToWhitelistAndUpdateBlock: vi.fn((sel: { activitySelectionId?: string }) => {
      appels.push(`garder:${sel.activitySelectionId}`)
    }),
    clearWhitelistAndUpdateBlock: vi.fn(() => {
      appels.push('viderGardee')
    }),
    setWebContentFilterPolicy: vi.fn((p: { type?: string }) => {
      appels.push(`filtreWeb:${p.type}`)
    }),
    clearWebContentFilterPolicy: vi.fn(() => {
      appels.push('filtreWeb:off')
    }),
    isWebContentFilterPolicyActive: vi.fn(() => false),
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
    await creerPontDepuis(natif).programmer([plage()], { maintenant: 8 * 60 })

    expect(appels).toEqual([
      'stopMonitoring',
      'viderGardee',
      'configureActions:intervalDidStart:blockSelection',
      'configureActions:intervalDidEnd:resetBlocks',
      'startMonitoring:vethos.b1',
      'disableBlockAllMode',
      'filtreWeb:off',
      'resetBlocks',
    ])
  })

  it('lève le bouclier TOUT DE SUITE pour une fenêtre déjà commencée', async () => {
    // Une séance qu'on vient de confirmer a déjà franchi sa borne de départ :
    // `intervalDidStart` ne viendra jamais. Sans ce geste-ci, le bouclier de
    // la séance en cours — le seul qui compte, c'est maintenant qu'on
    // travaille — ne se serait jamais levé.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], { maintenant: 9 * 60 + 15 })

    expect(appels.at(-1)).toBe('blockSelection:vethos.ecarte')
  })

  it('baisse ce qui traînait quand aucune séance n’est en cours', async () => {
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], { maintenant: 11 * 60 })
    expect(appels.at(-1)).toBe('resetBlocks')
  })

  it('repart de zéro à chaque fois', async () => {
    // Réconcilier des surveillances existantes avec un plan recalculé coûte
    // plus cher que de tout reposer, et laisse des boucliers orphelins au
    // moindre écart.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer(
      [plage(), plage({ blocId: 'b2', debutMinute: 660, finMinute: 720 })],
      { maintenant: 8 * 60 },
    )
    expect(appels.filter((a) => a === 'stopMonitoring')).toHaveLength(1)
    expect(appels.filter((a) => a.startsWith('startMonitoring'))).toHaveLength(2)
  })

  it('préfixe chaque activité, pour ne jamais arrêter celles des autres', async () => {
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage({ blocId: 'obj-o1-2026-09-21-540' })], {
      maintenant: 8 * 60,
    })
    expect(appels).toContain('startMonitoring:vethos.obj-o1-2026-09-21-540')
  })

  it('utilise l’identifiant de sélection de la plage, jamais un autre', async () => {
    const { natif } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage({ selectionId: 'autre' })], {
      maintenant: 9 * 60 + 5,
    })
    expect(natif.blockSelection).toHaveBeenCalledWith(
      { activitySelectionId: 'autre' },
      expect.stringContaining('vethos:seance:'),
    )
  })
})

describe('le mode profond', () => {
  it('écarte tout au lieu d’une sélection, aux deux bornes comme tout de suite', async () => {
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], {
      mode: 'profond',
      maintenant: 9 * 60 + 15,
    })

    expect(appels).toContain('configureActions:intervalDidStart:enableBlockAllMode')
    expect(appels.at(-1)).toBe('enableBlockAllMode')
    expect(appels.some((a) => a.startsWith('blockSelection'))).toBe(false)
  })

  it('pose la liste gardée AVANT la première surveillance', async () => {
    // `enableBlockAllMode` lit la liste telle qu'il la trouve. Posée après, la
    // première fenêtre à s'ouvrir écarterait tout sans exception — y compris
    // ce que l'utilisateur s'était gardé.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], {
      mode: 'profond',
      gardeeId: 'vethos.garde',
      maintenant: 8 * 60,
    })

    expect(appels.indexOf('garder:vethos.garde')).toBeLessThan(
      appels.findIndex((a) => a.startsWith('startMonitoring')),
    )
  })

  it('se défait tout seul à la fin de la séance', async () => {
    // Le piège : `resetBlocks` NE défait PAS le mode profond, qui vit dans son
    // propre drapeau. Sans `disableBlockAllMode` sur la borne de fin, une
    // séance profonde ne se terminait jamais — et comme Vethos peut être
    // derrière son propre bouclier, plus rien ne pouvait la lever.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], { mode: 'profond', maintenant: 8 * 60 })

    expect(appels).toContain('configureActions:intervalDidEnd:disableBlockAllMode+resetBlocks')
  })

  it('oublie la liste gardée quand on revient au mode normal', async () => {
    // Une liste laissée derrière soi creuserait un trou silencieux dans le
    // mode normal : `updateBlock` retire du blocage tout ce qu'elle contient.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], { maintenant: 8 * 60 })

    expect(appels).toContain('viderGardee')
    expect(appels.some((a) => a.startsWith('garder:'))).toBe(false)
  })
})

describe('le filtre web', () => {
  it('ne s’allume que si on le demande', async () => {
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], { maintenant: 9 * 60 + 5 })
    expect(appels.some((a) => a === 'filtreWeb:auto')).toBe(false)
  })

  it('accompagne la séance, et s’éteint avec elle', async () => {
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).programmer([plage()], {
      filtrerLeWeb: true,
      maintenant: 9 * 60 + 5,
    })

    expect(appels).toContain('configureActions:intervalDidStart:blockSelection+setWebContentFilterPolicy')
    expect(appels).toContain('configureActions:intervalDidEnd:clearWebContentFilterPolicy+resetBlocks')
    expect(appels.at(-1)).toBe('filtreWeb:auto')
  })
})

describe('le bouclier', () => {
  it('dépose l’habillage tel quel, sans le réinterpréter', async () => {
    const { natif } = moduleEspion()
    const habillage = habillageBouclier({ theme: 'sombre', titreBloc: 'Chemistry', finMinute: 930 })
    creerPontDepuis(natif).habillerBouclier(habillage)

    expect(natif.updateShield).toHaveBeenCalledWith(
      habillage.configuration,
      habillage.actions,
      expect.any(String),
    )
  })

  it('rend ce qu’iOS répond, et pas ce que Vethos a demandé', async () => {
    // Toute la différence entre « programmé » et « bloque vraiment ». Les deux
    // ont déjà divergé en silence : dans Expo Go, chaque appel réussissait et
    // aucun bouclier ne se levait.
    const { natif } = moduleEspion()
    expect(creerPontDepuis(natif).bouclierActif()).toBe(true)

    const eteint = moduleEspion()
    ;(eteint.natif.isShieldActive as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    expect(creerPontDepuis(eteint.natif).bouclierActif()).toBe(false)
  })
})

describe('tout lever', () => {
  it('arrête la surveillance, nettoie, et baisse les TROIS verrous', async () => {
    // Trois verrous distincts, et lever le premier ne lève pas les autres.
    // « Tout lever » qui laisse le mode profond debout serait le pire mensonge
    // de cet écran : le bouton le plus rassurant, et celui qui ne fait rien là
    // où on en a le plus besoin.
    const { natif, appels } = moduleEspion()
    await creerPontDepuis(natif).toutLever()

    expect(appels).toEqual([
      'stopMonitoring',
      'cleanUp:vethos.a',
      'disableBlockAllMode',
      'viderGardee',
      'filtreWeb:off',
      'resetBlocks',
    ])
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
