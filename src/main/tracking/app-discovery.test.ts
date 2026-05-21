import { describe, expect, it } from 'vitest'
import { __appDiscoveryTest } from './app-discovery'

const {
  buildRegistryCandidates,
  buildShortcutCandidates,
  extractExePathFromDisplayIcon,
  mergeCandidates,
  normalizeDisplayName,
} = __appDiscoveryTest

describe('app-discovery', () => {
  it('extracts quoted DisplayIcon exe paths with icon indexes', () => {
    expect(
      extractExePathFromDisplayIcon('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",0'),
    ).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  })

  it('normalizes duplicate installer-style display names', () => {
    expect(normalizeDisplayName('Antigravity (User)')).toBe('Antigravity')
    expect(normalizeDisplayName('Antigravity 2.0.0')).toBe('Antigravity')
  })

  it('keeps Start Menu apps and filters Windows tools and uninstallers', () => {
    const candidates = buildShortcutCandidates([
      {
        Name: 'Google Chrome',
        TargetPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      },
      {
        Name: 'Registry Editor',
        TargetPath: 'C:\\Windows\\regedit.exe',
      },
      {
        Name: 'Uninstall DS4Windows',
        TargetPath: 'C:\\Controller\\DS4Windows\\unins000.exe',
      },
    ])

    expect(candidates.map((app) => app.name)).toEqual(['Google Chrome'])
  })

  it('deduplicates registry duplicates behind Start Menu names', () => {
    const candidates = [
      ...buildShortcutCandidates([
        {
          Name: 'Antigravity (User)',
          TargetPath: 'C:\\Users\\obed\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe',
        },
      ]),
      ...buildRegistryCandidates([
        {
          DisplayName: 'Antigravity 2.0.0',
          DisplayIcon: 'C:\\Users\\obed\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe',
        },
      ]),
    ]

    expect(mergeCandidates(candidates)).toEqual([
      {
        name: 'Antigravity',
        exeName: 'Antigravity.exe',
        exePath: 'C:\\Users\\obed\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe',
        publisher: '',
      },
    ])
  })

  it('filters registry-only services and installers', () => {
    const candidates = buildRegistryCandidates([
      {
        DisplayName: 'Armoury Crate Service',
        DisplayIcon: 'C:\\Program Files\\ASUS\\Armoury Crate Service\\ArmouryCrate.Service.exe',
      },
      {
        DisplayName: 'PyCharm',
        DisplayIcon: '"C:\\Program Files\\JetBrains\\PyCharm\\bin\\pycharm64.exe",0',
      },
      {
        DisplayName: 'Visual Studio Installer',
        DisplayIcon: '"C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\setup.exe"',
      },
    ])

    expect(candidates.map((app) => app.name)).toEqual(['PyCharm'])
  })
})
