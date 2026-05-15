/**
 * site-tracker.ts
 *
 * Surveille le titre de la fenêtre active pour détecter les sites visités
 * dans les navigateurs. Enregistre automatiquement les domaines dans
 * nexus_discovered_sites.json sans que l'utilisateur ait à les taper.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { scanBrowserHistoryDomains } from './browser-history'

const execAsync = promisify(exec)

const BROWSER_PROCESSES = new Set([
  'chrome.exe', 'firefox.exe', 'msedge.exe', 'brave.exe',
  'opera.exe', 'vivaldi.exe', 'iexplore.exe',
])

export type SiteEvent = {
  domain: string
  windowTitle: string
}

export type SiteTracker = {
  start: () => void
  stop: () => void
  on: (event: 'site-detected', cb: (e: SiteEvent) => void) => void
}

/**
 * Extrait le domaine d'un titre de navigateur.
 * Les navigateurs affichent typiquement : "Page Title - Site Name — Browser"
 * Ou parfois l'URL dans le titre.
 */
function extractDomainFromTitle(title: string): string | null {
  // Essayer de trouver une URL dans le titre
  const urlMatch = title.match(/https?:\/\/([^/\s]+)/)
  if (urlMatch?.[1]) {
    return cleanDomain(urlMatch[1])
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

/**
 * Récupère le titre de la fenêtre active et le processus via PowerShell.
 */
async function getActiveWindow(): Promise<{ title: string; processName: string } | null> {
  try {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class Win32 {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        }
"@
      $hwnd = [Win32]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder 512
      [Win32]::GetWindowText($hwnd, $sb, 512) | Out-Null
      $title = $sb.ToString()
      $pid = 0
      [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
      $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
      @{ title = $title; process = $proc.ProcessName + '.exe' } | ConvertTo-Json
    `
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
      { windowsHide: true, timeout: 5000 },
    )
    const parsed = JSON.parse(stdout || '{}')
    if (parsed.title && parsed.process) {
      return { title: String(parsed.title), processName: String(parsed.process).toLowerCase() }
    }
  } catch {
    // Ignore errors
  }
  return null
}

export function createSiteTracker(): SiteTracker {
  let timer: ReturnType<typeof setInterval> | null = null
  let historyTimer: ReturnType<typeof setInterval> | null = null
  const listeners: Array<(e: SiteEvent) => void> = []
  const recentDomains = new Set<string>() // Éviter les doublons dans les 30 dernières secondes

  async function scanHistory(): Promise<void> {
    const domains = await scanBrowserHistoryDomains().catch(() => [])
    for (const domain of domains) {
      if (recentDomains.has(domain)) continue
      recentDomains.add(domain)
      setTimeout(() => recentDomains.delete(domain), 300_000)
      for (const cb of listeners) {
        cb({ domain, windowTitle: 'Historique navigateur' })
      }
    }
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(async () => {
        const win = await getActiveWindow()
        if (!win) return

        // Vérifier si c'est un navigateur
        if (!BROWSER_PROCESSES.has(win.processName)) return

        const domain = extractDomainFromTitle(win.title)
        if (!domain) return
        if (recentDomains.has(domain)) return

        recentDomains.add(domain)
        // Nettoyer après 30 secondes
        setTimeout(() => recentDomains.delete(domain), 30_000)

        for (const cb of listeners) {
          cb({ domain, windowTitle: win.title })
        }
      }, 3000)
      void scanHistory()
      historyTimer = setInterval(() => {
        void scanHistory()
      }, 300_000)
    },

    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (historyTimer) {
        clearInterval(historyTimer)
        historyTimer = null
      }
    },

    on(_, cb) {
      listeners.push(cb)
    },
  }
}
