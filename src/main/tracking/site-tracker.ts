/**
 * site-tracker.ts
 *
 * Surveille le titre de la fenêtre active pour détecter les sites visités
 * dans les navigateurs. Enregistre automatiquement les domaines dans
 * vethos_discovered_sites.json sans que l'utilisateur ait à les taper.
 */

import log from '@main/logging/setup'
import type {
  ScrapedPageMetadata,
  SemanticActiveTask,
  SemanticValidationPayload,
  SemanticValidationResult,
} from '@shared/deepseek'
import { scanBrowserHistoryDomains } from './browser-history'
import { getVisibleWindowInfos } from './process-window-probe'

const DEFAULT_HEARTBEAT_MS = 350
const SEMANTIC_GRANT_MS = 10 * 60_000
const STRICT_BLOCK_COOLDOWN_MS = 60_000

const BROWSER_PROCESSES = new Set([
  'arc.exe',
  'brave.exe',
  'browser.exe',
  'chrome.exe',
  'chromium.exe',
  'comet.exe',
  'duckduckgo.exe',
  'firefox.exe',
  'googlechrome.exe',
  'iexplore.exe',
  'msedge.exe',
  'opera.exe',
  'opera_gx.exe',
  'perplexity.exe',
  'thorium.exe',
  'vivaldi.exe',
])

const NON_BROWSER_PROCESSES = new Set([
  'applicationframehost.exe',
  'codex.exe',
  'electron.exe',
  'explorer.exe',
  'nexus.exe',
  'searchhost.exe',
  'vethos.exe',
])

export type SiteEvent = {
  domain: string
  windowTitle: string
  processName?: string
  pid?: number
  windowId?: string
  url?: string
  title?: string
  metaDescription?: string
  metaKeywords?: string
  semanticStatus?: 'unknown' | 'allowed' | 'blocked'
}

export type SiteTracker = {
  start: () => void
  stop: () => void
  on: (event: 'site-detected', cb: (e: SiteEvent) => void) => void
}

export type SemanticSiteTrackerDeps = {
  heartbeatMs?: number
  scanHistoryEnabled?: boolean
  getActiveTask?: () => Promise<SemanticActiveTask | null>
  hasActiveSession?: () => Promise<boolean>
  evaluateSiteAccessDirect?: (
    activeTask: SemanticActiveTask | null,
    metadata: ScrapedPageMetadata,
  ) => Promise<{ allowed: boolean; reason: string }>
  evaluateSemanticAccess?: (
    payload: SemanticValidationPayload,
  ) => Promise<SemanticValidationResult>
  requestJustification?: (args: {
    metadata: ScrapedPageMetadata
    activeTask: SemanticActiveTask
  }) => Promise<string | null>
  onActiveBrowserWindow?: (args: {
    domain: string | null
    windowTitle: string
    processName: string
    pid: number
    windowId: string
  }) => void | Promise<void>
  onVisibleBrowserWindows?: (windowIds: string[]) => void | Promise<void>
  onStrictBlock?: (args: {
    metadata: ScrapedPageMetadata
    activeTask: SemanticActiveTask
    decision: SemanticValidationResult
  }) => void
}

/**
 * Extrait le domaine d'un titre de navigateur.
 * Les navigateurs affichent typiquement : "Page Title - Site Name — Browser"
 * Ou parfois l'URL dans le titre.
 */
export function extractDomainFromTitle(title: string): string | null {
  // Essayer de trouver une URL dans le titre
  const urlMatch = title.match(/https?:\/\/([^/\s]+)/)
  if (urlMatch?.[1]) {
    return cleanDomain(urlMatch[1])
  }

  const bareDomainMatch = title.match(
    /\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?::\d+)?\b/i,
  )
  if (bareDomainMatch?.[1]) {
    return cleanDomain(bareDomainMatch[1])
  }

  // Pattern courant : "... - YouTube — Mozilla Firefox"
  // On cherche le nom du site avant le tiret du navigateur
  const parts = title.split(/\s[—–-]\s/)
  if (parts.length >= 2) {
    // Le dernier segment est souvent le nom du navigateur
    // L'avant-dernier est souvent le nom du site
    const sitePart = parts[parts.length - 2]?.trim()
    if (sitePart) {
      const known = matchKnownSite(sitePart)
      if (known) return known
    }
  }

  // Si le titre lui-même ressemble à un domaine
  const cleaned = cleanDomain(title)
  const known = matchKnownSite(cleaned)
  if (known) return known

  return null
}

