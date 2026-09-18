import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import {
  DEFAULT_DARK_AT,
  DEFAULT_LIGHT_AT,
  DEFAULT_THEME_MODE,
  nextThemeFlip,
  resolveTheme,
  type Theme,
  type ThemeDecision,
  type ThemeMode,
} from '@shared/theme'
import { nexus } from './ipc'

/**
 * Ce qui APPLIQUE le thème. La règle qui le calcule vit dans `shared/theme.ts`.
 *
 * Trois choses doivent bouger ensemble à chaque bascule, et une seule ne suffit
 * jamais : l'attribut sur `<html>` (le CSS), le cadre natif de la fenêtre (le
 * processus principal), et le miroir local (la prochaine ouverture).
 */

const MIRROR_KEY = 'vethos.theme'

type Mirror = { mode: ThemeMode; lightAt: string; darkAt: string }

/**
 * Le miroir local.
 *
 * Les réglages vivent dans un fichier JSON lu par IPC — donc de façon
 * asynchrone, donc APRÈS le premier rendu. Sans copie synchrone, une
 * installation réglée en sombre commencerait chaque ouverture par un éclair
 * clair, le temps que la lecture revienne. `localStorage` n'est pas la source
 * de vérité : c'est un raccourci qu'on réécrit dès que la vraie source parle.
 */
function readMirror(): Mirror {
  const fallback: Mirror = {
    mode: DEFAULT_THEME_MODE,
    lightAt: DEFAULT_LIGHT_AT,
    darkAt: DEFAULT_DARK_AT,
  }
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Mirror>
    return {
      mode: parsed.mode ?? fallback.mode,
      lightAt: parsed.lightAt ?? fallback.lightAt,
      darkAt: parsed.darkAt ?? fallback.darkAt,
    }
  } catch {
    // Miroir illisible : le défaut vaut mieux qu'un écran non peint.
    return fallback
  }
}

function writeMirror(mirror: Mirror): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(mirror))
  } catch {
    // Stockage refusé : on perd le raccourci, pas le réglage.
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Pose le thème sur le document. Retourne `true` si quelque chose a changé. */
function paint(theme: Theme, animate: boolean): boolean {
  const root = document.documentElement
  if (root.dataset['theme'] === theme) return false

  if (animate) {
    root.setAttribute('data-theme-switching', '')
    window.setTimeout(() => root.removeAttribute('data-theme-switching'), 300)
  }
  root.dataset['theme'] = theme
  return true
}

/**
 * À appeler AVANT le premier rendu de React (cf. `main.tsx`).
 *
 * Sans animation : au démarrage il n'y a rien à faire glisser, et une
 * transition sur un écran encore vide se voit comme un défaut.
 */
export function bootTheme(): void {
  const mirror = readMirror()
  paint(
    resolveTheme(
      {
        mode: mirror.mode,
        systemDark: systemPrefersDark(),
        schedule: { lightAt: mirror.lightAt, darkAt: mirror.darkAt },
      },
      new Date(),
    ),
    false,
  )
}

/**
 * Le thème réellement affiché, pour le peu de code qui doit le SAVOIR.
 *
 * Presque tout s'en passe : une classe Tailwind pointe vers un jeton qui se
 * réécrit tout seul. Ce hook n'existe que pour les couleurs stockées en dur
 * dans les données (cf. `lib/palette.ts`), qu'il faut recalculer en JavaScript.
 *
 * Il lit l'attribut du document plutôt que les réglages : c'est la seule source
 * qui soit vraie aussi dans les fenêtres d'overlay, et elle intègre déjà la
 * règle du système comme celle de l'heure.
 */
export function useResolvedTheme(): Theme {
  const subscribe = useCallback((onChange: () => void) => {
    const observer = new MutationObserver(onChange)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light'),
    () => 'light' as const,
  )
}

export type UseThemeArgs = {
  mode: ThemeMode
  lightAt: string
  darkAt: string
  /** Tant que les réglages ne sont pas lus, on ne réécrit pas le miroir. */
  loaded: boolean
}

/**
 * Maintient le thème à jour tant que la fenêtre est ouverte.
 *
 * Deux choses peuvent le faire changer sans que l'utilisateur touche à rien :
 * le système d'exploitation, et l'heure. On écoute le premier, et on pose un
 * minuteur exactement sur la prochaine bascule pour la seconde — pas un
 * intervalle d'une minute qui, 1 439 fois par jour, n'apprend rien.
 */
export function useTheme({ mode, lightAt, darkAt, loaded }: UseThemeArgs): void {
  // Le tout premier passage ne doit pas s'animer : `bootTheme` a déjà peint le
  // bon écran, et animer une bascule qui n'a pas lieu ferait clignoter.
  const settled = useRef(false)

  useEffect(() => {
    const decision = (): ThemeDecision => ({
      mode,
      systemDark: systemPrefersDark(),
      schedule: { lightAt, darkAt },
    })

    let flipTimer: number | undefined

    const apply = (): void => {
      const theme = resolveTheme(decision(), new Date())
      paint(theme, settled.current)
      settled.current = true
      // Envoyé à chaque passage, même sans changement d'attribut : l'appel est
      // idempotent, et une fenêtre rouverte après un `hide()` doit retrouver sa
      // barre de titre même si le document, lui, n'a jamais changé de thème.
      void nexus.app.setTheme(theme).catch(() => undefined)

      // Un seul minuteur, posé sur la bascule suivante, reprogrammé à chaque
      // fois. `setTimeout` ne garantit rien après une mise en veille : on vise
      // au plus 30 minutes d'avance pour que le réveil recalcule vite.
      window.clearTimeout(flipTimer)
      const flip = nextThemeFlip(decision(), new Date())
      if (flip) {
        const delay = Math.min(Math.max(flip.getTime() - Date.now(), 1_000), 30 * 60_000)
        flipTimer = window.setTimeout(apply, delay)
      } else {
        flipTimer = undefined
      }
    }

    apply()
    if (loaded) writeMirror({ mode, lightAt, darkAt })

    // Le système ne prévient qu'en mode `system`, mais l'écoute reste posée :
    // l'utilisateur peut revenir sur ce mode sans recharger la fenêtre.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)

    // Sortie de veille : l'ordinateur a pu dormir de midi à minuit sans que le
    // minuteur se déclenche. `visibilitychange` et `focus` sont les deux
    // moments où l'écran redevient regardé — donc où il doit être juste.
    document.addEventListener('visibilitychange', apply)
    window.addEventListener('focus', apply)

    return () => {
      window.clearTimeout(flipTimer)
      media.removeEventListener('change', apply)
      document.removeEventListener('visibilitychange', apply)
      window.removeEventListener('focus', apply)
    }
  }, [mode, lightAt, darkAt, loaded])
}
