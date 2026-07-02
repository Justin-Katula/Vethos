import { describe, expect, it } from 'vitest'
import { __deepSeekHandlersTest } from './deepseek.handlers'

describe('installed apps Coach context', () => {
  it('counts the complete Windows inventory without inventing blocking targets', () => {
    const context = __deepSeekHandlersTest.formatInstalledAppsContext([
      { name: 'Discord', exeName: 'Discord.exe', publisher: 'Discord Inc.' },
      { name: 'Windows Runtime', exeName: '', publisher: 'Microsoft' },
    ])

    expect(context).toContain(
      'Applications installees detectees sur cet ordinateur (2), dont 1 avec une cible de blocage verifiee',
    )
    expect(context).toContain('- Discord (Discord.exe)')
    expect(context).toContain(
      '- Windows Runtime - Editeur: Microsoft [installee, cible de blocage non resolue]',
    )
    expect(context).toContain("N'invente jamais de nom de processus")
  })
})