/** Map de noms courants vers domaines */
const KNOWN_SITES: Record<string, string> = {
  'youtube': 'youtube.com',
  'twitter': 'twitter.com',
  'x': 'x.com',
  'facebook': 'facebook.com',
  'instagram': 'instagram.com',
  'reddit': 'reddit.com',
  'tiktok': 'tiktok.com',
  'twitch': 'twitch.tv',
  'netflix': 'netflix.com',
  'discord': 'discord.com',
  'github': 'github.com',
  'stackoverflow': 'stackoverflow.com',
  'stack overflow': 'stackoverflow.com',
  'linkedin': 'linkedin.com',
  'whatsapp': 'web.whatsapp.com',
  'telegram': 'web.telegram.org',
  'amazon': 'amazon.com',
  'ebay': 'ebay.com',
  'wikipedia': 'wikipedia.org',
  'google': 'google.com',
  'gmail': 'mail.google.com',
  'outlook': 'outlook.live.com',
  'pinterest': 'pinterest.com',
  'snapchat': 'web.snapchat.com',
  'spotify': 'open.spotify.com',
}

function matchKnownSite(text: string): string | null {
  const lower = text.toLowerCase().trim()
  for (const [key, domain] of Object.entries(KNOWN_SITES)) {
    if (lower === key || lower.includes(key)) {
      return domain
    }
  }
  // Essayer si ça ressemble à un domaine
  if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(lower)) {
    return lower
  }
  return null
}

function cleanDomain(raw: string): string {
  return raw.replace(/^www\./, '').toLowerCase().trim()
}

export function isTrackableBrowserWindow(window: {
  title: string
  processName: string
  minimized?: boolean
}): boolean {
  if (!window.title || window.minimized) return false
  const processName = window.processName.toLowerCase().trim()
  if (BROWSER_PROCESSES.has(processName)) return true
  if (NON_BROWSER_PROCESSES.has(processName)) return false

  // Comet et d'autres navigateurs Chromium récents ne sont pas toujours dans
  // notre liste. Si leur titre expose un domaine réel (ex: instagram.com), on
  // les traite quand même comme une fenêtre web au lieu d'ignorer le blocage.
  return extractDomainFromTitle(window.title) !== null
}

async function getVisibleBrowserWindows(): Promise<Array<{
  title: string
  processName: string
  pid: number
  windowId: string
}>> {
  const windows = await getVisibleWindowInfos()
  return windows
    .filter((window) => isTrackableBrowserWindow(window))
    .map((window) => ({
      title: window.title,
      processName: window.processName,
      pid: window.pid,
      windowId: window.windowId,
    }))
}

function canonicalUrlForDomain(domain: string, title: string): string {
  const match = title.match(/https?:\/\/[^\s]+/i)
  if (match?.[0]) return match[0]
  return `https://${domain}/`
}

function textFromHtmlMeta(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      'i',
    )
    const match = html.match(re)
    if (match?.[1]) return decodeHtml(match[1]).slice(0, 1000)
  }
  return undefined
}

function titleFromHtml(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match?.[1]) return undefined
  return decodeHtml(match[1].replace(/\s+/g, ' ').trim()).slice(0, 500)
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

async function scrapeMetadata(domain: string, windowTitle: string): Promise<ScrapedPageMetadata> {
  const url = canonicalUrlForDomain(domain, windowTitle)
  const fallback: ScrapedPageMetadata = {
    url,
    domain,
    title: windowTitle || domain,
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'VethosFocusGuard/1.0',
      },
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.toLowerCase().includes('text/html')) return fallback
    const html = (await response.text()).slice(0, 120_000)
    return {
      url,
      domain,
      title: titleFromHtml(html) ?? windowTitle ?? domain,
      description: textFromHtmlMeta(html, ['description', 'og:description']),
      keywords: textFromHtmlMeta(html, ['keywords']),
    }
  } catch {
    return fallback
  } finally {
    clearTimeout(timeout)
  }
}

