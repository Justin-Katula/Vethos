import { describe, it, expect } from 'vitest'
import { verifierCandidat, choisirCandidat, type FaitsLocaux, type CandidatExterne } from './verification'

/**
 * VÉRIFICATION D'UN RÉSULTAT DE RECHERCHE.
 *
 * Le problème, posé par l'utilisateur : « comment mon application saura que ce
 * qu'elle a trouvé est vraiment la bonne application, et non une information venue
 * de nulle part ? »
 *
 * La réponse : on ne fait jamais confiance au résultat. On le confronte aux faits
 * que la machine détient déjà — l'éditeur inscrit dans le binaire, sa version, son
 * nom d'origine, son identité de paquet. Un résultat qui contredit ces faits est
 * rejeté, quelle que soit la ressemblance des noms.
 *
 * Les cas de rejet ci-dessous ne sont pas inventés : ce sont les résultats réels
 * renvoyés par la recherche floue de winget le 2026-09-11, sur cette machine.
 */

const local = (p: Partial<FaitsLocaux>): FaitsLocaux => ({
  nom: '', editeur: null, version: null, exeName: null,
  identitePaquet: null, protocoles: [], extensions: [], ...p,
})

const externe = (p: Partial<CandidatExterne>): CandidatExterne => ({
  nom: '', editeur: null, version: null, identitePaquet: null, description: null, ...p,
})

describe('vérification — les faux positifs réellement observés', () => {
  it('rejette Elm proposé pour Ollama : les éditeurs se contredisent', () => {
    const r = verifierCandidat(
      local({ nom: 'Ollama', editeur: 'Ollama', exeName: 'ollama.exe' }),
      externe({ nom: 'Elm', editeur: 'elm-lang.org' }),
    )
    expect(r.accepte).toBe(false)
    expect(r.contradictions.length).toBeGreaterThan(0)
  })

  it('rejette iQIYI proposé pour JDownloader 2', () => {
    const r = verifierCandidat(
      local({ nom: 'JDownloader 2', editeur: 'AppWork GmbH', exeName: 'JDownloader2.exe' }),
      externe({ nom: '爱奇艺', editeur: '爱奇艺' }),
    )
    expect(r.accepte).toBe(false)
  })

  it('rejette Virtual Magnifying Glass proposé pour Canva', () => {
    const r = verifierCandidat(
      local({ nom: 'Canva', editeur: 'Canva Pty Ltd', exeName: 'Canva.exe' }),
      externe({ nom: 'Virtual Magnifying Glass', editeur: 'The Virtual Magnifying Glass Team' }),
    )
    expect(r.accepte).toBe(false)
  })

  it('rejette Loom proposé pour LM Studio', () => {
    const r = verifierCandidat(
      local({ nom: 'LM Studio', exeName: 'LM Studio.exe' }),
      externe({ nom: 'Loom', editeur: 'Loom, Inc.' }),
    )
    expect(r.accepte).toBe(false)
  })

  it('rejette PokerTH proposé pour Armoury Crate', () => {
    const r = verifierCandidat(
      local({ nom: 'Armoury Crate', editeur: 'ASUSTeK COMPUTER INC.' }),
      externe({ nom: 'PokerTH', editeur: 'www.pokerth.net' }),
    )
    expect(r.accepte).toBe(false)
  })

  it('rejette Minecraft Dungeons II proposé pour Minecraft', () => {
    const r = verifierCandidat(
      local({ nom: 'Minecraft', editeur: 'Mojang' }),
      externe({ nom: 'Minecraft Dungeons II', editeur: 'Mojang Studios' }),
    )
    expect(r.accepte).toBe(false)
  })
})

describe('vérification — ce qui doit être accepté', () => {
  it('accepte sur identité de paquet identique, sans rien demander d’autre', () => {
    const r = verifierCandidat(
      local({ nom: 'Antigravity 2.12.2', identitePaquet: 'Google.Antigravity' }),
      externe({ nom: 'Antigravity', identitePaquet: 'Google.Antigravity', editeur: 'Google' }),
    )
    expect(r.accepte).toBe(true)
    expect(r.niveau).toBe('DECISIF')
  })

  it('accepte quand l’éditeur et la version concordent', () => {
    const r = verifierCandidat(
      local({ nom: 'Blender 5.0', editeur: 'Blender Foundation', version: '5.0' }),
      externe({ nom: 'Blender', editeur: 'Blender Foundation', version: '5.0' }),
    )
    expect(r.accepte).toBe(true)
  })

  it('accepte malgré les suffixes juridiques de l’éditeur', () => {
    const r = verifierCandidat(
      local({ nom: 'qBittorrent', editeur: 'The qBittorrent Project', exeName: 'qbittorrent.exe' }),
      externe({ nom: 'qBittorrent', editeur: 'qBittorrent', version: null }),
    )
    expect(r.accepte).toBe(true)
  })

  it('accepte quand le nom d’exécutable se retrouve dans le candidat', () => {
    const r = verifierCandidat(
      local({ nom: 'Torrex', exeName: 'Torrex.exe', editeur: 'BooStudioLLC' }),
      externe({ nom: 'Torrex Lite - Torrent Downloader', editeur: 'BooStudioLLC' }),
    )
    expect(r.accepte).toBe(true)
  })
})

