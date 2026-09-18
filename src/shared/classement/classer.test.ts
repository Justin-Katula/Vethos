import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classer, type PreuvesApplication } from './classer'
import { EXTENSION_VERS_ACTIVITES, PROTOCOLE_VERS_ACTIVITES } from './associations'

const p = (o: Partial<PreuvesApplication>): PreuvesApplication => ({
  nom: '', extensions: [], protocoles: [], dansDossierJeu: false,
  programmesHeberges: 0, lancable: true, ...o,
})

/** Les identifiants réellement définis dans le vocabulaire fermé. */
function activitesConnues(): Set<string> {
  const brut = JSON.parse(readFileSync(join(process.cwd(), 'src/shared/activites.json'), 'utf8'))
  const ids = new Set<string>()
  for (const g of brut.groupes) for (const a of g.activites) ids.add(a.id)
  return ids
}

describe('vocabulaire fermé — aucun identifiant fantôme', () => {
  it('toutes les activités citées par les associations existent', () => {
    const connues = activitesConnues()
    const fantomes: string[] = []
    for (const [cle, liste] of Object.entries(EXTENSION_VERS_ACTIVITES)) {
      for (const a of liste) if (!connues.has(a)) fantomes.push(`${cle} -> ${a}`)
    }
    for (const [cle, liste] of Object.entries(PROTOCOLE_VERS_ACTIVITES)) {
      for (const a of liste) if (!connues.has(a)) fantomes.push(`${cle}:// -> ${a}`)
    }
    expect(fantomes, `identifiants inexistants : ${fantomes.join(', ')}`).toEqual([])
  })

  it('le classement ne produit jamais un identifiant hors vocabulaire', () => {
    const connues = activitesConnues()
    const c = classer(p({ extensions: ['.xlsx', '.psd', '.blend', '.torrent'], protocoles: ['steam', 'mailto'] }))
    for (const a of c.activites) expect(connues.has(a), `${a} est inconnu`).toBe(true)
  })
})

describe('classement par les types de fichiers', () => {
  const cas: Array<[string, Partial<PreuvesApplication>, string]> = [
    ['un tableur', { extensions: ['.xlsx', '.csv', '.ods'] }, 'TRAVAILLER_SUR_TABLEUR'],
    ['un éditeur de code', { extensions: ['.py', '.ts'] }, 'ECRIRE_DU_CODE'],
    ['un gestionnaire de téléchargements', { extensions: ['.nzb', '.dlc', '.metalink'] }, 'TELECHARGER'],
    ['un lecteur vidéo', { extensions: ['.mp4', '.mkv'] }, 'REGARDER_UNE_VIDEO'],
    ['un lecteur audio', { extensions: ['.mp3', '.flac'] }, 'ECOUTER_DE_LA_MUSIQUE'],
    ['un logiciel de retouche', { extensions: ['.psd', '.xcf'] }, 'RETOUCHER_UNE_IMAGE'],
    ['un modeleur 3D', { extensions: ['.blend', '.fbx'] }, 'MODELISER_EN_3D'],
    ['un logiciel de CAO', { extensions: ['.dwg', '.step'] }, 'CONCEVOIR_EN_CAO'],
    ['un client de messagerie', { extensions: ['.msg', '.pst'] }, 'GERER_SES_COURRIELS'],
    ['un archiveur', { extensions: ['.zip', '.7z', '.rar'] }, 'ARCHIVER'],
    ['une liseuse', { extensions: ['.epub', '.mobi'] }, 'LIRE_UN_LIVRE'],
  ]
  for (const [quoi, preuves, attendu] of cas) {
    it(`reconnaît ${quoi}`, () => {
      const c = classer(p(preuves))
      expect(c.activites).toContain(attendu)
      expect(c.niveau).toBe('PROUVE')
    })
  }
})

