import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DARK_AT,
  DEFAULT_LIGHT_AT,
  nextThemeFlip,
  parseTimeOfDay,
  resolveTheme,
  type ThemeDecision,
} from './theme'

const at = (hhmm: string): Date => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2026, 8, 8, h!, m!, 0, 0)
}

const decision = (over: Partial<ThemeDecision> = {}): ThemeDecision => ({
  mode: 'schedule',
  systemDark: false,
  schedule: { lightAt: DEFAULT_LIGHT_AT, darkAt: DEFAULT_DARK_AT },
  ...over,
})

describe('thème — lecture de l’heure', () => {
  it('lit une heure valide et rejette le reste', () => {
    expect(parseTimeOfDay('07:00')).toBe(420)
    expect(parseTimeOfDay('19:00')).toBe(1140)
    expect(parseTimeOfDay('00:00')).toBe(0)
    expect(parseTimeOfDay('24:00')).toBeNull()
    expect(parseTimeOfDay('7:00')).toBeNull()
    expect(parseTimeOfDay('')).toBeNull()
  })
})

describe('thème — les modes fixes ignorent tout le reste', () => {
  it('clair reste clair même la nuit et même si le système est sombre', () => {
    expect(resolveTheme(decision({ mode: 'light', systemDark: true }), at('03:00'))).toBe('light')
  })

  it('sombre reste sombre même en plein jour', () => {
    expect(resolveTheme(decision({ mode: 'dark', systemDark: false }), at('12:00'))).toBe('dark')
  })

  it('système suit le système, et seulement lui', () => {
    expect(resolveTheme(decision({ mode: 'system', systemDark: true }), at('12:00'))).toBe('dark')
    expect(resolveTheme(decision({ mode: 'system', systemDark: false }), at('03:00'))).toBe('light')
  })
})

describe('thème — clair le jour, sombre la nuit', () => {
  it('clair entre les deux heures, sombre en dehors', () => {
    expect(resolveTheme(decision(), at('06:59'))).toBe('dark')
    expect(resolveTheme(decision(), at('07:00'))).toBe('light')
    expect(resolveTheme(decision(), at('12:00'))).toBe('light')
    expect(resolveTheme(decision(), at('18:59'))).toBe('light')
    expect(resolveTheme(decision(), at('19:00'))).toBe('dark')
    expect(resolveTheme(decision(), at('23:59'))).toBe('dark')
    expect(resolveTheme(decision(), at('00:30'))).toBe('dark')
  })

  it('ne consulte jamais le système', () => {
    expect(resolveTheme(decision({ systemDark: true }), at('12:00'))).toBe('light')
  })

  it('une fenêtre claire qui traverse minuit reste lisible', () => {
    const veilleur = decision({ schedule: { lightAt: '22:00', darkAt: '05:00' } })
    expect(resolveTheme(veilleur, at('23:00'))).toBe('light')
    expect(resolveTheme(veilleur, at('02:00'))).toBe('light')
    expect(resolveTheme(veilleur, at('05:00'))).toBe('dark')
    expect(resolveTheme(veilleur, at('12:00'))).toBe('dark')
  })

  it('deux heures identiques ne font jamais clair, au lieu de vaciller', () => {
    const figé = decision({ schedule: { lightAt: '08:00', darkAt: '08:00' } })
    expect(resolveTheme(figé, at('08:00'))).toBe('dark')
    expect(resolveTheme(figé, at('12:00'))).toBe('dark')
  })

  it('une heure abîmée retombe sur le défaut plutôt que de casser l’écran', () => {
    const cassé = decision({ schedule: { lightAt: 'plus tard', darkAt: '' } })
    expect(resolveTheme(cassé, at('12:00'))).toBe('light')
    expect(resolveTheme(cassé, at('23:00'))).toBe('dark')
  })
})

describe('thème — quand rebasculer', () => {
  it('vise la prochaine des deux heures, aujourd’hui ou demain', () => {
    expect(nextThemeFlip(decision(), at('06:00'))).toEqual(at('07:00'))
    expect(nextThemeFlip(decision(), at('12:00'))).toEqual(at('19:00'))
    const demain = at('07:00')
    demain.setDate(demain.getDate() + 1)
    expect(nextThemeFlip(decision(), at('20:00'))).toEqual(demain)
  })

  it('ne rend jamais l’instant présent — sinon le minuteur boucle à vide', () => {
    const flip = nextThemeFlip(decision(), at('07:00'))
    expect(flip).toEqual(at('19:00'))
  })

  it('les modes qui ne dépendent pas de l’heure n’ont aucune bascule à prévoir', () => {
    expect(nextThemeFlip(decision({ mode: 'system' }), at('12:00'))).toBeNull()
    expect(nextThemeFlip(decision({ mode: 'light' }), at('12:00'))).toBeNull()
    expect(nextThemeFlip(decision({ mode: 'dark' }), at('12:00'))).toBeNull()
  })

  it('deux heures identiques : aucune bascule ne viendra', () => {
    expect(
      nextThemeFlip(decision({ schedule: { lightAt: '08:00', darkAt: '08:00' } }), at('12:00')),
    ).toBeNull()
  })
})
