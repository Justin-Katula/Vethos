import { describe, expect, it } from 'vitest'
import type { BlockingProfile, DiscoveredSite } from '@shared/schemas'
import type { Storage } from '@service/storage'
import { resolveAllowlistProfile, resolveAppExplanationFocus } from './blocking.handlers'

const PROFILE: BlockingProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Strict',
  mode: 'allowlist',
  blockedSites: [],
  blockedProcesses: [],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' },
  createdAt: '2026-05-04T09:00:00.000Z',
}

type DiscoveredApp = Parameters<typeof resolveAllowlistProfile>[1][number]

function app(exeName: string, exePath: string): DiscoveredApp {
  return {
    name: exeName.replace(/\.exe$/i, ''),
    exeName,
    exePath,
    publisher: '',
  }
}

function site(domain: string): DiscoveredSite {
  return {
    domain,
    firstSeenAt: '2026-05-04T09:00:00.000Z',
    lastSeenAt: '2026-05-04T09:00:00.000Z',
    visitCount: 1,
    blocked: false,
  }
}

describe('resolveAllowlistProfile', () => {
  it('does not block empty app categories when only sites are allowlisted', () => {
    const resolved = resolveAllowlistProfile(
      {
        ...PROFILE,
        blockedSites: ['docs.google.com'],
      },
      [app('chrome.exe', 'C:\\Apps\\Chrome\\chrome.exe'), app('discord.exe', 'C:\\Apps\\Discord\\discord.exe')],
      [
        site('docs.google.com'),
        site('drive.docs.google.com'),
        site('youtube.com'),
        site('google.com'),
      ],
    )

    expect(resolved.blockedProcesses).toEqual([])
    expect(resolved.blockedNetworkApps).toEqual([])
    expect(resolved.blockedSites).toEqual(['youtube.com', 'google.com'])
  })

  it('resolves allowed apps into concrete process and network blocklists', () => {
    const discordPath = 'C:\\Apps\\Discord\\discord.exe'
    const steamPath = 'C:\\Apps\\Steam\\steam.exe'

    const resolved = resolveAllowlistProfile(
      {
        ...PROFILE,
        blockedProcesses: ['chrome.exe'],
        blockedNetworkApps: [discordPath],
      },
      [
        app('chrome.exe', 'C:\\Apps\\Chrome\\chrome.exe'),
        app('discord.exe', discordPath),
        app('steam.exe', steamPath),
        app('svchost.exe', 'C:\\Windows\\System32\\svchost.exe'),
        app('unknown.exe', ''),
      ],
      [],
    )

    expect(resolved.blockedProcesses).toEqual(['discord.exe', 'steam.exe', 'unknown.exe'])
    expect(resolved.blockedNetworkApps).toEqual([steamPath])
    expect(resolved.blockedSites).toEqual([])
  })
})

describe('resolveAppExplanationFocus', () => {
  it('links an automatic session to its task and objective', async () => {
    const storage = {
      read: async (key: string) => {
        if (key === 'tasks') {
          return {
            tasks: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                title: 'Finir le rapport',
                linkedObjectiveId: '22222222-2222-4222-8222-222222222222',
              },
            ],
          }
        }
        if (key === 'objectives') {
          return {
            objectives: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                name: 'Réussir le trimestre',
              },
            ],
          }
        }
        return null
      },
    } as unknown as Storage

    await expect(
      resolveAppExplanationFocus(storage, 'user_123', 'Vethos auto - Finir le rapport'),
    ).resolves.toEqual({
      focusKind: 'task',
      focusLabel: 'Finir le rapport',
      taskId: '11111111-1111-4111-8111-111111111111',
      taskTitle: 'Finir le rapport',
      objectiveId: '22222222-2222-4222-8222-222222222222',
      objectiveName: 'Réussir le trimestre',
    })
  })

  it('falls back to the session label when no task or objective matches', async () => {
    const storage = {
      read: async () => null,
    } as unknown as Storage

    await expect(
      resolveAppExplanationFocus(storage, undefined, 'Session: Concentration libre'),
    ).resolves.toEqual({
      focusKind: 'session',
      focusLabel: 'Concentration libre',
    })
  })
})