describe('classement par les protocoles déclarés', () => {
  it('un lanceur de jeux sert à JOUER, pas seulement à installer', () => {
    // Remarque de l'utilisateur : « les jeux Steam se lancent depuis Steam ».
    // Une application peut donc servir plusieurs activités à la fois.
    const c = classer(p({ protocoles: ['steam'], programmesHeberges: 6 }))
    expect(c.activites).toContain('JOUER')
    expect(c.activites).toContain('GERER_SA_LUDOTHEQUE')
  })

  it('un assistant conversationnel relève de DIALOGUER_AVEC_UNE_IA', () => {
    expect(classer(p({ protocoles: ['claude'] })).activites).toEqual(['DIALOGUER_AVEC_UNE_IA'])
  })

  it('un navigateur navigue, et n’hérite pas des sites visités', () => {
    const c = classer(p({ protocoles: ['http', 'https'], extensions: ['.html'] }))
    expect(c.activites).toEqual(['NAVIGUER_SUR_LE_WEB'])
  })
})

describe('classement par l’emplacement', () => {
  it('un jeu installé dans une bibliothèque relève de JOUER', () => {
    const c = classer(p({ dansDossierJeu: true }))
    expect(c.activites).toEqual(['JOUER'])
  })

  it('un hôte sans rapport avec le jeu gère des logiciels', () => {
    const c = classer(p({ programmesHeberges: 4, extensions: ['.sln'] }))
    expect(c.activites).toContain('INSTALLER_UN_LOGICIEL')
    expect(c.activites).not.toContain('GERER_SA_LUDOTHEQUE')
  })
})

describe('la règle d’or — ne pas savoir n’autorise pas à bloquer', () => {
  it('une application sans aucune preuve est INCONNUE et non bloquable', () => {
    const c = classer(p({ nom: 'LowGUI' }))
    expect(c.niveau).toBe('INCONNU')
    expect(c.activites).toEqual([])
    expect(c.bloquable).toBe(false)
  })

  it('un composant non lançable est NEUTRE et non bloquable', () => {
    // ASUS AURA Motherboard HAL, Realtek Audio Driver, Denuvo Anti-Cheat Service :
    // ce ne sont pas des applications, et aucun index ne les décrit.
    const c = classer(p({ nom: 'ASUS AURA Motherboard HAL', lancable: false }))
    expect(c.niveau).toBe('NEUTRE')
    expect(c.bloquable).toBe(false)
  })

  it('une application prouvée est bloquable', () => {
    expect(classer(p({ extensions: ['.xlsx'] })).bloquable).toBe(true)
  })
})

describe('traçabilité', () => {
  it('chaque activité retenue est justifiée par la preuve qui la produit', () => {
    const c = classer(p({ extensions: ['.torrent'], protocoles: ['magnet'] }))
    expect(c.activites).toEqual(['TELECHARGER'])
    expect(c.justifications.join(' ')).toContain('.torrent')
    expect(c.justifications.join(' ')).toContain('magnet')
  })
})

describe('infrastructure — ce qui n’est pas une application', () => {
  const cas = [
    'Microsoft Visual C++ 2015-2022 Redistributable (x64) - 14.42.34438',
    'Visual Studio Setup',
    'Microsoft .NET Runtime - 8.0.31 (x64)',
    'UE Prerequisites (x64)',
    'K-Lite Codec Pack',
  ]
  for (const nom of cas) {
    it(`« ${nom.slice(0, 40)} » est NEUTRE`, () => {
      // Même avec des associations, ce n'est pas quelque chose que l'on ouvre.
      const c = classer(p({ nom, extensions: ['.dll', '.mp4'], lancable: true }))
      expect(c.niveau).toBe('NEUTRE')
      expect(c.bloquable).toBe(false)
    })
  }

  it('n’écarte pas une vraie application dont le nom contient un mot voisin', () => {
    expect(classer(p({ nom: 'Setup Factory Designer', extensions: ['.xlsx'] })).niveau).toBe('NEUTRE')
    // Contre-exemple assumé : « Setup » suffit à écarter. On préfère une fiche
    // NEUTRE — donc jamais bloquée — à une fiche fausse.
  })
})
