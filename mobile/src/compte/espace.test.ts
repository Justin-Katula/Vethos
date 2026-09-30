import { beforeEach, describe, expect, it, vi } from 'vitest'

const disque = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => disque.get(k) ?? null,
    setItem: async (k: string, v: string) => void disque.set(k, v),
    removeItem: async (k: string) => void disque.delete(k),
  },
}))

vi.mock('./nuage', () => ({ noterEcriture: async () => undefined }))

import { cleCompte, definirCompte, reclamer } from './espace'

beforeEach(() => {
  disque.clear()
  definirCompte(null)
})

describe('Un tiroir par compte', () => {
  it('deux comptes, deux clés', () => {
    expect(cleCompte('vethos:donnees:v1', 'a')).not.toBe(cleCompte('vethos:donnees:v1', 'b'))
    expect(cleCompte('vethos:donnees:v1', null)).toBe('vethos:donnees:v1')
  })

  it('le premier compte reprend ce que l’introduction a rangé, et le tiroir commun se vide', async () => {
    disque.set('vethos:donnees:v1', '{"intro":"Léa"}')
    await reclamer('lea')
    expect(disque.get('vethos:donnees:v1:u:lea')).toBe('{"intro":"Léa"}')
    expect(disque.has('vethos:donnees:v1')).toBe(false)
  })

  it('un second compte ne récupère rien du premier', async () => {
    disque.set('vethos:donnees:v1', '{"intro":"Léa"}')
    await reclamer('lea')
    await reclamer('tom')
    expect(disque.has('vethos:donnees:v1:u:tom')).toBe(false)
  })

  it('un compte qui a déjà son tiroir ne se fait pas écraser par le tiroir commun', async () => {
    disque.set('vethos:donnees:v1:u:lea', '{"a":"sien"}')
    disque.set('vethos:donnees:v1', '{"a":"commun"}')
    await reclamer('lea')
    expect(disque.get('vethos:donnees:v1:u:lea')).toBe('{"a":"sien"}')
  })
})
