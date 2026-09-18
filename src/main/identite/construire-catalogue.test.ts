import { describe, it, expect } from 'vitest'
import { construireCatalogue, type EntreeInventaire, type SourcesExternes } from './construire-catalogue'

/**
 * Défauts mesurés le 2026-09-17 sur la machine réelle, et corrigés. Chacun est ici
 * pour ne pas revenir.
 *
 * Le plus dangereux est le dernier : absorber un enfant sur la seule imbrication des
 * chemins faisait disparaître les jeux dans leur lanceur — exactement le défaut
 * d'origine, qui n'autorisait que des lanceurs quand l'utilisateur voulait jouer.
 */

const VIDE: SourcesExternes = {
  titresStore: new Map(),
  descriptionsStore: new Map(),
  identifiantsWinget: new Map(),
  protocolesParExe: new Map(),
  extensionsParExe: new Map(),
  protocolesParDossier: new Map(),
  extensionsParDossier: new Map(),
  descriptions: new Map(),
  resolutionsConfirmees: new Map(),
}

function entree(p: Partial<EntreeInventaire> & { emplacement: string }): EntreeInventaire {
  return {
    nomRegistre: null,
    cleRegistre: null,
    ruche: 'MENU_DEMARRER',
    editeurDeclare: null,
    version: null,
    identitePaquet: null,
    steamAppId: null,
    steamNom: null,
    ...p,
    preuves: {
      exeAnalyse: null,
      editeurBinaire: null,
      produitBinaire: null,
      descriptionBinaire: null,
      signature: 'NotSigned',
      nbFichiers: 40,
      ...(p.preuves || {}),
    },
  }
}

const nomsDe = (inv: EntreeInventaire[], ext: SourcesExternes = VIDE) =>
  construireCatalogue(inv, ext).map((f) => f.nom)

describe('nom retenu', () => {
  it('remplace un nom de composant par celui de l’exécutable réel', () => {
    // Un raccourci « UnityCrashHandler64 » pointait en réalité vers le jeu.
    const fiches = construireCatalogue(
      [
        entree({
          nomRegistre: 'UnityCrashHandler64',
          emplacement: 'C:\\Games\\gunsaw-demo',
          preuves: { exeAnalyse: 'C:\\Games\\gunsaw-demo\\Gunsaw.exe' } as EntreeInventaire['preuves'],
        }),
      ],
      VIDE,
    )
    expect(fiches[0]!.nom).toBe('Gunsaw')
    expect(fiches[0]!.sourceDuNom).toContain('exécutable')
  })

  it('n’attrape pas « Launcher » : un lanceur est une vraie application', () => {
    const noms = nomsDe([
      entree({ nomRegistre: 'Epic Games Launcher', emplacement: 'C:\\Epic' }),
      entree({ nomRegistre: 'Rockstar Games Launcher', emplacement: 'C:\\Rockstar' }),
    ])
    expect(noms).toEqual(['Epic Games Launcher', 'Rockstar Games Launcher'])
  })

  it('retire le résidu d’un ™ ou d’un ® perdu à l’encodage', () => {
    const noms = nomsDe([
      // Le ™ décodé de travers laisse des caractères de remplacement.
      entree({ steamNom: 'Battlefield\uFFFD,\uFFFD 6', emplacement: 'C:\\A', steamAppId: '1' }),
      // Le ™ réduit à une majuscule isolée collée au mot.
      entree({ nomRegistre: 'Horizon Forbidden WestT Complete Edition', emplacement: 'C:\\B' }),
    ])
    expect(noms).toEqual(['Battlefield 6', 'Horizon Forbidden West Complete Edition'])
  })

  it('laisse intacts les noms qui portent légitimement des majuscules', () => {
    const noms = nomsDe([
      entree({ nomRegistre: 'ChatGPT', emplacement: 'C:\\A' }),
      entree({ nomRegistre: 'qBittorrent', emplacement: 'C:\\B' }),
      entree({ nomRegistre: 'BitTorrent', emplacement: 'C:\\C' }),
      entree({ nomRegistre: 'OBS Studio', emplacement: 'C:\\D' }),
    ])
    expect(noms).toEqual(['ChatGPT', 'qBittorrent', 'BitTorrent', 'OBS Studio'])
  })
})

