import { describe, it, expect } from 'vitest'
import {
  isBlockingTarget,
  rejectionReason,
  WS_EX_APPWINDOW,
  WS_EX_TOOLWINDOW,
  type WindowInfo,
} from './window-filter'

function makeWindow(overrides: Partial<WindowInfo> = {}): WindowInfo {
  return {
    hwnd: '1000',
    pid: 42,
    exeName: 'blender.exe',
    title: 'Blender',
    className: 'GHOST_WindowClass',
    exStyle: 0,
    style: 0,
    hasOwner: false,
    cloaked: false,
    visible: true,
    ...overrides,
  }
}

describe('isBlockingTarget', () => {
  it('accepte une fenêtre principale ordinaire', () => {
    expect(isBlockingTarget(makeWindow())).toBe(true)
    expect(rejectionReason(makeWindow())).toBeNull()
  })

  it('rejette une fenêtre invisible', () => {
    const w = makeWindow({ visible: false })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('invisible')
  })

  it('rejette une fenêtre masquée par DWM', () => {
    const w = makeWindow({ cloaked: true })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('masquée par DWM')
  })

  it('rejette un titre vide ou fait uniquement de blancs', () => {
    expect(isBlockingTarget(makeWindow({ title: '' }))).toBe(false)
    expect(isBlockingTarget(makeWindow({ title: '   ' }))).toBe(false)
    expect(rejectionReason(makeWindow({ title: '' }))).toBe('titre vide')
  })

  it('rejette une fenêtre outil — bug 4, les fenêtres internes', () => {
    const w = makeWindow({ exStyle: WS_EX_TOOLWINDOW })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('fenêtre outil')
  })

  it('rejette une fenêtre possédée — boîtes de dialogue, écrans de démarrage', () => {
    const w = makeWindow({ hasOwner: true })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('fenêtre possédée')
  })

  it('accepte une fenêtre possédée qui déclare WS_EX_APPWINDOW', () => {
    // WS_EX_APPWINDOW est une demande explicite de presence dans la barre des
    // taches : elle prime sur la regle du proprietaire.
    expect(isBlockingTarget(makeWindow({ hasOwner: true, exStyle: WS_EX_APPWINDOW }))).toBe(true)
  })

  it('rejette WS_EX_TOOLWINDOW même avec WS_EX_APPWINDOW', () => {
    const w = makeWindow({ exStyle: WS_EX_TOOLWINDOW | WS_EX_APPWINDOW })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('fenêtre outil')
  })

  it('rejette les classes assistantes connues', () => {
    for (const className of ['IME', 'MSCTFIME UI', 'Default IME', 'tooltips_class32', 'SysShadow']) {
      const w = makeWindow({ className })
      expect(isBlockingTarget(w), className).toBe(false)
      expect(rejectionReason(w)).toBe('classe assistante')
    }
  })

  it('accepte les vraies fenêtres de navigateur et UWP', () => {
    expect(isBlockingTarget(makeWindow({ className: 'Chrome_WidgetWin_1' }))).toBe(true)
    expect(isBlockingTarget(makeWindow({ className: 'ApplicationFrameWindow' }))).toBe(true)
  })

  it('ne se laisse pas piéger par la casse de la classe', () => {
    expect(isBlockingTarget(makeWindow({ className: 'ime' }))).toBe(false)
  })
})
