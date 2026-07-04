import { describe, expect, it } from 'vitest'
import { __appDiscoveryTest } from './app-discovery'

const {
  buildAppPathCandidates,
  buildIconSourceOrder,
  buildAppxCandidates,
  buildProgramFileCandidates,
  buildRegistryCandidates,
  buildShortcutCandidates,
  buildWingetCandidates,
  extractExePathFromDisplayIcon,
  extractIconPathFromDisplayIcon,
  isKnownGamePlatformEntry,
  isLikelyNonUserAppxPackage,
  isLikelyNonUserDisplayName,
  mergeCandidates,
  normalizeDisplayName,
  parseWingetJson,
  parseWingetTable,
} = __appDiscoveryTest

describe('app-discovery', () => {
  it("préfère les icônes dédiées et l'exécutable avant les raccourcis", () => {
    expect(
      buildIconSourceOrder(
        'C:\\Apps\\Discord\\Discord.exe',
        ['C:\\Start Menu\\Discord.lnk', 'C:\\Apps\\Discord\\app.ico'],
        'registry',
      ),
    ).toEqual([
      'C:\\Apps\\Discord\\app.ico',
      'C:\\Apps\\Discord\\Discord.exe',
      'C:\\Start Menu\\Discord.lnk',
    ])
  })

  it('préfère le logo du manifeste pour une application Microsoft Store', () => {
    expect(
      buildIconSourceOrder(
        'C:\\WindowsApps\\Teams\\ms-teams_modulehost.exe',
        ['C:\\WindowsApps\\Teams\\Assets\\Square44x44Logo.scale-200.png'],
        'appx',
      ),
    ).toEqual([
      'C:\\WindowsApps\\Teams\\Assets\\Square44x44Logo.scale-200.png',
      'C:\\WindowsApps\\Teams\\ms-teams_modulehost.exe',
    ])
  })

  it("garde la priorité Store grâce au package même si la source fusionnée est le registre", () => {
    expect(
      buildIconSourceOrder(
        'C:\\WindowsApps\\Package\\application.root.exe',
        ['C:\\Start Menu\\Application.lnk'],
        'registry',
        'Publisher.Application_123',
      ),
    ).toEqual([
      'C:\\Start Menu\\Application.lnk',
      'C:\\WindowsApps\\Package\\application.root.exe',
    ])
  })

  it('extracts quoted DisplayIcon exe paths with icon indexes', () => {
    expect(
      extractExePathFromDisplayIcon('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",0'),
    ).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  })

  it('extrait aussi les icônes locales ICO et DLL du registre', () => {
    expect(extractIconPathFromDisplayIcon('"C:\\Apps\\Example\\app.ico",0')).toBe(
      'C:\\Apps\\Example\\app.ico',
    )
    expect(extractIconPathFromDisplayIcon('C:\\Apps\\Example\\resources.dll,-12')).toBe(
      'C:\\Apps\\Example\\resources.dll',
    )
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
        source: 'shortcut',
        hasExecutablePath: true,
      },
    ])
  })

  it('keeps registry inventory but only exposes verified user-facing targets', () => {
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

    const merged = mergeCandidates(candidates)
    expect(merged.map((app) => app.name)).toEqual([
      'Armoury Crate Service',
      'PyCharm',
      'Visual Studio Installer',
    ])
    expect(merged.find((app) => app.name === 'PyCharm')).toEqual(
      expect.objectContaining({ exeName: 'pycharm64.exe', hasExecutablePath: true }),
    )
    expect(merged.find((app) => app.name === 'Armoury Crate Service')).toEqual(
      expect.objectContaining({ exeName: '', exePath: '', hasExecutablePath: false }),
    )
  })

  it("préserve l'identité du package quand une cible registre gagne la fusion", () => {
    const merged = mergeCandidates([
      ...buildAppxCandidates([
        {
          DisplayName: 'Application empaquetée',
          PackageFamilyName: 'Publisher.Application_123',
        },
      ]),
      ...buildRegistryCandidates([
        {
          DisplayName: 'Application empaquetée',
          DisplayIcon: 'C:\\Apps\\Application\\Application.exe',
        },
      ]),
    ])

    expect(merged[0]).toEqual(
      expect.objectContaining({
        source: 'registry',
        packageId: 'Publisher.Application_123',
      }),
    )
  })

  it('keeps real Windows inventory entries without inventing a process name', () => {
    const candidates = buildRegistryCandidates([
      {
        DisplayName: 'Cyberpunk 2077 Bonus Content',
        Publisher: 'CD PROJEKT RED',
      },
    ])

    expect(candidates).toEqual([
      expect.objectContaining({
        name: 'Cyberpunk 2077 Bonus Content',
        exeName: '',
        exePath: '',
        source: 'registry',
        hasExecutablePath: false,
      }),
    ])
  })

  it('recognizes games from known launcher uninstall entries', () => {
    expect(
      isKnownGamePlatformEntry({
        DisplayName: 'Cyberpunk 2077',
        UninstallString: 'steam://uninstall/1091500',
      }),
    ).toBe(true)
    expect(
      isKnownGamePlatformEntry({
        DisplayName: 'Some Game',
        UninstallString: 'C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe com.epicgames.launcher://apps/game?action=uninstall',
      }),
    ).toBe(true)
    expect(
      isKnownGamePlatformEntry({
        DisplayName: 'Realtek Audio Driver',
        UninstallString: 'C:\\Program Files\\Realtek\\uninstall.exe',
      }),
    ).toBe(false)
  })

  it('keeps App Paths entries for apps missing from uninstall registry', () => {
    const candidates = buildAppPathCandidates([
      {
        Name: 'Discord',
        ExePath: 'C:\\Users\\obed\\AppData\\Local\\Discord\\app-1.0.0\\Discord.exe',
      },
    ])

    expect(candidates.map((app) => app.name)).toEqual(['Discord'])
  })

  it('keeps user-facing executables from Program Files scan', () => {
    const candidates = buildProgramFileCandidates([
      {
        Name: 'Figma',
        ExePath: 'C:\\Users\\obed\\AppData\\Local\\Programs\\Figma\\Figma.exe',
        Publisher: 'Figma, Inc.',
      },
      {
        Name: 'Figma Update Helper',
        ExePath: 'C:\\Users\\obed\\AppData\\Local\\Programs\\Figma\\Update.exe',
      },
    ])

    expect(candidates.map((app) => app.name)).toEqual(['Figma'])
  })

  it('parses winget table output without guessing process names', () => {
    const records = parseWingetTable(`
Name                         Id                       Version Source
--------------------------------------------------------------------
Google Chrome                Google.Chrome            125.0   winget
Discord                      Discord.Discord          1.0.0   winget
    `)
    const candidates = buildWingetCandidates(records)

    expect(candidates.map((app) => [app.name, app.exeName, app.source])).toEqual([
      ['Google Chrome', '', 'winget'],
      ['Discord', '', 'winget'],
    ])
  })

  it('parses winget json output from Sources packages', () => {
    const records = parseWingetJson(
      JSON.stringify({
        Sources: [
          {
            Packages: [
              {
                Name: 'Visual Studio Code',
                PackageIdentifier: 'Microsoft.VisualStudioCode',
                Publisher: 'Microsoft Corporation',
              },
            ],
          },
        ],
      }),
    )

    expect(buildWingetCandidates(records).map((app) => app.exeName)).toEqual([''])
  })

  it('keeps winget-only apps without executable paths', () => {
    const candidates = buildWingetCandidates([
      { Name: 'Obsidian', Id: 'Obsidian.Obsidian' },
      { Name: 'Notion', Id: 'Notion.Notion' },
    ])

    expect(mergeCandidates(candidates).map((app) => ({
      name: app.name,
      exeName: app.exeName,
      hasExecutablePath: app.hasExecutablePath,
    }))).toEqual([
      { name: 'Notion', exeName: '', hasExecutablePath: false },
      { name: 'Obsidian', exeName: '', hasExecutablePath: false },
    ])
  })

  it('filters winget-only internal component names', () => {
    const candidates = buildWingetCandidates([
      { Name: '1.3.etch', Id: 'Some.Package.1.3.etch' },
      { Name: '64bit', Id: 'Some.Package.64bit' },
      { Name: '64-bit', Id: 'Some.Package.64-bit' },
      { Name: 'Useful App', Id: 'Vendor.UsefulApp' },
      { Name: 'Another Useful App', Id: 'Vendor.64bit' },
    ])

    expect(candidates.map((app) => app.name)).toEqual(['Useful App'])
  })

  it('detects version and architecture labels as non-user display names', () => {
    expect(isLikelyNonUserDisplayName('1.3.etch')).toBe(true)
    expect(isLikelyNonUserDisplayName('64bit')).toBe(true)
    expect(isLikelyNonUserDisplayName('64-bit')).toBe(true)
    expect(isLikelyNonUserDisplayName('x64')).toBe(true)
    expect(isLikelyNonUserDisplayName('7-Zip')).toBe(false)
    expect(isLikelyNonUserDisplayName('3D Viewer')).toBe(false)
  })

  // ── AppX/MSIX tests ────────────────────────────────────────────────────

  it('builds candidates from AppX packages with alias exe names', () => {
    const candidates = buildAppxCandidates([
      {
        DisplayName: 'Claude',
        ExecutablePath: 'C:\\Program Files\\WindowsApps\\Claude_1.0\\Claude.exe',
        PackageFamilyName: 'Claude_pzs8sxrjxfjjc',
        Publisher: 'Anthropic',
        AliasExeName: 'claude.exe',
      },
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.name).toBe('Claude')
    expect(candidates[0]!.exeName).toBe('claude.exe')
    expect(candidates[0]!.source).toBe('appx')
    expect(candidates[0]!.packageId).toBe('Claude_pzs8sxrjxfjjc')
  })

  it('builds candidates from AppX packages without alias, using manifest exe', () => {
    const candidates = buildAppxCandidates([
      {
        DisplayName: 'Crunchyroll',
        ExecutablePath: 'C:\\Program Files\\WindowsApps\\15EF7777.Crunchyroll_1.0\\Crunchyroll.exe',
        PackageFamilyName: '15EF7777.Crunchyroll_mgdgtskya6f22',
        Publisher: 'Crunchyroll',
      },
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.name).toBe('Crunchyroll')
    expect(candidates[0]!.exeName).toBe('Crunchyroll.exe')
    expect(candidates[0]!.source).toBe('appx')
  })

  it('does not invent an exe name when AppX exposes no path or alias', () => {
    const candidates = buildAppxCandidates([
      {
        DisplayName: 'PixelLab',
        PackageFamilyName: 'www.pixellab.ai-8C8B1132_0zctr6wt75ya8',
        Publisher: 'PixelLab',
      },
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.exeName).toBe('')
    expect(candidates[0]!.hasExecutablePath).toBe(false)
  })

  it('filters out system/framework AppX packages', () => {
    expect(isLikelyNonUserAppxPackage('Microsoft.Windows.ShellExperienceHost', '')).toBe(true)
    expect(isLikelyNonUserAppxPackage('MicrosoftWindows.Client.CBS', '')).toBe(true)
    expect(isLikelyNonUserAppxPackage('Microsoft.VCLibs', '')).toBe(true)
    expect(isLikelyNonUserAppxPackage('Microsoft.DirectX', '')).toBe(true)
    expect(isLikelyNonUserAppxPackage('WinAppRuntime.Singleton', '')).toBe(true)
    // User apps should NOT be filtered
    expect(isLikelyNonUserAppxPackage('Claude', 'Claude_pzs8sxrjxfjjc')).toBe(false)
    expect(isLikelyNonUserAppxPackage('WhatsApp', '5319275A.WhatsAppDesktop_cv1g1gvanyjgm')).toBe(false)
    expect(isLikelyNonUserAppxPackage('Codex', 'OpenAI.Codex_2p2nqsd0c76g0')).toBe(false)
  })

  it('keeps AppX user apps even if they match known registry apps', () => {
    const candidates = [
      ...buildRegistryCandidates([
        {
          DisplayName: 'WhatsApp',
          DisplayIcon: 'C:\\Users\\obed\\AppData\\Local\\WhatsApp\\WhatsApp.exe',
        },
      ]),
      ...buildAppxCandidates([
        {
          DisplayName: 'WhatsApp',
          ExecutablePath: 'C:\\Program Files\\WindowsApps\\WhatsApp_1.0\\WhatsApp.exe',
          PackageFamilyName: '5319275A.WhatsAppDesktop_cv1g1gvanyjgm',
          Publisher: 'WhatsApp Inc.',
        },
      ]),
    ]

    const merged = mergeCandidates(candidates)
    const whatsapps = merged.filter((app) => app.name === 'WhatsApp')
    expect(whatsapps.length).toBeGreaterThanOrEqual(1)
  })

  // ── Chrome PWA tests ──────────────────────────────────────────────────

  it('handles Chrome PWA shortcuts (e.g. Gemini) targeting chrome_proxy.exe', () => {
    const candidates = buildShortcutCandidates([
      {
        Name: 'Gemini',
        TargetPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe',
        Arguments: '--profile-directory=Default --app-id=abcdef123456',
      },
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.name).toBe('Gemini')
    expect(candidates[0]!.exeName).toBe('chrome.exe')
    expect(candidates[0]!.source).toBe('shortcut')
  })

  it('does not treat regular Chrome shortcuts as PWAs', () => {
    const candidates = buildShortcutCandidates([
      {
        Name: 'Google Chrome',
        TargetPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        Arguments: '',
      },
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.name).toBe('Google Chrome')
    expect(candidates[0]!.exeName).toBe('chrome.exe')
  })
})
