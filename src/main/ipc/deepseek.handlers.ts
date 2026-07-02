import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { DeepSeekChatMessage, DeepSeekChatRequest, DeepSeekChatResult } from '@shared/deepseek'
import { sendDeepSeekChat } from '@main/deepseek/gateway'
import { getInstalledApps } from './apps'
import log from '@main/logging/setup'

type InstalledAppContext = {
  name: string
  exeName: string
  publisher?: string
}

function formatInstalledAppsContext(apps: InstalledAppContext[]): string {
  const seen = new Set<string>()
  const installedApps = apps
    .map((app) => ({
      name: app.name.trim(),
      exeName: app.exeName.trim(),
      publisher: app.publisher?.trim(),
    }))
    .filter((app) => {
      const key = app.name.toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  const blockableCount = installedApps.filter(
    (app) => app.exeName && app.exeName.toLowerCase() !== 'unknown.exe',
  ).length
  const lines = installedApps
    .map((app) =>
      app.exeName && app.exeName.toLowerCase() !== 'unknown.exe'
        ? app.publisher
          ? `- ${app.name} (${app.exeName}) - Editeur: ${app.publisher}`
          : `- ${app.name} (${app.exeName})`
        : app.publisher
          ? `- ${app.name} - Editeur: ${app.publisher} [installee, cible de blocage non resolue]`
          : `- ${app.name} [installee, cible de blocage non resolue]`,
    )

  return `Contexte local Vethos detecte automatiquement.
Applications installees detectees sur cet ordinateur (${installedApps.length}), dont ${blockableCount} avec une cible de blocage verifiee :
${lines.join('\n')}

Utilise uniquement cette liste comme source des applications disponibles sur le PC de l'utilisateur. Ne suppose jamais qu'une autre application est installee. Quand tu proposes de bloquer ou autoriser une application, fais-le uniquement si son nom de processus exact est indique entre parentheses. N'invente jamais de nom de processus pour une entree marquee "cible de blocage non resolue".`
}

async function withInstalledAppsContext(
  request: DeepSeekChatRequest | undefined,
): Promise<DeepSeekChatRequest | undefined> {
  const source = request ?? {}
  const messages: DeepSeekChatMessage[] | undefined =
    source.messages && source.messages.length > 0
      ? source.messages
      : source.prompt
        ? [{ role: 'user', content: source.prompt }]
        : undefined

  if (!messages) return request

  try {
    const installedApps = await getInstalledApps()
    if (installedApps.length === 0) return request

    return {
      ...source,
      prompt: undefined,
      messages: [
        {
          role: 'system',
          content: formatInstalledAppsContext(installedApps),
        },
        ...messages,
      ],
    }
  } catch (err) {
    log.warn('[deepseek] installed apps context unavailable', err)
    return request
  }
}

export function registerDeepSeekHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.DEEPSEEK_CHAT,
    async (_event, request: DeepSeekChatRequest | undefined): Promise<DeepSeekChatResult> => {
      return sendDeepSeekChat(await withInstalledAppsContext(request))
    },
  )
}

export const __deepSeekHandlersTest = {
  formatInstalledAppsContext,
}
