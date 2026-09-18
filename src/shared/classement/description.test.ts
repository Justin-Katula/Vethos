import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classerParDescription } from './description'

function activitesConnues(): Set<string> {
  const brut = JSON.parse(readFileSync(join(process.cwd(), 'src/shared/activites.json'), 'utf8'))
  const ids = new Set<string>()
  for (const g of brut.groupes) for (const a of g.activites) ids.add(a.id)
  return ids
}

describe('classement par description officielle', () => {
  const cas: Array<[string, string, string]> = [
    ['un client BitTorrent', 'qBittorrent is a free and reliable BitTorrent client.', 'TELECHARGER'],
    ['un environnement de développement', 'PyCharm is an integrated development environment for Python.', 'ECRIRE_DU_CODE'],
    ['un logiciel de diffusion', 'Free and open source software for live streaming and screen recording.', 'DIFFUSER_EN_DIRECT'],
    ['un archiveur', '7-Zip is a file archiver with a high compression ratio.', 'ARCHIVER'],
    ['un moteur JavaScript', 'Node.js is a JavaScript runtime built on Chrome V8.', 'ECRIRE_DU_CODE'],
    ['un outil de surveillance', 'MSI Afterburner is the go-to overclocking utility with hardware monitoring.', 'SURVEILLER_LES_PERFORMANCES'],
    ['un gestionnaire de mots de passe', 'A password manager that stores passwords securely.', 'GERER_SES_MOTS_DE_PASSE'],
    ['un modeleur 3D', 'Blender is the free and open source 3D creation suite.', 'MODELISER_EN_3D'],
    ['un navigateur', 'A fast and private web browser.', 'NAVIGUER_SUR_LE_WEB'],
    ['un client de bureau à distance', 'Remote desktop software for accessing computers.', 'SE_CONNECTER_A_DISTANCE'],
  ]
  for (const [quoi, texte, attendu] of cas) {
    it(`reconnaît ${quoi}`, () => {
      expect(classerParDescription(texte).activites).toContain(attendu)
    })
  }
})

describe('les pièges du vocabulaire', () => {
  it('« game development » ne devient JAMAIS « jouer »', () => {
    const r = classerParDescription('Unity is a game development platform used to create games.')
    expect(r.activites).not.toContain('JOUER')
    expect(r.activites).toContain('CREER_UN_JEU')
  })

  it('un lanceur de jeux sert bien à jouer', () => {
    const r = classerParDescription('A gaming platform where you can play games and manage your game library.')
    expect(r.activites).toContain('JOUER')
    expect(r.activites).toContain('GERER_SA_LUDOTHEQUE')
  })

  it('« music production » n’est pas « écouter de la musique »', () => {
    const r = classerParDescription('A digital audio workstation for music production and mixing.')
    expect(r.activites).toContain('PRODUIRE_DE_LA_MUSIQUE')
    expect(r.activites).not.toContain('ECOUTER_DE_LA_MUSIQUE')
  })

  it('« video editing » n’est pas « regarder une vidéo »', () => {
    const r = classerParDescription('Professional video editing software with a media player preview.')
    expect(r.activites).toContain('MONTER_UNE_VIDEO')
    expect(r.activites).not.toContain('REGARDER_UNE_VIDEO')
  })
})

describe('la prudence', () => {
  it('un texte vague ne conclut rien', () => {
    expect(classerParDescription('A powerful and fast tool. Simple, modern, reliable.').activites).toEqual([])
  })

  it('un texte vide ne conclut rien', () => {
    expect(classerParDescription(null).activites).toEqual([])
    expect(classerParDescription('').activites).toEqual([])
  })

  it('ne produit jamais un identifiant hors vocabulaire', () => {
    const connues = activitesConnues()
    const textes = [
      'BitTorrent client with download manager and file archiver features.',
      'An integrated development environment with version control and a database client.',
      'Antivirus and firewall with password manager, remote desktop and cloud storage.',
    ]
    for (const t of textes) {
      for (const a of classerParDescription(t).activites) {
        expect(connues.has(a), `${a} est inconnu du vocabulaire`).toBe(true)
      }
    }
  })

  it('justifie chaque activité par l’expression qui l’a déclenchée', () => {
    const r = classerParDescription('qBittorrent is a BitTorrent client.')
    expect(r.justifications.join(' ')).toContain('bittorrent')
  })

  it('un motif court ne se déclenche pas au milieu d’un mot', () => {
    // Mesuré le 2026-09-17 : « amdinstallmanager » contient « llm », et le
    // gestionnaire d'installation d'AMD passait pour un outil de dialogue avec une IA.
    expect(classerParDescription('amdinstallmanager').activites).not.toContain('DIALOGUER_AVEC_UNE_IA')
    expect(classerParDescription('still managing').activites).not.toContain('DIALOGUER_AVEC_UNE_IA')
    // Mais le mot entier, lui, compte toujours.
    expect(classerParDescription('run a local llm on your machine').activites).toContain('DIALOGUER_AVEC_UNE_IA')
  })

  it('les motifs plus longs continuent de se reconnaître dans un mot composé', () => {
    // « shell » doit rester trouvable à l'intérieur de « PowerShell ».
    expect(classerParDescription('powershell scripting console').activites).toContain('ADMINISTRER_SYSTEME')
  })
})
