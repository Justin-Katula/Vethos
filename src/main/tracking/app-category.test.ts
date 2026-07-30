import { describe, it, expect } from 'vitest'
import {
  APP_CATEGORIES,
  CATEGORY_LABELS,
  categoriesPresentes,
  categorizeApp,
  type CategorisableApp,
} from './app-category'

function app(exeName: string, name = exeName, publisher = ''): CategorisableApp {
  return { exeName, name, publisher }
}

describe('categorizeApp — exécutables connus', () => {
  it('classe les applications sociales', () => {
    expect(categorizeApp(app('discord.exe', 'Discord'))).toBe('social')
    expect(categorizeApp(app('whatsapp.exe', 'WhatsApp'))).toBe('social')
  })

  it('classe les jeux et leurs lanceurs', () => {
    expect(categorizeApp(app('steam.exe', 'Steam'))).toBe('games')
    expect(categorizeApp(app('robloxplayerbeta.exe', 'Roblox'))).toBe('games')
  })

  it('classe Blender en création — pas en jeu malgré la 3D', () => {
    expect(categorizeApp(app('blender.exe', 'Blender'))).toBe('creativity')
  })

  it('classe Spotify en divertissement', () => {
    expect(categorizeApp(app('spotify.exe', 'Spotify'))).toBe('entertainment')
  })

  it('classe les éditeurs de code en productivité', () => {
    expect(categorizeApp(app('code.exe', 'Visual Studio Code'))).toBe('productivity')
    expect(categorizeApp(app('idea64.exe', 'IntelliJ IDEA'))).toBe('productivity')
  })

  it('classe les navigateurs en utilitaires', () => {
    expect(categorizeApp(app('chrome.exe', 'Google Chrome'))).toBe('utilities')
    expect(categorizeApp(app('firefox.exe', 'Firefox'))).toBe('utilities')
  })

  it('ignore la casse du nom d’exécutable', () => {
    expect(categorizeApp(app('DISCORD.EXE', 'Discord'))).toBe('social')
  })

  it('fait primer l’exécutable connu sur les mots-clés du nom', () => {
    // "Steam" contient "game" nulle part, mais surtout : meme si le nom
    // affiche etait trompeur, l'executable connu doit gagner.
    expect(categorizeApp(app('steam.exe', 'Bibliothèque vidéo'))).toBe('games')
  })
})

describe('categorizeApp — mots-clés', () => {
  it('reconnaît un lecteur vidéo inconnu', () => {
    expect(categorizeApp(app('zzplayer.exe', 'Super Video Player'))).toBe('entertainment')
  })

  it('reconnaît un outil de dessin inconnu', () => {
    expect(categorizeApp(app('zzdraw.exe', 'Pixel Paint Studio'))).toBe('creativity')
  })

  it('reconnaît une application de lecture inconnue', () => {
    expect(categorizeApp(app('zzread.exe', 'Mon lecteur PDF'))).toBe('reading')
  })

  it('reconnaît le français accentué', () => {
    expect(categorizeApp(app('zz1.exe', 'Gestionnaire de tâches perso'))).toBe('productivity')
    expect(categorizeApp(app('zz2.exe', 'Suivi de santé'))).toBe('health')
  })

  it('se rabat sur l’exécutable quand le nom ne dit rien', () => {
    expect(categorizeApp(app('mymusictool.exe', 'Zx9'))).toBe('entertainment')
  })
})

describe('categorizeApp — repli', () => {
  it('classe en Autres ce qui n’est pas reconnu', () => {
    expect(categorizeApp(app('zzqqxx.exe', 'Zzqqxx'))).toBe('others')
  })

  it('ne lève jamais sur une entrée vide', () => {
    expect(categorizeApp({ name: '', exeName: '' })).toBe('others')
  })

  it('rend toujours une catégorie déclarée', () => {
    for (const exemple of ['a.exe', 'Steam', '', 'Ω', '   ']) {
      expect(APP_CATEGORIES).toContain(categorizeApp(app(exemple, exemple)))
    }
  })
})

describe('catalogue', () => {
  it('a un libellé français pour chaque catégorie', () => {
    for (const categorie of APP_CATEGORIES) {
      expect(CATEGORY_LABELS[categorie]).toBeTruthy()
    }
  })

  it('garde « Autres » en dernier', () => {
    expect(APP_CATEGORIES[APP_CATEGORIES.length - 1]).toBe('others')
  })
})

describe('categoriesPresentes', () => {
  it('ne rend que les catégories réellement représentées', () => {
    expect(categoriesPresentes([app('discord.exe'), app('steam.exe')])).toEqual([
      'social',
      'games',
    ])
  })

  it('respecte l’ordre du catalogue, pas l’ordre des applications', () => {
    expect(categoriesPresentes([app('steam.exe'), app('discord.exe')])).toEqual([
      'social',
      'games',
    ])
  })

  it('place « Autres » en dernier même si rencontré en premier', () => {
    const resultat = categoriesPresentes([app('zzqqxx.exe'), app('discord.exe')])
    expect(resultat[resultat.length - 1]).toBe('others')
  })

  it('rend une liste vide sans application', () => {
    expect(categoriesPresentes([])).toEqual([])
  })
})
