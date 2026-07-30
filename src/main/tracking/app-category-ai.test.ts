import { describe, it, expect } from 'vitest'
import {
  decouperEnLots,
  parseAiResponse,
  resteAJuger,
  type AiCache,
  type AppAClasser,
} from './app-category-ai'

function app(exeName: string, name = exeName): AppAClasser {
  return { exeName, name }
}

describe('decouperEnLots', () => {
  it('découpe en lots de la taille demandée', () => {
    expect(decouperEnLots([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('rend un seul lot quand tout tient', () => {
    expect(decouperEnLots([1, 2], 10)).toEqual([[1, 2]])
  })

  it('rend une liste vide sans élément', () => {
    expect(decouperEnLots([], 10)).toEqual([])
  })

  it('ne boucle pas indéfiniment sur une taille nulle ou négative', () => {
    expect(decouperEnLots([1, 2], 0)).toEqual([[1, 2]])
    expect(decouperEnLots([1, 2], -3)).toEqual([[1, 2]])
  })
})

describe('resteAJuger', () => {
  it('écarte ce qui est déjà en cache', () => {
    const cache: AiCache = { 'a.exe': { category: 'games', description: 'x' } }
    expect(resteAJuger([app('a.exe'), app('b.exe')], cache).map((a) => a.exeName)).toEqual([
      'b.exe',
    ])
  })

  it('compare sans tenir compte de la casse', () => {
    const cache: AiCache = { 'a.exe': { category: 'games', description: 'x' } }
    expect(resteAJuger([app('A.EXE')], cache)).toEqual([])
  })

  it('rend tout quand le cache est vide', () => {
    expect(resteAJuger([app('a.exe')], {})).toHaveLength(1)
  })
})

describe('parseAiResponse', () => {
  const demandees = ['antigravity.exe', 'efootball.exe']

  it('retient les verdicts bien formés', () => {
    const brut = {
      resultats: [
        {
          exe: 'antigravity.exe',
          categorie: 'productivity',
          description: 'Éditeur de code assisté par IA.',
        },
      ],
    }
    expect(parseAiResponse(brut, demandees)).toEqual({
      'antigravity.exe': {
        category: 'productivity',
        description: 'Éditeur de code assisté par IA.',
      },
    })
  })

  it('normalise la casse de l’exécutable', () => {
    const brut = { resultats: [{ exe: 'AntiGravity.EXE', categorie: 'games', description: 'x' }] }
    expect(Object.keys(parseAiResponse(brut, demandees))).toEqual(['antigravity.exe'])
  })

  it('écarte une catégorie inconnue plutôt que de la corriger', () => {
    // Un classement invente vaut moins qu'un « Autres » honnete.
    const brut = { resultats: [{ exe: 'antigravity.exe', categorie: 'coding', description: 'x' }] }
    expect(parseAiResponse(brut, demandees)).toEqual({})
  })

  it('écarte une application qu’on n’a pas demandée', () => {
    // Defense contre une reponse qui inventerait des entrees.
    const brut = { resultats: [{ exe: 'malware.exe', categorie: 'games', description: 'x' }] }
    expect(parseAiResponse(brut, demandees)).toEqual({})
  })

  it('écarte une description vide', () => {
    const brut = { resultats: [{ exe: 'antigravity.exe', categorie: 'games', description: '  ' }] }
    expect(parseAiResponse(brut, demandees)).toEqual({})
  })

  it('tronque une description trop longue', () => {
    const brut = {
      resultats: [{ exe: 'antigravity.exe', categorie: 'games', description: 'a'.repeat(500) }],
    }
    expect(parseAiResponse(brut, demandees)['antigravity.exe']?.description).toHaveLength(200)
  })

  it('rend un cache vide sur réponse absente ou malformée', () => {
    expect(parseAiResponse(null, demandees)).toEqual({})
    expect(parseAiResponse({}, demandees)).toEqual({})
    expect(parseAiResponse({ resultats: 'pas un tableau' }, demandees)).toEqual({})
    expect(parseAiResponse({ resultats: [null, 42, 'x'] }, demandees)).toEqual({})
  })

  it('garde les lignes valides même si d’autres sont mauvaises', () => {
    const brut = {
      resultats: [
        { exe: 'inconnue.exe', categorie: 'games', description: 'x' },
        { exe: 'efootball.exe', categorie: 'games', description: 'Jeu de football.' },
      ],
    }
    expect(Object.keys(parseAiResponse(brut, demandees))).toEqual(['efootball.exe'])
  })
})
