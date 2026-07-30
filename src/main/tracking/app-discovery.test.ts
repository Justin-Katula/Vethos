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
        // La fusion classe l'entrée retenue. « Antigravity » n'est reconnu par
        // aucun signal, d'où « autres » — le repli assumé.
        // Antigravity est un éditeur reconnu : classé en productivité.
        category: 'productivity',
        logoPath: undefined,
        // Le raccourci d'origine est conservé pour servir de repli quand
        // l'icône de l'exécutable est introuvable.
        shortcutPath: '',
      },
    ])
  })

  it('déduplique deux exécutables partageant un seul nom affiché', () => {
    // « Rockstar Games Launcher » pointait a la fois sur Launcher.exe et
    // LauncherPatcher.exe : deux lignes pour une seule application.
    const merged = mergeCandidates(
      buildShortcutCandidates([
        { Name: 'Rockstar Games Launcher', TargetPath: 'C:\\RG\\Launcher.exe' },
        { Name: 'Rockstar Games Launcher', TargetPath: 'C:\\RG\\LauncherPatcher.exe' },
      ]),
    )
    expect(merged).toHaveLength(1)
  })

  it('écarte les installeurs et composants techniques qui passaient le premier filtre', () => {
    const candidates = buildShortcutCandidates([
      { Name: 'Docker Desktop', TargetPath: 'C:\\a\\Docker Desktop Installer.exe' },
      { Name: 'Microsoft OneDrive', TargetPath: 'C:\\a\\OneDriveSetup.exe' },
      { Name: 'itch', TargetPath: 'C:\\a\\itch-setup.exe' },
      { Name: 'Denuvo Anti-Cheat', TargetPath: 'C:\\a\\denuvo-anti-cheat-update-service.exe' },
      { Name: 'ASUS DriverHub', TargetPath: 'C:\\a\\ASUS-DriverHub-Installer.exe' },
      { Name: 'IncrediBuild Agent Tray-Icon', TargetPath: 'C:\\a\\BuildTrayIcon.exe' },
      { Name: 'Blender', TargetPath: 'C:\\a\\blender.exe' },
    ])
    expect(candidates.map((c) => c.name)).toEqual(['Blender'])
  })

  it('classe chaque application fusionnée', () => {
    const merged = mergeCandidates(
      buildShortcutCandidates([
        { Name: 'Discord', TargetPath: 'C:\\Users\\o\\AppData\\Local\\Discord\\discord.exe' },
        { Name: 'Blender', TargetPath: 'C:\\Program Files\\Blender\\blender.exe' },
      ]),
    )
    expect(merged.map((a) => [a.name, a.category])).toEqual([
      ['Blender', 'creativity'],
      ['Discord', 'social'],
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
