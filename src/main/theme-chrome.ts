import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import type { Theme } from '@shared/theme'

/**
 * Le cadre natif de la fenêtre.
 *
 * Le CSS s'arrête au bord du document : ni le fond que Chromium peint avant le
 * premier rendu, ni les boutons réduire/agrandir/fermer ne l'écoutent. Sans ce
 * fichier, choisir le thème sombre laisse deux traces claires — un éclair blanc
 * à l'ouverture, et une barre système qui ne suit pas.
 *
 * Les valeurs doublent volontairement `--bg`, `--text-2` et `--line` de
 * `globals.css` : le processus principal ne peut pas lire une variable CSS. Les
 * garder ici, nommées et commentées, vaut mieux que de faire dire au renderer
 * une couleur qu'il pourrait envoyer fausse ou trop tard.
 */

type Chrome = {
  /** Peint par Chromium avant le premier rendu, et derrière la fenêtre. */
  background: string
  /** La barre de titre fait partie du hall : même fond, aucune boîte visible. */
  titleBar: string
  /** Les glyphes des boutons système. */
  symbol: string
}

const CHROME: Record<Theme, Chrome> = {
  light: { background: '#e6e6e6', titleBar: '#e6e6e6', symbol: '#4e4e4e' },
  dark: { background: '#000000', titleBar: '#000000', symbol: '#bebebe' },
}

export const TITLE_BAR_HEIGHT = 36

/**
 * Le thème connu du processus principal.
 *
 * Il vit ici, et pas dans `index.ts`, pour que le gestionnaire IPC puisse le
 * mettre à jour sans importer le module qui l'importe déjà. Le renderer reste
 * l'autorité — c'est lui qui écoute le système et l'horloge — mais il parle
 * trop tard pour la toute première peinture de la fenêtre.
 */
let currentTheme: Theme = 'light'

export function getMainProcessTheme(): Theme {
  return currentTheme
}

export function setMainProcessTheme(theme: Theme): void {
  currentTheme = theme
}

/** Les options de fenêtre à passer au constructeur, pour éviter l'éclair. */
export function themeWindowOptions(
  theme: Theme,
): Pick<BrowserWindowConstructorOptions, 'backgroundColor' | 'titleBarOverlay'> {
  const chrome = CHROME[theme]
  return {
    backgroundColor: chrome.background,
    titleBarOverlay: {
      color: chrome.titleBar,
      symbolColor: chrome.symbol,
      height: TITLE_BAR_HEIGHT,
    },
  }
}

/**
 * Repeint une fenêtre déjà ouverte.
 *
 * `setTitleBarOverlay` n'existe que là où une barre de titre superposée existe
 * (Windows, Linux). Ailleurs, l'absence de barre à repeindre n'est pas une
 * erreur : le fond suffit, et l'échec ne doit pas empêcher la bascule.
 */
export function applyThemeToWindow(win: BrowserWindow, theme: Theme): void {
  if (win.isDestroyed()) return
  const chrome = CHROME[theme]
  win.setBackgroundColor(chrome.background)
  try {
    win.setTitleBarOverlay({
      color: chrome.titleBar,
      symbolColor: chrome.symbol,
      height: TITLE_BAR_HEIGHT,
    })
  } catch {
    // Pas de barre superposée sur cette plateforme.
  }
}