function tokenize(value: string | undefined): Set<string> {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'une', 'des', 'les', 'pour',
    'dans', 'avec', 'sur', 'task', 'tache', 'site',
  ])
  return new Set(
    (value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !stop.has(token)),
  )
}

function lexicalCoherenceScore(activeTask: SemanticActiveTask, metadata: ScrapedPageMetadata): number {
  const taskTokens = tokenize([
    activeTask.title,
    activeTask.objectiveName,
    ...(activeTask.allowedDomains ?? []),
  ].join(' '))
  if (taskTokens.size === 0) return 0
  const pageTokens = tokenize([
    metadata.domain,
    metadata.title,
    metadata.description,
    metadata.keywords,
  ].join(' '))
  let overlap = 0
  for (const token of taskTokens) {
    if (pageTokens.has(token)) overlap += 1
  }
  return Math.min(10, (overlap / Math.max(1, taskTokens.size)) * 10)
}

function domainMatches(domain: string, allowed: string): boolean {
  const clean = cleanDomain(domain)
  const allowedClean = cleanDomain(allowed)
  return clean === allowedClean || clean.endsWith(`.${allowedClean}`)
}

function isAllowedByFocusContext(domain: string, task: SemanticActiveTask): boolean {
  return (task.allowedDomains ?? []).some((allowed) => domainMatches(domain, allowed))
}

function fallbackDecision(score: number): SemanticValidationResult {
  return {
    intentionScore: score,
    truthScore: score,
    totalScore: score,
    allowed: score >= 7,
    allowMinutes: score >= 7 ? 10 : 0,
    reason:
      score >= 7
        ? 'Local metadata matched the active task.'
        : 'This site has no clear semantic relation to the active task.',
  }
}

