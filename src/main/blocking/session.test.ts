import { describe, it, expect } from 'vitest'
import {
  classifyDetection,
  deriveAppState,
  isPreexisting,
  needsSaveWarning,
  type DetectedApp,
} from './session'
import type { Unlock } from './unlock'

// FILETIME plausibles : ~1,33e17. Au-dela de Number.MAX_SAFE_INTEGER (9,007e15),
// donc toute comparaison doit passer par BigInt.
const AVANT = '133700000000000000'
const DEBUT = '133700000000005000'
const APRES = '133700000000009000'

function makeApp(overrides: Partial<DetectedApp> = {}): DetectedApp {
  return {
    appId: 'blender.exe',
    hwnd: '1000',
    pid: 42,
    processCreatedAt: AVANT,
    preexisting: true,
    ...overrides,
  }
}

describe('isPreexisting', () => {
  it('est vrai quand le processus a démarré avant la session', () => {
    expect(isPreexisting(AVANT, DEBUT)).toBe(true)
  })

  it('est faux quand le processus a démarré après le début de la session', () => {
    expect(isPreexisting(APRES, DEBUT)).toBe(false)
  })

  it("est faux quand le processus démarre exactement au début — on ne l'a pas eu avant", () => {
    expect(isPreexisting(DEBUT, DEBUT)).toBe(false)
  })

  it('ne perd pas de précision sur des FILETIME 64 bits', () => {
    // Ces deux valeurs ne different que d'une unite. Converties en Number
    // elles seraient EGALES (au-dela de 2^53), et le verdict serait faux.
    const a = '133700000000000001'
    const b = '133700000000000002'
    expect(Number(a) === Number(b)).toBe(true) // le piege, demontre
    expect(isPreexisting(a, b)).toBe(true)
    expect(isPreexisting(b, a)).toBe(false)
  })

  it('traite un processCreatedAt inconnu ("0") comme non préexistant', () => {
    // "0" est ce que le sidecar emet quand OpenProcess echoue. On ne peut
    // rien affirmer, donc on ne promet pas d'avertissement de sauvegarde.
    expect(isPreexisting('0', DEBUT)).toBe(false)
  })

  it('traite une valeur illisible comme non préexistante', () => {
    expect(isPreexisting('', DEBUT)).toBe(false)
    expect(isPreexisting('pas-un-nombre', DEBUT)).toBe(false)
  })
})

describe('classifyDetection', () => {
  it('marque préexistante une application lancée avant la session', () => {
    const app = classifyDetection({
      appId: 'blender.exe',
      hwnd: '1000',
      pid: 42,
      processCreatedAt: AVANT,
      sessionStartedAtFileTime: DEBUT,
    })
    expect(app.preexisting).toBe(true)
    expect(app.appId).toBe('blender.exe')
  })

  it('marque nouvelle une application lancée pendant la session', () => {
    const app = classifyDetection({
      appId: 'chrome.exe',
      hwnd: '2000',
      pid: 43,
      processCreatedAt: APRES,
      sessionStartedAtFileTime: DEBUT,
    })
    expect(app.preexisting).toBe(false)
  })

  it('classe plusieurs applications en parallèle, chacune avec son propre statut', () => {
    const apps = [
      { appId: 'blender.exe', hwnd: '1', pid: 1, processCreatedAt: AVANT },
      { appId: 'chrome.exe', hwnd: '2', pid: 2, processCreatedAt: APRES },
      { appId: 'discord.exe', hwnd: '3', pid: 3, processCreatedAt: AVANT },
    ].map((a) => classifyDetection({ ...a, sessionStartedAtFileTime: DEBUT }))
    expect(apps.map((a) => a.preexisting)).toEqual([true, false, true])
  })
})

describe('deriveAppState', () => {
  const app = makeApp()

  it('est bloquée par défaut', () => {
    expect(deriveAppState({ app, unlock: undefined, minimized: false, now: 0 })).toEqual({
      kind: 'blocked',
    })
  })

  it('est débloquée pendant la validité du déblocage', () => {
    const unlock: Unlock = { appId: 'blender.exe', until: 1_000 }
    expect(deriveAppState({ app, unlock, minimized: false, now: 500 })).toEqual({
      kind: 'unlocked',
      until: 1_000,
    })
  })

  it('reble automatiquement à expiration — pas de prolongation silencieuse', () => {
    const unlock: Unlock = { appId: 'blender.exe', until: 1_000 }
    expect(deriveAppState({ app, unlock, minimized: false, now: 1_000 })).toEqual({
      kind: 'blocked',
    })
  })

  it('est minimisée quand elle est minimisée et toujours bloquée', () => {
    expect(deriveAppState({ app, unlock: undefined, minimized: true, now: 0 })).toEqual({
      kind: 'minimized',
    })
  })

  it('le déblocage prime sur la minimisation — une app débloquée redevient utilisable', () => {
    const unlock: Unlock = { appId: 'blender.exe', until: 1_000 }
    expect(deriveAppState({ app, unlock, minimized: true, now: 500 })).toEqual({
      kind: 'unlocked',
      until: 1_000,
    })
  })
})

describe('needsSaveWarning', () => {
  it('avertit pour une application préexistante — du travail peut être en cours', () => {
    expect(needsSaveWarning(makeApp({ preexisting: true }))).toBe(true)
  })

  it("n'avertit pas pour une application lancée pendant la session", () => {
    // L'utilisateur ne l'a jamais vue ni utilisee : il n'y a rien a perdre.
    expect(needsSaveWarning(makeApp({ preexisting: false }))).toBe(false)
  })
})