describe('vérification — la prudence par défaut', () => {
  it('refuse quand il n’y a RIEN à confronter', () => {
    const r = verifierCandidat(
      local({ nom: 'LowGUI' }),
      externe({ nom: 'LowGUI' }),
    )
    expect(r.accepte).toBe(false)
    expect(r.niveau).toBe('INSUFFISANT')
  })

  it('refuse sur un seul indice faible : un nom qui se ressemble ne prouve rien', () => {
    const r = verifierCandidat(
      local({ nom: 'Weather' }),
      externe({ nom: 'Weather', description: 'Une application meteo' }),
    )
    expect(r.accepte).toBe(false)
  })

  it('une contradiction annule toute accumulation de preuves', () => {
    const r = verifierCandidat(
      local({ nom: 'Steam', editeur: 'Valve Corporation', version: '3.0', exeName: 'steam.exe' }),
      externe({ nom: 'Steam', editeur: 'Electronic Arts', version: '3.0' }),
    )
    expect(r.accepte).toBe(false)
    expect(r.contradictions.length).toBeGreaterThan(0)
  })

  it('expose toujours ses preuves et ses contradictions', () => {
    const r = verifierCandidat(
      local({ nom: 'Blender', editeur: 'Blender Foundation', version: '5.0' }),
      externe({ nom: 'Blender', editeur: 'Blender Foundation', version: '5.0' }),
    )
    expect(r.preuves.length).toBeGreaterThan(0)
    expect(Array.isArray(r.contradictions)).toBe(true)
  })
})

describe('choix parmi plusieurs candidats — l ambiguite vaut refus', () => {
  it('refuse les trois produits Microsoft proposes pour « Visual Studio »', () => {
    // Cas reel du 2026-09-17 : winget renvoie trois fiches, toutes editees par
    // Microsoft Corporation. Retenir la premiere confondrait Visual Studio Code
    // avec Visual Studio. Ici un seul indice concorde par candidat (l editeur),
    // ce qui ne suffit deja pas.
    const r = choisirCandidat(
      local({ nom: 'Visual Studio', editeur: 'Microsoft Corporation', exeName: 'devenv.exe' }),
      [
        externe({ nom: 'Visual Studio Code', editeur: 'Microsoft Corporation', version: '1.0' }),
        externe({ nom: 'Visual Studio Community', editeur: 'Microsoft Corporation', version: '1.0' }),
        externe({ nom: 'Visual Studio Code - Insiders', editeur: 'Microsoft Corporation', version: '1.0' }),
      ],
    )
    expect(r.retenu).toBeNull()
  })

  it('refuse aussi quand PLUSIEURS candidats reunissent deux preuves chacun', () => {
    // Le cas dangereux : editeur ET version concordent pour trois produits
    // differents du meme editeur. Chacun est « verifie », donc aucun ne se
    // distingue — et retenir le premier serait un coup de des.
    const r = choisirCandidat(
      local({ nom: 'Visual Studio', editeur: 'Microsoft Corporation', version: '17.0', exeName: 'devenv.exe' }),
      [
        externe({ nom: 'Visual Studio Code', editeur: 'Microsoft Corporation', version: '17.0' }),
        externe({ nom: 'Visual Studio Community', editeur: 'Microsoft Corporation', version: '17.0' }),
        externe({ nom: 'Visual Studio Code - Insiders', editeur: 'Microsoft Corporation', version: '17.0' }),
      ],
    )
    expect(r.retenu).toBeNull()
    expect(r.nbAcceptes).toBe(3)
    expect(r.raisonRefus).toContain('concordent')
  })

  it('retient le candidat unique qui resiste a la verification', () => {
    const r = choisirCandidat(
      local({ nom: 'Incredibuild', editeur: 'Incredibuild Software Ltd.', version: '10.23', exeName: 'BuildConsole.exe' }),
      [
        externe({ nom: 'Incredibuild', editeur: 'Incredibuild Software Ltd.', version: '10.23.0' }),
        externe({ nom: 'Autre chose', editeur: 'Quelqu un d autre', version: '2.0' }),
      ],
    )
    expect(r.retenu).not.toBeNull()
    expect(r.retenu!.nom).toBe('Incredibuild')
  })

  it('une identite de paquet tranche meme si d autres concordent', () => {
    const r = choisirCandidat(
      local({ nom: 'X', editeur: 'ACME', identitePaquet: 'ACME.Produit' }),
      [
        externe({ nom: 'Voisin', editeur: 'ACME', version: null }),
        externe({ nom: 'Le bon', editeur: 'ACME', identitePaquet: 'ACME.Produit' }),
      ],
    )
    expect(r.retenu!.nom).toBe('Le bon')
    expect(r.verdict!.niveau).toBe('DECISIF')
  })

  it('refuse quand la liste est vide', () => {
    const r = choisirCandidat(local({ nom: 'X' }), [])
    expect(r.retenu).toBeNull()
  })
})
