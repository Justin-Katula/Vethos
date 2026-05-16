import { describe, it, expect } from 'vitest'
import { encodeMessage, createMessageDecoder, type ServiceMessage } from './service-protocol'

describe('service-protocol framing', () => {
  const ping: ServiceMessage = { kind: 'request', id: 'a1', type: 'PING' }

  it('encode ajoute exactement un saut de ligne final', () => {
    const encoded = encodeMessage(ping)
    expect(encoded.endsWith('\n')).toBe(true)
    expect(encoded.slice(0, -1).includes('\n')).toBe(false)
  })

  it('round-trip encode -> decode', () => {
    const decode = createMessageDecoder()
    expect(decode(encodeMessage(ping))).toEqual([ping])
  })

  it('décode plusieurs messages dans un même chunk', () => {
    const decode = createMessageDecoder()
    const chunk = encodeMessage(ping) + encodeMessage({ ...ping, id: 'a2' })
    const out = decode(chunk)
    expect(out.map((m) => (m as { id: string }).id)).toEqual(['a1', 'a2'])
  })

  it('bufferise un chunk partiel puis émet quand il est complet', () => {
    const decode = createMessageDecoder()
    const full = encodeMessage(ping)
    const cut = Math.floor(full.length / 2)
    expect(decode(full.slice(0, cut))).toEqual([])
    expect(decode(full.slice(cut))).toEqual([ping])
  })

  it('ignore les lignes vides', () => {
    const decode = createMessageDecoder()
    expect(decode('\n\n')).toEqual([])
  })
})
