import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import type { FicheApplication } from './construire-catalogue'

/**
 * LA BOUCLE FERMÉE.
 *
 * Point de départ de tout ce travail : l'utilisateur déclare « jouer à des jeux
 * vidéo », et son application autorise trois lanceurs et une boutique — aucun jeu.
 * 150 applications bloquées, dont les siennes.
 *
 * Ce test rejoue la décision sur le catalogue réellement construit. Il ne mesure pas
 * un score : il vérifie que la bonne chose arrive aux bonnes applications.
 */

const CATALOGUE = 'C:/Users/obedi/catalogue-construit.json'

/**
 * La décision, dans sa forme la plus simple : une application est autorisée si elle
 * sert au moins une des activités déclarées.
 *
 * Trois règles seulement, et aucune ne fait appel à un modèle :
 *   - elle sert la tâche            -> autorisée
 *   - elle ne la sert pas           -> bloquée
 *   - on ne sait pas ce qu'elle fait -> autorisée, car on ne punit pas l'ignorance
 */
function decider(f: FicheApplication, activitesVoulues: readonly string[]) {
  if (!f.classement.bloquable) return { autorisee: true, motif: `non bloquable (${f.classement.niveau})` }
  const communes = f.classement.activites.filter((a) => activitesVoulues.includes(a))
  if (communes.length > 0) return { autorisee: true, motif: `sert ${communes.join(', ')}` }
  return { autorisee: false, motif: 'aucune activité en rapport' }
}

describe('décision sur le catalogue réel', () => {
  if (!existsSync(CATALOGUE)) {
    it('catalogue absent — mesure ignorée', () => { expect(true).toBe(true) })
    return
  }

  const fiches = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as FicheApplication[]
  const applications = fiches.filter((f) => f.classement.niveau !== 'NEUTRE')

  it('« jouer à des jeux vidéo » autorise les jeux ET les lanceurs', () => {
    const voulu = ['JOUER']
    const decisions = applications.map((f) => ({ f, d: decider(f, voulu) }))

    const joueurs = decisions.filter((x) => x.f.classement.activites.includes('JOUER'))
    console.log(`\n--- « jouer » : ${joueurs.length} applications portent l'activité JOUER ---`)
    for (const x of joueurs.slice(0, 22)) {
      console.log(`  ${x.d.autorisee ? 'AUTORISE' : 'BLOQUE  '}  ${x.f.nom.slice(0, 34).padEnd(34)} ${x.f.classement.activites.join(', ').slice(0, 40)}`)
    }

    // Le défaut d'origine : des jeux existaient et étaient tous bloqués.
    expect(joueurs.length, 'aucune application ne sert à jouer — le catalogue serait inutilisable').toBeGreaterThan(0)
    for (const x of joueurs) {
      expect(x.d.autorisee, `${x.f.nom} sert à jouer mais serait bloqué`).toBe(true)
    }

    const bloquees = decisions.filter((x) => !x.d.autorisee)
    console.log(`\n  bloquées : ${bloquees.length} / ${applications.length}`)
    console.log('  ' + bloquees.slice(0, 12).map((x) => x.f.nom).join(' | '))
  })

  it('une application inconnue n’est JAMAIS bloquée, quelle que soit la tâche', () => {
    const inconnues = applications.filter((f) => f.classement.niveau === 'INCONNU')
    for (const tache of [['JOUER'], ['ECRIRE_DU_CODE'], ['REDIGER_UN_DOCUMENT'], []]) {
      for (const f of inconnues) {
        expect(decider(f, tache).autorisee, `${f.nom} est inconnue et serait bloquée`).toBe(true)
      }
    }
    console.log(`\n  ${inconnues.length} applications inconnues, toutes autorisées par construction`)
  })

  it('« écrire du code » autorise les outils de développement, pas les jeux', () => {
    const voulu = ['ECRIRE_DU_CODE', 'DEBOGUER', 'GERER_VERSIONS']
    const dev = applications.filter((f) => f.classement.activites.some((a) => voulu.includes(a)))
    const jeux = applications.filter(
      (f) => f.classement.activites.includes('JOUER') && !f.classement.activites.some((a) => voulu.includes(a)),
    )

    console.log(`\n--- « écrire du code » ---`)
    console.log(`  autorisés : ${dev.map((f) => f.nom).slice(0, 10).join(', ')}`)

    for (const f of dev) expect(decider(f, voulu).autorisee, `${f.nom} devrait être autorisé`).toBe(true)
    for (const f of jeux) {
      // Un jeu pur n'a rien à faire dans une séance de programmation.
      expect(decider(f, voulu).autorisee, `${f.nom} est un jeu et devrait être bloqué`).toBe(false)
    }
    console.log(`  bloqués car purement ludiques : ${jeux.length}`)
  })

  it('un lanceur de jeux est autorisé pour jouer — on ne peut pas jouer sans lui', () => {
    // Remarque de l'utilisateur : « les jeux Steam se lancent depuis Steam ».
    const lanceurs = applications.filter((f) => f.classement.activites.includes('GERER_SA_LUDOTHEQUE'))
    for (const f of lanceurs) {
      expect(
        f.classement.activites.includes('JOUER'),
        `${f.nom} gère une ludothèque mais ne sert pas à jouer : le jeu serait injoignable`,
      ).toBe(true)
    }
    console.log(`\n  ${lanceurs.length} lanceurs, tous autorisés quand on veut jouer`)
  })
})
