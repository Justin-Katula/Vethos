import { describe, expect, it } from 'vitest'
import appJson from '../../app.json'
import {
  NOM_APPLICATION,
  SCHEMA_RETOUR,
  habillageBouclier,
  phraseBouclier,
  titrePourBouclier,
  versCouleurIOS,
  type CouleurIOS,
} from './bouclier'

/**
 * Le bouclier ne s'affiche que sur un vrai iPhone, pendant une vraie séance,
 * dans un processus qui n'est pas le nôtre. Aucune capture d'écran ne le
 * montrera ici, et aucun rechargement ne le corrigera à chaud : ce qu'on y
 * dépose est ce que l'utilisateur verra pendant des semaines.
 *
 * D'où ces tests. Ils ne vérifient pas qu'iOS dessine — ça, seul l'appareil le
 * dira. Ils vérifient ce que Vethos DEMANDE : les couleurs du thème et pas
 * d'autres, le jeton d'Apple et jamais un nom d'application, et des phrases qui
 * tiennent la loi F.
 */

/** La teinte d'une couleur, en degrés. Sert à prouver l'absence de vert. */
function teinte(c: CouleurIOS): number {
  const [r, v, b] = [c.red / 255, c.green / 255, c.blue / 255]
  const max = Math.max(r, v, b)
  const min = Math.min(r, v, b)
  if (max === min) return 0
  const d = max - min
  const h = max === r ? ((v - b) / d) % 6 : max === v ? (b - r) / d + 2 : (r - v) / d + 4
  return (h * 60 + 360) % 360
}

/** Gris neutre : R = V = B. Un gris n'a pas de teinte à interdire. */
function estNeutre(c: CouleurIOS): boolean {
  return c.red === c.green && c.green === c.blue
}

const toutesLesCouleurs = (theme: 'clair' | 'sombre'): CouleurIOS[] =>
  Object.values(
    habillageBouclier({ theme, titreBloc: 'Chemistry', finMinute: 930 }).configuration,
  ).filter((v): v is CouleurIOS => typeof v === 'object' && v !== null)

describe('les couleurs du bouclier', () => {
  it('lit un hexadécimal comme UIKit l’attend', () => {
    expect(versCouleurIOS('#c1121f')).toEqual({ red: 193, green: 18, blue: 31 })
    expect(versCouleurIOS('#000000')).toEqual({ red: 0, green: 0, blue: 0 })
    expect(versCouleurIOS('#ffffff', 0.5)).toEqual({ red: 255, green: 255, blue: 255, alpha: 0.5 })
  })

  it('ne laisse passer aucun vert, dans aucun thème', () => {
    // La règle la plus ancienne du système visuel : aucune teinte entre 60° et
    // 170°. Le bouclier est le seul écran que personne ne relit — il se
    // fabrique ici et s'affiche ailleurs, sans passer par un œil.
    for (const theme of ['clair', 'sombre'] as const) {
      for (const couleur of toutesLesCouleurs(theme)) {
        if (estNeutre(couleur)) continue
        const t = teinte(couleur)
        expect(t < 60 || t > 170, `${theme} : teinte ${Math.round(t)}° interdite`).toBe(true)
      }
    }
  })

  it('prend ses couleurs dans le thème, pas à côté', () => {
    // Écrites à la main, elles auraient dérivé au premier ajustement de
    // palette sans que rien ne le montre.
    const sombre = habillageBouclier({ theme: 'sombre', titreBloc: 'X', finMinute: 600 })
    expect(sombre.configuration.backgroundColor).toEqual({ red: 0, green: 0, blue: 0 })

    const clair = habillageBouclier({ theme: 'clair', titreBloc: 'X', finMinute: 600 })
    expect(clair.configuration.backgroundColor).not.toEqual(sombre.configuration.backgroundColor)
  })
})

