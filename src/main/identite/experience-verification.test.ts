import { describe, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { choisirCandidat, type FaitsLocaux, type CandidatExterne } from './verification'

/**
 * EXPÉRIENCE SUR DONNÉES RÉELLES.
 *
 * Ce n'est pas un test de régression : c'est la mesure de ce que la chaîne complète
 * donne sur la machine de l'utilisateur.
 *
 *   producteur de candidats (index winget)  ->  vérificateur  ->  décision
 *
 * L'index winget est un annuaire de logiciels, pas un modèle de langage. Sa
 * recherche floue se trompe souvent — 1 bon résultat sur 8 au premier essai. Le
 * vérificateur est là pour que ces erreurs soient rejetées plutôt que crues.
 *
 * Le test ne fait AUCUNE assertion sur le nombre de résultats : il rapporte. Une
 * assertion sur un chiffre issu d'une machine particulière ne prouverait rien.
 */

const CANDIDATS = 'C:/Users/obedi/candidats.json'

describe('chaîne complète de résolution des applications inconnues', () => {
  it('mesure ce qui est confirmé, rejeté, ou laissé inconnu', () => {
    if (!existsSync(CANDIDATS)) {
      console.log('fichier de candidats absent — expérience ignorée')
      return
    }

    const brut = JSON.parse(readFileSync(CANDIDATS, 'utf8')) as Array<{
      nom: string
      requete: string
      faits: Record<string, string | null>
      candidats: Array<Record<string, string | null>>
    }>

    let confirmees = 0
    let sansCandidat = 0
    let rejetees = 0
    let ambigues = 0
    const detailsConfirmes: string[] = []
    const detailsRejetes: string[] = []

    for (const item of brut) {
      const local: FaitsLocaux = {
        nom: item.nom,
        editeur: item.faits.editeur ?? null,
        version: item.faits.version ?? null,
        exeName: item.faits.exeName ?? null,
        identitePaquet: item.faits.identitePaquet ?? null,
        protocoles: [],
        extensions: [],
      }
      const candidats: CandidatExterne[] = item.candidats.map((c) => ({
        nom: c.nom ?? '',
        editeur: c.editeur ?? null,
        version: c.version ?? null,
        identitePaquet: (c as { id?: string }).id ?? null,
        description: c.description ?? null,
      }))

      if (candidats.length === 0) {
        sansCandidat++
        continue
      }

      const choix = choisirCandidat(local, candidats)
      if (choix.retenu) {
        confirmees++
        detailsConfirmes.push(
          `  ${item.nom.slice(0, 30).padEnd(30)} -> ${choix.retenu.nom.slice(0, 28).padEnd(28)} | ${choix.verdict!.preuves.join(' + ')}`,
        )
      } else if (choix.nbAcceptes > 1) {
        ambigues++
        detailsRejetes.push(`  AMBIGU   ${item.nom.slice(0, 30).padEnd(30)} | ${choix.raisonRefus}`)
      } else {
        rejetees++
        const nomsProposes = candidats.map((c) => c.nom).join(', ')
        detailsRejetes.push(`  REJETE   ${item.nom.slice(0, 30).padEnd(30)} | proposé : ${nomsProposes.slice(0, 50)}`)
      }
    }

    const total = brut.length
    console.log('\n' + '='.repeat(74))
    console.log('RESOLUTION DES APPLICATIONS INCONNUES — chaine complete')
    console.log('='.repeat(74));
    [
      ['inconnues traitees', total],
      ['CONFIRMEES par verification', confirmees],
      ['rejetees : le candidat contredit les faits', rejetees],
      ['rejetees : plusieurs candidats concordent', ambigues],
      ['aucun candidat propose', sansCandidat],
    ].forEach(([k, v]) => console.log(`  ${String(k).padEnd(48, '.')} ${String(v).padStart(4)}`))

    console.log('\n--- CONFIRMEES : le candidat resiste aux faits du binaire ---')
    for (const d of detailsConfirmes) console.log(d)

    console.log('\n--- REFUSEES : aucune conclusion, plutot que la mauvaise ---')
    for (const d of detailsRejetes.slice(0, 22)) console.log(d)
  })
})
