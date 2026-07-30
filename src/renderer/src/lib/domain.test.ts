import { describe, it, expect } from 'vitest'
import { normaliserDomaine } from './domain'

describe('normaliserDomaine', () => {
  it('accepte un domaine simple', () => {
    expect(normaliserDomaine('youtube.com')).toBe('youtube.com')
  })

  it('retire le schéma et le www', () => {
    expect(normaliserDomaine('https://www.youtube.com')).toBe('youtube.com')
    expect(normaliserDomaine('http://youtube.com')).toBe('youtube.com')
  })

  it('retire le chemin et tout ce qui suit', () => {
    expect(normaliserDomaine('https://www.youtube.com/feed/subscriptions')).toBe('youtube.com')
  })

  it('met en minuscules et ignore les espaces autour', () => {
    expect(normaliserDomaine('  YouTube.COM  ')).toBe('youtube.com')
  })

  it('garde les sous-domaines — les bloquer précisément doit rester possible', () => {
    expect(normaliserDomaine('m.youtube.com')).toBe('m.youtube.com')
    expect(normaliserDomaine('news.ycombinator.com')).toBe('news.ycombinator.com')
  })

  it('accepte tirets et domaines à rallonge', () => {
    expect(normaliserDomaine('mon-site.co.uk')).toBe('mon-site.co.uk')
  })

  it('refuse une saisie vide', () => {
    expect(normaliserDomaine('')).toBeNull()
    expect(normaliserDomaine('   ')).toBeNull()
  })

  it("refuse un mot sans point — ça ne correspondrait jamais à rien", () => {
    expect(normaliserDomaine('youtube')).toBeNull()
    expect(normaliserDomaine('localhost')).toBeNull()
  })

  it('refuse les caractères exotiques', () => {
    expect(normaliserDomaine('you tube.com')).toBeNull()
    expect(normaliserDomaine('youtube..com')).toBeNull()
    expect(normaliserDomaine('@youtube.com')).toBeNull()
  })

  it('refuse une adresse réduite à son schéma', () => {
    expect(normaliserDomaine('https://')).toBeNull()
  })
})