export function createSiteTracker(deps: SemanticSiteTrackerDeps = {}): SiteTracker {
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners: Array<(e: SiteEvent) => void> = []
  const recentDomains = new Set<string>() // Éviter les doublons dans les 30 dernières secondes
  const semanticGrants = new Map<string, number>()
  const strictBlockCooldowns = new Map<string, number>()
  let semanticCheck: Promise<void> = Promise.resolve()

  async function scanHistory(): Promise<void> {
    const domains = await scanBrowserHistoryDomains().catch(() => [])
    for (const domain of domains) {
      if (recentDomains.has(domain)) continue
      recentDomains.add(domain)
      setTimeout(() => recentDomains.delete(domain), 300_000)
      for (const cb of listeners) cb({ domain, windowTitle: 'Historique navigateur' })
    }
  }

  async function evaluateSite(domain: string, windowTitle: string): Promise<SiteEvent> {
    const metadata = await scrapeMetadata(domain, windowTitle)
    const activeTask = await deps.getActiveTask?.()
    if (!activeTask) {
      return {
        domain,
        windowTitle,
        url: metadata.url,
        title: metadata.title,
        metaDescription: metadata.description,
        metaKeywords: metadata.keywords,
        semanticStatus: 'unknown',
      }
    }

    if (isAllowedByFocusContext(domain, activeTask)) {
      return {
        domain,
        windowTitle,
        url: metadata.url,
        title: metadata.title,
        metaDescription: metadata.description,
        metaKeywords: metadata.keywords,
        semanticStatus: 'allowed',
      }
    }

    const grantKey = `${activeTask.id ?? activeTask.title}|${domain}`
    if ((semanticGrants.get(grantKey) ?? 0) > Date.now()) {
      return {
        domain,
        windowTitle,
        url: metadata.url,
        title: metadata.title,
        metaDescription: metadata.description,
        metaKeywords: metadata.keywords,
        semanticStatus: 'allowed',
      }
    }

    const localScore = lexicalCoherenceScore(activeTask, metadata)
    if (localScore >= 8) {
      semanticGrants.set(grantKey, Date.now() + SEMANTIC_GRANT_MS)
      return {
        domain,
        windowTitle,
        url: metadata.url,
        title: metadata.title,
        metaDescription: metadata.description,
        metaKeywords: metadata.keywords,
        semanticStatus: 'allowed',
      }
    }

    if (deps.evaluateSiteAccessDirect) {
      try {
        const directResult = await deps.evaluateSiteAccessDirect(activeTask, metadata)
        if (directResult.allowed) {
          semanticGrants.set(grantKey, Date.now() + SEMANTIC_GRANT_MS)
          return {
            domain,
            windowTitle,
            url: metadata.url,
            title: metadata.title,
            metaDescription: metadata.description,
            metaKeywords: metadata.keywords,
            semanticStatus: 'allowed',
          }
        } else {
          if ((strictBlockCooldowns.get(grantKey) ?? 0) <= Date.now()) {
            strictBlockCooldowns.set(grantKey, Date.now() + STRICT_BLOCK_COOLDOWN_MS)
            const decision: SemanticValidationResult = {
              intentionScore: 0,
              truthScore: 0,
              totalScore: 0,
              allowed: false,
              allowMinutes: 0,
              reason: directResult.reason,
            }
            deps.onStrictBlock?.({ metadata, activeTask, decision })
          }
          return {
            domain,
            windowTitle,
            url: metadata.url,
            title: metadata.title,
            metaDescription: metadata.description,
            metaKeywords: metadata.keywords,
            semanticStatus: 'blocked',
          }
        }
      } catch (err) {
        log.warn('[site-tracker] direct evaluation failed, falling back to justification flow', err)
      }
    }

    const justification = await deps.requestJustification?.({ metadata, activeTask })
    const payload: SemanticValidationPayload = {
      active_task: activeTask,
      user_justification: justification ?? '',
      scraped_metadata: metadata,
    }
    let decision = fallbackDecision(localScore)
    if (deps.evaluateSemanticAccess && justification) {
      decision = await deps.evaluateSemanticAccess(payload).catch(() => fallbackDecision(localScore))
    }
    const validationScore = Math.min(decision.intentionScore, decision.truthScore)
    decision = {
      ...decision,
      totalScore: validationScore,
      allowed: validationScore >= 7,
      allowMinutes: validationScore >= 7 ? (decision.allowMinutes || 10) : 0,
    }

    if (decision.totalScore >= 7) {
      semanticGrants.set(grantKey, Date.now() + (decision.allowMinutes || 10) * 60_000)
      return {
        domain,
        windowTitle,
        url: metadata.url,
        title: metadata.title,
        metaDescription: metadata.description,
        metaKeywords: metadata.keywords,
        semanticStatus: 'allowed',
      }
    }

    if ((strictBlockCooldowns.get(grantKey) ?? 0) <= Date.now()) {
      strictBlockCooldowns.set(grantKey, Date.now() + STRICT_BLOCK_COOLDOWN_MS)
      deps.onStrictBlock?.({ metadata, activeTask, decision })
    }

    return {
      domain,
      windowTitle,
      url: metadata.url,
      title: metadata.title,
      metaDescription: metadata.description,
      metaKeywords: metadata.keywords,
      semanticStatus: 'blocked',
    }
  }

  function emitSiteEvent(event: SiteEvent): void {
    for (const cb of listeners) cb(event)
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(async () => {
        const hasSession = deps.hasActiveSession ? await deps.hasActiveSession() : true
        if (!hasSession) {
          void deps.onVisibleBrowserWindows?.([])
          return
        }

        const windows = await getVisibleBrowserWindows()
        void deps.onVisibleBrowserWindows?.(windows.map((window) => window.windowId))
        if (windows.length === 0) return

        for (const win of windows) {
          const domain = extractDomainFromTitle(win.title)
          void deps.onActiveBrowserWindow?.({
            domain,
            windowTitle: win.title,
            processName: win.processName,
            pid: win.pid,
            windowId: win.windowId,
          })
          if (!domain) continue
          if (recentDomains.has(domain)) continue

          recentDomains.add(domain)
          // Nettoyer après 30 secondes
          setTimeout(() => recentDomains.delete(domain), 30_000)

          semanticCheck = semanticCheck
            .catch(() => undefined)
            .then(async () => {
              const event = {
                ...(await evaluateSite(domain, win.title)),
                processName: win.processName,
                pid: win.pid,
                windowId: win.windowId,
              }
              log.info('[site-tracker] evaluated site event:', event)
              emitSiteEvent(event)
            })
        }
      }, deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS)
      if (deps.scanHistoryEnabled) {
        void scanHistory()
      }
    },

    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },

    on(_, cb) {
      listeners.push(cb)
    },
  }
}
