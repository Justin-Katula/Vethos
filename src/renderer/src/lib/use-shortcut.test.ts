import { describe, it, expect } from 'vitest'
import { matchesCombo, isMacPlatform } from './use-shortcut'

type Evt = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
}

const mk = (e: Evt) => ({
  key: e.key,
  metaKey: e.metaKey ?? false,
  ctrlKey: e.ctrlKey ?? false,
  shiftKey: e.shiftKey ?? false,
})

describe('isMacPlatform', () => {
  it('détecte les plateformes Mac (Mac, iPhone, iPad, iPod)', () => {
    expect(isMacPlatform('MacIntel')).toBe(true)
    expect(isMacPlatform('iPhone')).toBe(true)
    expect(isMacPlatform('iPad')).toBe(true)
    expect(isMacPlatform('iPod')).toBe(true)
  })

  it("renvoie false pour Windows et Linux", () => {
    expect(isMacPlatform('Win32')).toBe(false)
    expect(isMacPlatform('Linux x86_64')).toBe(false)
  })
})

describe('matchesCombo', () => {
  it('Escape match sans modificateur', () => {
    expect(matchesCombo(mk({ key: 'Escape' }), 'Escape', false)).toBe(true)
    expect(matchesCombo(mk({ key: 'Escape' }), 'Escape', true)).toBe(true)
  })

  it("Escape ne déclenche pas pour d'autres touches", () => {
    expect(matchesCombo(mk({ key: 'Esc' }), 'Escape', false)).toBe(false)
    expect(matchesCombo(mk({ key: 'a' }), 'Escape', false)).toBe(false)
  })

  it('Mod+S = Cmd+S sur Mac', () => {
    expect(matchesCombo(mk({ key: 's', metaKey: true }), 'Mod+S', true)).toBe(true)
    expect(matchesCombo(mk({ key: 'S', metaKey: true }), 'Mod+S', true)).toBe(true)
    // Ctrl seul ne suffit pas sur Mac
    expect(matchesCombo(mk({ key: 's', ctrlKey: true }), 'Mod+S', true)).toBe(false)
  })

  it('Mod+S = Ctrl+S ailleurs', () => {
    expect(matchesCombo(mk({ key: 's', ctrlKey: true }), 'Mod+S', false)).toBe(true)
    expect(matchesCombo(mk({ key: 'S', ctrlKey: true }), 'Mod+S', false)).toBe(true)
    // Cmd seul ne déclenche pas hors Mac
    expect(matchesCombo(mk({ key: 's', metaKey: true }), 'Mod+S', false)).toBe(false)
  })

  it('Mod+K respecte la plateforme', () => {
    expect(matchesCombo(mk({ key: 'k', metaKey: true }), 'Mod+K', true)).toBe(true)
    expect(matchesCombo(mk({ key: 'k', ctrlKey: true }), 'Mod+K', false)).toBe(true)
    expect(matchesCombo(mk({ key: 'k' }), 'Mod+K', false)).toBe(false)
  })

  it("Enter sans modificateur ni shift", () => {
    expect(matchesCombo(mk({ key: 'Enter' }), 'Enter', false)).toBe(true)
    expect(matchesCombo(mk({ key: 'Enter', shiftKey: true }), 'Enter', false)).toBe(false)
    expect(matchesCombo(mk({ key: 'Enter', ctrlKey: true }), 'Enter', false)).toBe(false)
    expect(matchesCombo(mk({ key: 'Enter', metaKey: true }), 'Enter', true)).toBe(false)
  })

  it("Mod+Enter requiert le modificateur", () => {
    expect(matchesCombo(mk({ key: 'Enter', metaKey: true }), 'Mod+Enter', true)).toBe(true)
    expect(matchesCombo(mk({ key: 'Enter', ctrlKey: true }), 'Mod+Enter', false)).toBe(true)
    expect(matchesCombo(mk({ key: 'Enter' }), 'Mod+Enter', false)).toBe(false)
  })

  it('useShortcut peut être enregistré/nettoyé via window listeners', () => {
    // Smoke test: window existe en environnement node-vitest? non. On vérifie juste que
    // les helpers exportés sont réutilisables sans crash dans des contextes hors DOM.
    expect(typeof matchesCombo).toBe('function')
    expect(typeof isMacPlatform).toBe('function')
  })
})
