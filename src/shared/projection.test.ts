import { describe, it, expect } from 'vitest'
import { HORIZON_WEEKS, anchorInsight, hoursLabel, objectiveMilestone } from './projection'

/**
 * La projection est du TEXTE, et c'est précisément ce qui la rend fragile.
 *
 * Personne ne remarque qu'un palier est décalé d'un cran, ni qu'une ancre de
 * course à pied reçoit la phrase générique : la carte s'affiche, elle est
 * bien composée, et elle dit autre chose que ce qu'elle devrait. Ces tests
 * tiennent les frontières, là où les phrases changent.
 */

describe('l’horizon', () => {
  it('compte un mois en quatre semaines, pas en 30,4 jours', () => {
    expect(HORIZON_WEEKS.month).toBe(4)
    expect(HORIZON_WEEKS.year).toBe(52)
  })
})

describe('l’heure écrite en français', () => {
  it('efface la décimale quand elle est nulle', () => {
    expect(hoursLabel(4)).toBe('4 h')
    expect(hoursLabel(4.04)).toBe('4 h')
  })

  it('écrit la décimale avec une virgule', () => {
    // « 3.8 h » au milieu d'une phrase française se lit comme une coquille.
    expect(hoursLabel(3.75)).toBe('3,8 h')
  })

  it('n’en garde jamais deux', () => {
    expect(hoursLabel(3.14159)).toBe('3,1 h')
  })

  it('tient à zéro', () => {
    expect(hoursLabel(0)).toBe('0 h')
  })
})

describe('les paliers d’un objectif', () => {
  const titre = (h: number) => objectiveMilestone(h).title

  it('change exactement aux bornes annoncées', () => {
    expect(titre(39.9)).toBe('Prise d’élan & Découverte')
    expect(titre(40)).toBe('Fondations solides')
    expect(titre(99.9)).toBe('Fondations solides')
    expect(titre(100)).toBe('Autonomie & Aisance')
    expect(titre(249.9)).toBe('Autonomie & Aisance')
    expect(titre(250)).toBe('Expertise confirmée')
    expect(titre(499.9)).toBe('Expertise confirmée')
    expect(titre(500)).toBe('Haut niveau de maîtrise')
  })

  it('répond même à zéro', () => {
    // Un objectif déclaré à 0 min par semaine est légal : il reste une
    // intention. L'écran ne doit pas se retrouver sans phrase.
    expect(objectiveMilestone(0).desc.length).toBeGreaterThan(0)
  })
})

describe('ce qu’une ancre devient sur un an', () => {
  it('compte les livres d’une ancre de lecture', () => {
    expect(anchorInsight('Lecture du soir', 80)).toContain('10 livres')
  })

  it('accorde le singulier', () => {
    const texte = anchorInsight('Lecture', 8)
    expect(texte).toContain('1 livre entier dévoré')
    expect(texte).not.toContain('livres')
  })

  it('ne descend jamais à zéro livre', () => {
    // Une ancre déclarée vaut toujours au moins un livre : « environ 0 livre »
    // serait une phrase qui décourage de ce qu'on vient juste de décider.
    expect(anchorInsight('Lecture', 1)).toContain('1 livre')
  })

  it('reconnaît le sport sous ses différents noms', () => {
    for (const nom of ['Course à pied', 'Muscu', 'Yoga du matin', 'GYM', 'Morning run']) {
      expect(anchorInsight(nom, 100), nom).toContain('transformation physique')
    }
  })

  it('reconnaît la méditation, accents compris', () => {
    // « Méditation » est l'orthographe que TOUT LE MONDE écrit. Sans repli
    // d'accents, `medit` ne se trouvait pas dans `méditation` : le seul cas
    // qui ne marchait pas etait le cas normal.
    expect(anchorInsight('Méditation', 50)).toContain('calme profond')
    expect(anchorInsight('Méditation du matin', 50)).toContain('calme profond')
  })

  it('reconnaît une ancre accentuée de sport', () => {
    expect(anchorInsight('Étirements & gym', 40)).toContain('transformation physique')
  })

  it('retombe sur une phrase chiffrée quand le nom ne dit rien', () => {
    // Jamais « catégorie inconnue » : la phrase générique dit la même chose
    // en heures, et reste vraie.
    const texte = anchorInsight('Appeler ma mère', 26)
    expect(texte).toContain('26 heures')
    expect(texte).toContain('rituel inamovible')
  })

  it('ignore la casse et les accents du nom', () => {
    expect(anchorInsight('SPORT', 10)).toContain('transformation physique')
  })
})
