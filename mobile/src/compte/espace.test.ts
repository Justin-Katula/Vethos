import { beforeEach, describe, expect, it, vi } from 'vitest'

const disque = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => disque.get(k) ?? null,
    setItem: async (k: string, v: string) => void disque.set(k, v),
    removeItem: async (k: string) => void disque.delete(k),
  },
}))

const envois: string[] = []
vi.mock('./nuage', () => ({ noterEcriture: async (compte: string) => void envois.push(compte) }))

import { cleCompte, definirCompte, ecrireTiroir, oublierTiroirCommun } from './espace'

beforeEach(() => {
  disque.clear()
  envois.length = 0
  definirCompte(null)
})

describe('Un tiroir par compte', () => {
  it('deux comptes, deux clés', () => {
    expect(cleCompte('vethos:donnees:v1', 'a')).not.toBe(cleCompte('vethos:donnees:v1', 'b'))
  })

  it('une écriture va dans le tiroir de son propriétaire, et part en ligne', async () => {
    await ecrireTiroir('vethos:donnees:v1', 'lea', '{"a":1}')
    expect(disque.get('vethos:donnees:v1:u:lea')).toBe('{"a":1}')
    expect(envois).toEqual(['lea'])
  })

  it('sans compte, rien ne s’écrit : le prochain compte n’hérite de rien', async () => {
    await ecrireTiroir('vethos:donnees:v1', null, '{"intro":"Léa"}')
    await ecrireTiroir('vethos:seances:v1', null, '{}')
    expect(disque.size).toBe(0)
    expect(envois).toEqual([])
  })

  it('l’ancien tiroir commun est effacé, les tiroirs des comptes restent', async () => {
    disque.set('vethos:donnees:v1', '{"intro":"Léa"}')
    disque.set('vethos:seances:v1', '{}')
    disque.set('vethos:donnees:v1:u:tom', '{"a":"sien"}')
    await oublierTiroirCommun()
    expect([...disque.keys()]).toEqual(['vethos:donnees:v1:u:tom'])
  })
})
