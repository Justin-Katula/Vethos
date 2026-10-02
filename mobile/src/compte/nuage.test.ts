import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }))
vi.mock('./supabase', () => ({ supabase: () => null }))

import { arbitrer } from './nuage'

const t = (h: string) => `2026-09-30T${h}:00.000Z`

describe('Sauvegarde en ligne : la version la plus récente gagne', () => {
  it('nouvel iPhone : rien sur le téléphone, le nuage revient', () => {
    expect(arbitrer({ heure: null, present: false }, { heure: t('10:00') })).toBe('prendre')
  })
  it('jamais sauvegardé : le téléphone part en ligne', () => {
    expect(arbitrer({ heure: t('10:00'), present: true }, null)).toBe('envoyer')
  })
  it('modifié hors ligne après la dernière sauvegarde : le téléphone gagne', () => {
    expect(arbitrer({ heure: t('11:00'), present: true }, { heure: t('10:00') })).toBe('envoyer')
  })
  it('modifié ailleurs depuis : le nuage gagne', () => {
    expect(arbitrer({ heure: t('10:00'), present: true }, { heure: t('11:00') })).toBe('prendre')
  })
  it('déjà d’accord : rien ne bouge', () => {
    expect(arbitrer({ heure: t('10:00'), present: true }, { heure: t('10:00') })).toBe('garder')
  })
  it('rien nulle part : rien ne bouge', () => {
    expect(arbitrer({ heure: null, present: false }, null)).toBe('garder')
  })

  it('séances : la copie du téléphone n’est jamais écrasée par une plus récente venue d’ailleurs', () => {
    expect(arbitrer({ heure: t('10:00'), present: true }, { heure: t('11:00') }, 'vethos:seances:v1')).toBe('envoyer')
    expect(arbitrer({ heure: null, present: false }, { heure: t('11:00') }, 'vethos:seances:v1')).toBe('prendre')
    expect(arbitrer({ heure: t('10:00'), present: true }, { heure: t('10:00') }, 'vethos:seances:v1')).toBe('garder')
  })
})
