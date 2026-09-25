import { describe, expect, it } from 'vitest'
import {
  afterMissLine,
  ContractSchema,
  DELAI_MODIFICATION_MS,
  duringBlockLine,
  effectiveContract,
  refusalLine,
  refusesChange,
  requestModeChange,
  signContract,
} from './contract'

const NOW = new Date('2026-09-25T14:00:00.000Z')

describe('Contrat d’Ulysse', () => {
  it('se signe, et survit à la validation du schéma', () => {
    const c = signContract('ally', NOW)
    expect(ContractSchema.parse(c)).toEqual(c)
  })

  it('pendant un bloc : toute modification est refusée', () => {
    const r = requestModeChange(signContract('ally', NOW), 'sergeant', NOW, true)
    expect(r).toEqual({ ok: false, reason: 'during-block' })
  })

  it('hors bloc : la modification attend 48 h avant de prendre effet', () => {
    const r = requestModeChange(signContract('ally', NOW), 'sergeant', NOW, false)
    if (!r.ok) throw new Error('attendu')
    expect(effectiveContract(r.contract, new Date(NOW.getTime() + DELAI_MODIFICATION_MS - 1)).mode).toBe('ally')
    expect(effectiveContract(r.contract, new Date(NOW.getTime() + DELAI_MODIFICATION_MS)).mode).toBe('sergeant')
  })

  it('revenir au mode en vigueur annule la modification en attente', () => {
    const r = requestModeChange(signContract('ally', NOW), 'sergeant', NOW, false)
    if (!r.ok) throw new Error('attendu')
    const back = requestModeChange(r.contract, 'ally', NOW, false)
    expect(back.ok && back.contract.pending).toBeNull()
  })

  it('refuse les changements du plan pendant un bloc, pas en dehors ; sans contrat, rien n’est refusé', () => {
    const c = signContract('sergeant', NOW)
    expect(refusesChange(c, true)).toBe(true)
    expect(refusesChange(c, false)).toBe(false)
    expect(refusesChange(null, true)).toBe(false)
  })

  it('même fermeté, deux tons ; après un échec : un constat, puis la prochaine action', () => {
    expect(duringBlockLine('ally', 18)).toBe('It’s hard, I know. 18 minutes. You’ve got this.')
    expect(duringBlockLine('sergeant', 18)).toBe('No. The block goes on. 18 minutes.')
    expect(afterMissLine('ally', '19:00')).toContain('Next block at 19:00')
    expect(afterMissLine('sergeant', '19:00')).toBe('Missed. Next block 19:00. Go.')
    expect(refusalLine('ally', NOW.toISOString(), 5)).toContain('no changes during a block')
  })
})
