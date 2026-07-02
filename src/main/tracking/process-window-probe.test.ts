import { describe, expect, it } from 'vitest'
import {
  parseForegroundWindowInfo,
  parseProcessWindowBounds,
  parseProcessWindowBoundsList,
  parseVisibleWindowInfos,
} from './process-window-probe'

describe('parseProcessWindowBounds', () => {
  it('convertit le rectangle Win32 en dimensions Electron', () => {
    expect(parseProcessWindowBounds('1234,100,200,900,700')).toEqual({
      pid: 1234,
      x: 100,
      y: 200,
      width: 800,
      height: 500,
    })
  })

  it('refuse une fenêtre absente ou un rectangle invalide', () => {
    expect(parseProcessWindowBounds('hidden')).toBeNull()
    expect(parseProcessWindowBounds('1234,100,200,50,700')).toBeNull()
    expect(parseProcessWindowBounds('not-a-rectangle')).toBeNull()
  })

  it('convertit toutes les fenêtres visibles avec un identifiant stable', () => {
    expect(parseProcessWindowBoundsList('101,1234,10,20,410,320,0;202,1234,500,80,900,480,1')).toEqual([
      { windowId: '101', pid: 1234, x: 10, y: 20, width: 400, height: 300, minimized: false },
      { windowId: '202', pid: 1234, x: 500, y: 80, width: 400, height: 400, minimized: true },
    ])
    expect(parseProcessWindowBoundsList('hidden')).toEqual([])
  })

  it('convertit la fenêtre active avec son titre et son processus', () => {
    expect(
      parseForegroundWindowInfo(
        '9001,4321,10,20,1010,720,0|bXNlZGdlLmV4ZQ==|aW5zdGFncmFtLmNvbQ==',
      ),
    ).toEqual({
      windowId: '9001',
      pid: 4321,
      x: 10,
      y: 20,
      width: 1000,
      height: 700,
      minimized: false,
      processName: 'msedge.exe',
      title: 'instagram.com',
    })
    expect(parseForegroundWindowInfo('hidden')).toBeNull()
  })

  it('convertit une liste de fenêtres visibles', () => {
    expect(
      parseVisibleWindowInfos(
        '9001,4321,10,20,1010,720,0|bXNlZGdlLmV4ZQ==|aW5zdGFncmFtLmNvbQ==;9002,99,0,0,500,400,0|YnJhdmUuZXhl|WW91VHViZQ==',
      ),
    ).toEqual([
      {
        windowId: '9001',
        pid: 4321,
        x: 10,
        y: 20,
        width: 1000,
        height: 700,
        minimized: false,
        processName: 'msedge.exe',
        title: 'instagram.com',
      },
      {
        windowId: '9002',
        pid: 99,
        x: 0,
        y: 0,
        width: 500,
        height: 400,
        minimized: false,
        processName: 'brave.exe',
        title: 'YouTube',
      },
    ])
  })
})
