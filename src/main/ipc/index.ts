import { ipcMain, app, shell, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@shared/storage'
import { z } from 'zod'
import { STOP_REASONS, type StopReason } from '@shared/schemas'
import type { OptionRattrapage, StopResult, TrustView } from '@shared/planning/trust'

const StopBlockArgsSchema = z
  .object({
    reason: z.enum(STOP_REASONS).nullable(),
    text: z.string().max(500).optional(),
    answerMs: z.number().int().min(0).max(3_600_000).optional(),
    counterOfferRefused: z.boolean().optional(),
  })
  .strict()
import log, { getLogFilePath } from '@main/logging/setup'
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

export type ConfirmBlockResult = { ok: true; help?: string } | { ok: false; reason: string }

export type StopBlockArgs = { reason: StopReason | null; text?: string; answerMs?: number; counterOfferRefused?: boolean }

/** Prolongation et jours libres : servis par l'horloge de planification. */
export type SessionExtras = {
  extensionOffer: () => Promise<{ minutes: number } | null>
  acceptExtension: () => Promise<ConfirmBlockResult>
  freeDay: () => Promise<string | null>
  decideFreeDay: (date: string, decision: 'taken' | 'kept') => Promise<void>
  trust: () => Promise<TrustView>
  waiveStop: () => Promise<void>
  promise: (option: OptionRattrapage, minutes: number, source: { kind: 'task' | 'objective' | 'ancre'; refId: string; blockId: string }) => Promise<void>
  emergency: (apps: string[]) => Promise<ConfirmBlockResult>
  breather: (blockId?: string) => Promise<ConfirmBlockResult>
  resume: () => Promise<void>
}

const TrustArgsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get') }),
  z.object({ action: z.literal('waive') }),
  z.object({
    action: z.literal('promise'),
    option: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startMinute: z.number().int().min(0).max(1439) }),
    minutes: z.number().int().min(1).max(600),
    source: z.object({ kind: z.enum(['task', 'objective', 'ancre']), refId: z.string().min(1), blockId: z.string().min(1) }),
  }),
  z.object({ action: z.literal('emergency'), apps: z.array(z.string().min(1)).max(3) }),
  z.object({ action: z.literal('breather'), blockId: z.string().min(1).optional() }),
  z.object({ action: z.literal('resume') }),
])

const ExtensionArgsSchema = z.object({ action: z.enum(['offer', 'accept']) })
const FreeDayArgsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get') }),
  z.object({
    action: z.literal('decide'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    decision: z.enum(['taken', 'kept']),
  }),
])

export async function registerAllIpcHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
  getBlockingSession: () => BlockingSessionState,
  confirmBlock: (blockId: string) => Promise<ConfirmBlockResult>,
  stopBlock: (args: StopBlockArgs) => Promise<StopResult> = async () => ({ ok: false, reason: 'Indisponible.' }),
  extras: SessionExtras | null = null,
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

  // « Stop » pendant une séance (spec moteur 2026-09-25) : une raison en un
  // tap, un texte optionnel. Validé ici — rien de la fenêtre n'est cru tel quel.
  ipcMain.handle(IPC_CHANNELS.PLANNING_STOP_BLOCK, (_e, raw: unknown) => {
    const parsed = StopBlockArgsSchema.safeParse(raw)
    return parsed.success ? stopBlock(parsed.data) : { ok: false, reason: 'Arrêt invalide.' }
  })

  // Prolongation : l'offre des 2 dernières minutes, puis le « Oui ».
  ipcMain.handle(IPC_CHANNELS.PLANNING_EXTENSION, async (_e, raw: unknown) => {
    const parsed = ExtensionArgsSchema.safeParse(raw)
    if (!parsed.success || !extras) return null
    return parsed.data.action === 'offer' ? extras.extensionOffer() : extras.acceptExtension()
  })

  // Jours libres : le jour proposable, puis la décision de la personne.
  ipcMain.handle(IPC_CHANNELS.PLANNING_FREE_DAY, async (_e, raw: unknown) => {
    const parsed = FreeDayArgsSchema.safeParse(raw)
    if (!parsed.success || !extras) return null
    if (parsed.data.action === 'get') return extras.freeDay()
    await extras.decideFreeDay(parsed.data.date, parsed.data.decision)
    return null
  })

  // Stop, promesses et confiance : l'état, puis chaque geste, validés ici.
  ipcMain.handle(IPC_CHANNELS.PLANNING_TRUST, async (_e, raw: unknown) => {
    const parsed = TrustArgsSchema.safeParse(raw)
    if (!parsed.success || !extras) return null
    const a = parsed.data
    switch (a.action) {
      case 'get':
        return extras.trust()
      case 'waive':
        await extras.waiveStop()
        return null
      case 'promise':
        await extras.promise(a.option, a.minutes, a.source)
        return null
      case 'emergency':
        return extras.emergency(a.apps)
      case 'breather':
        return extras.breather(a.blockId)
      case 'resume':
        await extras.resume()
        return null
    }
  })

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

      // La couche qui décidait AUTOMATIQUEMENT quoi bloquer a été supprimée le
      // 2026-09-11. On ne la remplace pas par une devinette : rien n'est bloqué
      // d'office, et l'utilisateur désigne lui-même ce qui le distrait.
      //
      // Sans cela l'application ne pouvait plus rien bloquer du tout : les deux
      // listes revenaient vides, chaque tâche était créée avec `appsToBlock: []`,
      // et il n'existe aucun autre écran pour choisir des applications.
      //
      // Toutes les applications partent donc du côté « autorisé » — c'est l'état
      // de départ honnête — et l'utilisateur déplace vers « bloqué » ce qu'il veut
      // écarter. Sa décision est la source la plus sûre qui soit : elle ne se
      // devine pas.
      return {
        blockedApps: [],
        allowedApps: detected.map((a) => ({
          ...a,
          raison: 'Autorisée par défaut — à toi de désigner ce qui te distrait.',
        })),
        reasoning:
          'Rien n’est bloqué d’office. Choisis les applications à écarter pendant cette tâche.',
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
      const { identifiant, action } = args

      // Il n'y a plus d'arbitre automatique, et c'est très bien ainsi : personne
      // n'est mieux placé que l'utilisateur pour dire ce qui le distrait d'une
      // tâche qu'il vient lui-même d'écrire.
      //
      // Cette demande était refusée deux fois — d'abord parce que la base de
      // connaissances était vide, ensuite parce que l'arbitre n'existait plus.
      // Aucune application ne pouvait donc passer du côté « bloqué ».
      //
      // Un garde subsiste, et c'est le seul qui compte : on ne bloque jamais un
      // outil système, quoi que demande l'utilisateur.
      if (action === 'add' && isProtectedApp({ name: identifiant, exeName: identifiant })) {
        log.warn('[blocage] refus de bloquer un outil système protégé', { identifiant })
        return {
          accepted: false,
          reason: "C'est un outil du système : Vethos ne le bloquera jamais.",
        }
      }

      return {
        accepted: true,
        reason:
          action === 'add'
            ? 'Bloquée pendant cette tâche, parce que tu l’as décidé.'
            : 'Autorisée pendant cette tâche, parce que tu l’as décidé.',
      }
    },
  )

  await registerAppUsageHandlers(storage, getMainWindow)
}