describe('absorption des composants', () => {
  const protocolesJeu = new Map([['c:\\epic\\launcher\\portal\\binaries\\win64', ['com.epicgames.launcher']]])

  it('absorbe un composant interne dans le produit qui le contient', () => {
    const noms = nomsDe(
      [
        entree({ nomRegistre: 'Epic Games Launcher', emplacement: 'C:\\Epic\\', cleRegistre: 'HKLM\\...\\Epic' }),
        // Même sans identité, ce dossier « déclare » le protocole du lanceur : c'est
        // celui du parent, remonté par préfixe. Il ne prouve pas son indépendance.
        entree({ nomRegistre: 'Unreal Engine', emplacement: 'C:\\Epic\\Launcher\\Portal\\Binaries\\Win64' }),
        entree({ nomRegistre: 'EpicWebHelper', emplacement: 'C:\\Epic\\Launcher\\Engine\\Binaries\\Win64' }),
      ],
      { ...VIDE, protocolesParDossier: protocolesJeu },
    )
    expect(noms).toEqual(['Epic Games Launcher'])
  })

  it('le dossier parent garde bien le protocole déclaré par son sous-dossier', () => {
    const fiches = construireCatalogue(
      [entree({ nomRegistre: 'Epic Games Launcher', emplacement: 'C:\\Epic\\', cleRegistre: 'k' })],
      { ...VIDE, protocolesParDossier: protocolesJeu },
    )
    expect(fiches[0]!.classement.activites).toContain('JOUER')
  })

  it('N’ABSORBE JAMAIS un jeu dans son lanceur', () => {
    // Le défaut d'origine, sous un autre costume : cinq jeux Steam ont « Steam »
    // pour dossier parent. Les absorber les ferait disparaître du catalogue, et
    // « je veux jouer » n'autoriserait de nouveau que des lanceurs.
    const noms = nomsDe([
      entree({
        nomRegistre: 'Steam',
        emplacement: 'C:\\Steam',
        cleRegistre: 'HKLM\\...\\Steam',
        preuves: { exeAnalyse: 'C:\\Steam\\steam.exe' } as EntreeInventaire['preuves'],
      }),
      entree({ steamNom: 'Hollow Knight', steamAppId: '367520', emplacement: 'C:\\Steam\\steamapps\\common\\Hollow Knight' }),
      entree({ steamNom: 'Twelve Minutes', steamAppId: '1097200', emplacement: 'C:\\Steam\\steamapps\\common\\Twelve Minutes' }),
    ])
    expect(noms).toContain('Hollow Knight')
    expect(noms).toContain('Twelve Minutes')
  })

  it('n’absorbe pas un outil qui déclare sa propre association', () => {
    // `C:\Windows` contient tous les outils du système. Chacun garde sa fiche dès
    // qu'il déclare quelque chose en son nom propre.
    const noms = nomsDe(
      [
        entree({ nomRegistre: 'Registry Editor', emplacement: 'C:\\Windows', cleRegistre: 'k' }),
        entree({
          nomRegistre: 'Remote Desktop Connection',
          emplacement: 'C:\\Windows\\System32\\mstsc',
          preuves: { exeAnalyse: 'C:\\Windows\\System32\\mstsc\\mstsc.exe' } as EntreeInventaire['preuves'],
        }),
      ],
      { ...VIDE, extensionsParExe: new Map([['mstsc.exe', ['.rdp']]]) },
    )
    expect(noms).toContain('Remote Desktop Connection')
  })

  it('un dossier partagé ne prête pas les associations de tout le système', () => {
    // Mesuré le 2026-09-17 : en balayant `C:\Windows\System32`, l'Éditeur du Registre
    // héritait des associations de TOUT le système et se retrouvait à naviguer sur le
    // web. Dans un dossier partagé, seul le binaire lui-même compte.
    const fiches = construireCatalogue(
      [
        entree({
          nomRegistre: 'Registry Editor',
          emplacement: 'C:\\Windows',
          preuves: { exeAnalyse: 'C:\\Windows\\regedit.exe' } as EntreeInventaire['preuves'],
        }),
      ],
      {
        ...VIDE,
        // Déclarées par un TOUT AUTRE binaire, qui se trouve dans le même dossier.
        extensionsParDossier: new Map([['c:\\windows', ['.html', '.htm']]]),
      },
    )
    expect(fiches[0]!.classement.activites).not.toContain('NAVIGUER_SUR_LE_WEB')
  })

  it('un composant SANS parent classé reste une fiche, jamais bloquée', () => {
    const fiches = construireCatalogue(
      [entree({ nomRegistre: 'SomeHelper', emplacement: 'C:\\Orphelin\\Binaries\\Win64' })],
      VIDE,
    )
    expect(fiches).toHaveLength(1)
    expect(fiches[0]!.classement.bloquable).toBe(false)
  })
})
