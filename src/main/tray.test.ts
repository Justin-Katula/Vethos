import { describe, it, expect } from 'vitest'
import { buildTrayMenuItems, shouldStartHidden, type TrayMenuItem } from './tray'

function findQuit(items: TrayMenuItem[]): Extract<TrayMenuItem, { kind: 'quit' }> | undefined {
  for (const item of items) {
    if (item.kind === 'quit') return item
  }
  return undefined
}

describe('buildTrayMenuItems', () => {
  it('propose toujours d’ouvrir Vethos', () => {
    const items = buildTrayMenuItems({ sessionActive: false })
    const ouvrir = items.find((i) => i.kind === 'open')
    expect(ouvrir).toBeDefined()
    expect(ouvrir?.kind === 'open' && ouvrir.enabled).toBe(true)
  })

  it('autorise Quitter hors session de blocage', () => {
    const quitter = findQuit(buildTrayMenuItems({ sessionActive: false }))
    expect(quitter?.enabled).toBe(true)
    expect(quitter?.reason).toBeUndefined()
  })

  it('refuse Quitter pendant une session active, avec une raison lisible', () => {
    // Sans ça, quitter depuis la zone de notification serait un contournement
    // gratuit de tout le mécanisme de blocage.
    const quitter = findQuit(buildTrayMenuItems({ sessionActive: true }))
    expect(quitter?.enabled).toBe(false)
    expect(quitter?.reason).toBeTruthy()
    expect(quitter?.reason).toMatch(/session/i)
  })

  it('garde le même ordre dans les deux états — ouvrir, séparateur, quitter', () => {
    for (const sessionActive of [true, false]) {
      expect(buildTrayMenuItems({ sessionActive }).map((i) => i.kind)).toEqual([
        'open',
        'separator',
        'quit',
      ])
    }
  })

  it('libelle toujours les entrées en français', () => {
    const items = buildTrayMenuItems({ sessionActive: true })
    for (const item of items) {
      if (item.kind === 'separator') continue
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.label).toMatch(/Vethos/)
    }
  })
})

describe('shouldStartHidden', () => {
  it('démarre masqué avec --hidden — le cas du lancement au démarrage de session', () => {
    expect(shouldStartHidden(['C:/app/Vethos.exe', '--hidden'])).toBe(true)
  })

  it('démarre visible sans le drapeau — le cas du double-clic', () => {
    expect(shouldStartHidden(['C:/app/Vethos.exe'])).toBe(false)
  })

  it('ignore les autres arguments', () => {
    expect(shouldStartHidden(['C:/app/Vethos.exe', '--inspect', '--enable-logging'])).toBe(false)
  })

  it('reconnaît le drapeau quelle que soit sa position', () => {
    expect(shouldStartHidden(['C:/app/Vethos.exe', '--enable-logging', '--hidden'])).toBe(true)
  })

  it('gère une ligne de commande vide', () => {
    expect(shouldStartHidden([])).toBe(false)
  })
})
