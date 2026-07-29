import { describe, it, expect } from 'vitest'
import { encodeCommand, decodeLine } from './protocol'

describe('encodeCommand', () => {
  it('produit une ligne JSON unique sans saut de ligne interne', () => {
    const line = encodeCommand({ id: 1, cmd: 'ping' })
    expect(line).toBe('{"id":1,"cmd":"ping"}')
    expect(line).not.toContain('\n')
  })

  it('sérialise la liste surveillée', () => {
    const line = encodeCommand({ id: 4, cmd: 'watch', exeNames: ['blender.exe', 'chrome.exe'] })
    expect(JSON.parse(line)).toEqual({
      id: 4,
      cmd: 'watch',
      exeNames: ['blender.exe', 'chrome.exe'],
    })
  })

  it('sérialise l’armement de la relance', () => {
    const line = encodeCommand({ id: 9, cmd: 'arm-relaunch', exePath: 'C:\\App\\Vethos.exe' })
    expect(JSON.parse(line)).toEqual({ id: 9, cmd: 'arm-relaunch', exePath: 'C:\\App\\Vethos.exe' })
  })

  it('sérialise le désarmement de la relance', () => {
    const line = encodeCommand({ id: 10, cmd: 'arm-relaunch', exePath: null })
    expect(JSON.parse(line)).toEqual({ id: 10, cmd: 'arm-relaunch', exePath: null })
  })
})

describe('decodeLine', () => {
  it('décode une réponse', () => {
    const msg = decodeLine('{"id":1,"ok":true,"pong":"vethos-probe"}')
    expect(msg).toEqual({ kind: 'reply', id: 1, ok: true, payload: { pong: 'vethos-probe' } })
  })

  it('décode une réponse en erreur', () => {
    const msg = decodeLine('{"id":2,"ok":false,"error":"commande inconnue"}')
    expect(msg).toEqual({ kind: 'reply', id: 2, ok: false, error: 'commande inconnue' })
  })

  it('décode un événement', () => {
    const msg = decodeLine('{"event":"window-gone","hwnd":"9911"}')
    expect(msg).toEqual({ kind: 'event', event: 'window-gone', payload: { hwnd: '9911' } })
  })

  it('renvoie null sur une ligne illisible plutôt que de lever', () => {
    expect(decodeLine('pas du json')).toBeNull()
    expect(decodeLine('')).toBeNull()
    expect(decodeLine('   ')).toBeNull()
  })

  it('renvoie null sur du JSON valide mais hors protocole', () => {
    expect(decodeLine('{"quelque":"chose"}')).toBeNull()
    expect(decodeLine('[1,2,3]')).toBeNull()
  })

  it("garde le hwnd en chaîne — un nombre perdrait de la précision", () => {
    const msg = decodeLine('{"event":"window-gone","hwnd":"9007199254740993"}')
    expect(msg?.kind).toBe('event')
    if (msg?.kind === 'event') {
      expect(msg.payload['hwnd']).toBe('9007199254740993')
    }
  })
})
