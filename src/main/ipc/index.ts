import { ipcMain, app, shell, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@shared/storage'
import { getLogFilePath } from '@main/logging/setup'
import { setSleepWindow } from '@main/notifications'
import { applyThemeToWindow, setMainProcessTheme } from '@main/theme-chrome'
import { getAppCatalog, invalidateAppCatalogCache } from '@main/tracking/app-catalog'
import { isProtectedApp, isNonUserSystemHelper } from '@main/blocking/system-guard'
import { registerStorageHandlers } from './storage.handlers'
import { registerAppUsageHandlers } from '../tracking/handlers'
import {
  initUserOverrides,
  setUserOverride,
  resetUserOverride,
} from '@main/tracking/classification-resolver'
import type { AppCategory } from '@shared/app-categories'

export type BlockingSessionState = {
  active: boolean
  blockedAppIds: string[]
  endsAt: number | null
}

export type ConfirmBlockResult = { ok: true } | { ok: false; reason: string }

export async function registerAllIpcHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
  getBlockingSession: () => BlockingSessionState,
  confirmBlock: (blockId: string) => Promise<ConfirmBlockResult>,
): Promise<void> {
  registerStorageHandlers(storage)

  // Initialisation et persistance des overrides utilisateur (Section 7)
  const initialOverrides = await storage.read('app_overrides')
  initUserOverrides(initialOverrides?.overrides ?? {}, async (updated) => {
    await storage.write('app_overrides', { overrides: updated })
  })

  // L'état de session est décidé par l'horloge du processus principal. Le
  // renderer le lit, il ne le recalcule jamais — une seule source de vérité.
  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_SESSION, () => getBlockingSession())

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_LOGS, async () => {
    await shell.openPath(getLogFilePath())
  })
  // Par défaut on sert le catalogue en cache : le scan complet est trop lourd
  // pour être refait à chaque ouverture de la page.
  ipcMain.handle(IPC_CHANNELS.APP_DISCOVERY_LIST, () => getAppCatalog())
  // Le rafraîchissement forcé rend la liste à celui qui l'a demandé, ET la diffuse :
  // le renderer s'abonne à `APP_EVENT_CATALOG_UPDATED` (BlockingPage) mais personne
  // n'émettait jamais cet événement. Une page ouverte gardait donc indéfiniment la
  // liste qu'elle avait au premier rendu.
  ipcMain.handle(IPC_CHANNELS.APP_DISCOVERY_REFRESH, async () => {
    const apps = await getAppCatalog({ force: true })
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC_CHANNELS.APP_EVENT_CATALOG_UPDATED, apps)
    return apps
  })

  // Overrides manuels utilisateur (Section 7 & 23)
  ipcMain.handle(
    IPC_CHANNELS.APP_SET_USER_OVERRIDE,
    async (_e, appId: string, category: AppCategory) => {
      await setUserOverride(appId, category)
      await invalidateAppCatalogCache()
      return { ok: true }
    },
  )

  ipcMain.handle(IPC_CHANNELS.APP_RESET_USER_OVERRIDE, async (_e, appId: string) => {
    await resetUserOverride(appId)
    await invalidateAppCatalogCache()
    return { ok: true }
  })

  // Critère 3 : le processus principal doit connaître les heures de sommeil
  // pour n'émettre aucune notification pendant celles-ci. Le renderer les
  // pousse dès qu'il charge — ou les modifie — les paramètres.
  ipcMain.handle(IPC_CHANNELS.APP_SET_SLEEP_WINDOW, (_e, start: unknown, end: unknown) => {
    setSleepWindow(typeof start === 'string' ? start : undefined, typeof end === 'string' ? end : undefined)
  })

  // Le renderer décide du thème (il est seul à écouter le système et l'horloge)
  // mais ne peut pas repeindre le cadre natif. Une valeur inconnue est ignorée
  // plutôt que devinée : mieux vaut garder le cadre précédent qu'en inventer un.
  ipcMain.handle(IPC_CHANNELS.APP_SET_THEME, (_e, theme: unknown) => {
    if (theme !== 'light' && theme !== 'dark') return
    setMainProcessTheme(theme)
    const win = getMainWindow()
    if (win) applyThemeToWindow(win, theme)
  })

  // D.7/D.8 : la confirmation « Je commence » vient de la fenêtre d'overlay,
  // pas de la fenêtre principale — le blockId identifie le bloc sans ambiguïté.
  ipcMain.handle(IPC_CHANNELS.PLANNING_CONFIRM_BLOCK, (_e, blockId: unknown) =>
    typeof blockId === 'string'
      ? confirmBlock(blockId)
      : { ok: false, reason: 'blockId invalide.' },
  )

  // ─── Blocage intelligent par IA ──────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.INTELLIGENT_BLOCKING_GET_KNOWLEDGE, async () => {
    const res = await storage.read('app_knowledge')
    return res ?? { profiles: {} }
  })

  ipcMain.handle(
    IPC_CHANNELS.INTELLIGENT_BLOCKING_DECIDE,
    async (_e, args: { title: string; plan: string; detectedApps?: Array<{ identifiant: string; nom_affiche: string; publisher?: string; isProtected?: boolean }> }) => {
      // `title` et `plan` ne servent plus : la couche qui les interprétait a été
      // supprimée le 2026-09-11. Ils restent dans la signature pour que l'appelant
      // n'ait pas à changer quand elle reviendra.
      // Réutilisation de la détection existante d'applications installées (app-catalog / app-discovery.ts:126)
      const rawDetected = args.detectedApps && args.detectedApps.length > 0
        ? args.detectedApps
        : (await getAppCatalog()).map((a) => {
            const isSharedBrowserApp =
              a.exeName &&
              (a.exeName.toLowerCase() === 'chrome.exe' || a.exeName.toLowerCase() === 'msedge.exe') &&
              a.name.toLowerCase() !== 'google chrome' &&
              a.name.toLowerCase() !== 'microsoft edge'

            return {
              identifiant: isSharedBrowserApp ? a.name : (a.exeName || a.name),
              nom_affiche: a.name,
              publisher: a.publisher,
              category: a.category,
              iconDataUrl: a.iconDataUrl,
              isProtected: a.isProtected,
            }
          })

      const seenCatalogNames = new Set<string>()
      const detected = rawDetected.filter((a) => {
        if (a.isProtected || isProtectedApp({ name: a.nom_affiche, exeName: a.identifiant })) return false
        if (isNonUserSystemHelper(a.nom_affiche, a.identifiant)) return false
        const key = a.nom_affiche.trim().toLowerCase()
        if (seenCatalogNames.has(key)) return false
        seenCatalogNames.add(key)
        return true
      })

      const existingBase = (await storage.read('app_knowledge')) ?? { profiles: {} }

      // COUCHE DE DECISION SUPPRIMEE le 2026-09-11, a la demande de l'utilisateur.
      // Le catalogue, la recherche web et le moteur ALLOW/BLOCK sont a reconstruire.
      // En attendant, on ne bloque RIEN : « je ne sais pas » ne vaut pas « distraction ».
      void detected
      void existingBase
      return {
        blockedApps: [],
        allowedApps: [],
        reasoning: "Couche de decision supprimee : aucune application n'est bloquee.",
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.INTELLIGENT_BLOCKING_REVIEW_REQUEST,
    async (
      _e,
      args: {
        title: string
        plan: string
        identifiant: string
        action: 'add' | 'remove'
        userJustification?: string
      },
    ) => {
      const { title, plan, identifiant, action, userJustification } = args
      const existingBase = (await storage.read('app_knowledge')) ?? { profiles: {} }
      const key = identifiant.trim().toLowerCase()
      const appProfile = existingBase.profiles[key]

      if (!appProfile) {
        return {
          accepted: false,
          reason: `Application inconnue dans la base de connaissances.`,
        }
      }

      // COUCHE DE DECISION SUPPRIMEE : plus personne pour arbitrer cette demande.
      void title; void plan; void appProfile; void action; void userJustification
      return {
        accepted: false,
        reason: "Couche de decision supprimee : aucun arbitrage automatique disponible.",
      }
    },
  )

  await registerAppUsageHandlers(storage, getMainWindow)
}