describe('ce que le bouclier dit', () => {
  it('laisse iOS écrire le nom de l’application, et ne l’écrit jamais lui-même', () => {
    // Vethos ne connaît PAS ce nom, et l'écran Blocage le promet à
    // l'utilisateur. Le jour où un titre porterait un vrai nom, la promesse
    // deviendrait fausse — et ce serait invisible depuis l'application.
    const { configuration } = habillageBouclier({
      theme: 'sombre',
      titreBloc: 'Chemistry',
      finMinute: 930,
    })
    expect(configuration.title).toBe(NOM_APPLICATION)
    expect(configuration.title).toContain('{')
  })

  it('porte le bloc en cours et son heure de fin', () => {
    expect(phraseBouclier('Chemistry — part 2', 930)).toBe('Chemistry — part 2 — until 15:30')
  })

  it('reste laconique plutôt que d’inventer un contexte qu’il n’a pas', () => {
    expect(phraseBouclier(null, 930)).toBe('Set aside until 15:30')
  })

  it('garde le nom du bloc quand on repose le bouclier sans le redire', () => {
    // Le repose d'apparence connaît le thème mais pas le bloc. `undefined`
    // veut donc dire « ne touche pas », là où `null` efface volontairement.
    // Confondre les deux remplaçait « Chemistry — until 15:30 » par une phrase
    // sans nom, à chaque bascule clair/sombre pendant une séance.
    expect(titrePourBouclier(undefined, 'Chemistry')).toBe('Chemistry')
    expect(titrePourBouclier(null, 'Chemistry')).toBe(null)
    expect(titrePourBouclier('Physics', 'Chemistry')).toBe('Physics')
    expect(titrePourBouclier(undefined, null)).toBe(null)
  })

  it('ne juge pas et ne demande rien (loi F)', () => {
    const { configuration } = habillageBouclier({
      theme: 'clair',
      titreBloc: 'Chemistry',
      finMinute: 930,
    })
    const phrases = [
      configuration.subtitle,
      configuration.primaryButtonLabel,
      configuration.secondaryButtonLabel,
    ]
    for (const phrase of phrases) {
      expect(phrase, `« ${phrase} » pose une question`).not.toContain('?')
      expect(
        /sure|really|focus|stay|don't|shouldn|keep going|well done|oops/i.test(phrase),
        `« ${phrase} » juge ou encourage`,
      ).toBe(false)
    }
  })
})

describe('les boutons du bouclier', () => {
  it('ferme sans rien lever', () => {
    // Le bouton le plus gros ne doit pas être celui qui abandonne la séance.
    const { actions } = habillageBouclier({ theme: 'sombre', titreBloc: 'X', finMinute: 600 })
    expect(actions.primary).toEqual({ behavior: 'close' })
  })

  it('offre une sortie, et la fait passer par l’application', () => {
    // L'utilisateur peut tout lever quand il veut — c'est assumé. Mais lever
    // DEPUIS le bouclier ferait de l'abandon un réflexe à un doigt. Ouvrir
    // Vethos montre d'abord ce qui tourne ; le bouton « Lift everything now »
    // est juste derrière.
    const { actions } = habillageBouclier({ theme: 'sombre', titreBloc: 'X', finMinute: 600 })
    expect(actions.secondary?.actions).toEqual([{ type: 'openApp' }])
  })

  it('déclare le schéma par lequel « Open Vethos » revient', () => {
    // L'extension d'Apple ouvre une adresse écrite en dur dans le greffon :
    // `device-activity://`. Aucun réglage ne la change. Si Vethos cesse de
    // répondre à ce schéma, le bouton du bouclier n'ouvre plus rien — iOS ne
    // résout vers aucune application, sans erreur et sans trace. Ce test
    // existe pour qu'un nettoyage de `app.json` ne puisse pas passer.
    const { actions } = habillageBouclier({ theme: 'sombre', titreBloc: 'X', finMinute: 600 })
    if (actions.secondary?.actions?.[0]?.type !== 'openApp') return

    const schemas = appJson.expo.scheme
    expect(
      Array.isArray(schemas) ? schemas : [schemas],
      'app.json doit garder le schéma que l’extension ouvre en dur',
    ).toContain(SCHEMA_RETOUR)
  })

  it('en mode profond, sort SANS passer par une application peut-être bloquée', () => {
    // `enableBlockAllMode` écarte toutes les catégories sauf la liste gardée,
    // et cette liste ne se remplit que dans le sélecteur d'Apple : Vethos ne
    // peut pas s'y ajouter lui-même. Si l'utilisateur ne s'est pas gardé
    // Vethos, « Open Vethos » ouvre un bouclier — et il n'existe plus aucune
    // sortie hors des Réglages d'iOS. Celle-ci agit depuis l'extension.
    const { configuration, actions } = habillageBouclier({
      theme: 'sombre',
      titreBloc: 'X',
      finMinute: 600,
      profond: true,
    })
    expect(actions.secondary?.actions).toEqual([{ type: 'disableBlockAllMode' }])
    expect(configuration.secondaryButtonLabel).toBe('Lift deep focus')
  })
})
