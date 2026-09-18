import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { construireCatalogue, indexerIdentifiantsWinget, mesurer, type EntreeInventaire, type SourcesExternes } from './construire-catalogue'

/**
 * Construction du catalogue sur les données RÉELLES de la machine, et mesure de la
 * couverture. C'est l'épreuve de l'objectif : chaque application connue et classée.
 *
 * Les seules assertions portent sur les INVARIANTS de sûreté, jamais sur un chiffre
 * de couverture — un chiffre mesuré sur une machine particulière ne prouverait rien
 * ailleurs, alors que les invariants doivent tenir partout.
 */

const F = {
  inv: 'C:/Users/obedi/identite-locale.json',
  prot: 'C:/Users/obedi/protocoles.json',
  ext: 'C:/Users/obedi/extensions.json',
  win: 'C:/Users/obedi/winget-ids.json',
  store: 'C:/Users/obedi/store-titres.json',
  desc: 'C:/Users/obedi/descriptions.json',
  resolues: 'C:/Users/obedi/inconnues-resolues.json',
  sortie: 'C:/Users/obedi/catalogue-construit.json',
}

const basename = (p: string): string => {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return (i >= 0 ? p.slice(i + 1) : p).toLowerCase()
}

function grouper(liste: Array<{ exe?: string }>, cle: string): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const e of liste) {
    if (!e.exe) continue
    const b = basename(String(e.exe))
    if (!m.has(b)) m.set(b, [])
    m.get(b)!.push(String((e as Record<string, unknown>)[cle]))
  }
  return m
}

/** Regroupe par DOSSIER de l'executable : les associations sont rarement posees
 *  sur le binaire principal. */
function grouperParDossier(liste: Array<{ exe?: string }>, cle: string): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const e of liste) {
    if (!e.exe) continue
    const chemin = String(e.exe).toLowerCase()
    const i = Math.max(chemin.lastIndexOf('\\'), chemin.lastIndexOf('/'))
    if (i < 0) continue
    const dossier = chemin.slice(0, i)
    if (!m.has(dossier)) m.set(dossier, [])
    m.get(dossier)!.push(String((e as Record<string, unknown>)[cle]))
  }
  return m
}

describe('catalogue construit sur la machine réelle', () => {
  it('classe les applications et respecte les invariants de sûreté', () => {
    for (const f of Object.values(F).slice(0, 5)) {
      if (!existsSync(f)) {
        console.log(`donnée manquante (${f}) — mesure ignorée`)
        return
      }
    }

    const inventaire = JSON.parse(readFileSync(F.inv, 'utf8')) as EntreeInventaire[]
    const protocoles = JSON.parse(readFileSync(F.prot, 'utf8')) as Array<{ exe?: string; protocole: string }>
    const extensions = JSON.parse(readFileSync(F.ext, 'utf8')) as Array<{ exe?: string; extension: string }>
    const winget = JSON.parse(readFileSync(F.win, 'utf8')) as Array<{ nom: string; id: string; forme: string }>
    const store = JSON.parse(readFileSync(F.store, 'utf8')) as Array<{ pfn: string; statut: string; titre?: string }>
    const desc = JSON.parse(readFileSync(F.desc, 'utf8')) as Array<{ id: string; description: string | null; etiquettes: string[] }>
    const resolues = existsSync(F.resolues)
      ? (JSON.parse(readFileSync(F.resolues, 'utf8')) as Array<{ emplacement: string | null; retenu: { id: string; description: string | null; etiquettes?: string[] } | null }>)
      : []

    const sources: SourcesExternes = {
      titresStore: new Map(store.filter((s) => s.statut === 'RESOLU' && s.titre).map((s) => [s.pfn, s.titre!])),
      descriptionsStore: new Map(
        store
          .filter((s) => s.statut === 'RESOLU')
          .map((s) => [
            s.pfn,
            { description: (s as { description?: string | null }).description ?? null, etiquettes: (s as { etiquettes?: string[] }).etiquettes || [] },
          ]),
      ),
      identifiantsWinget: indexerIdentifiantsWinget(winget),
      protocolesParExe: grouper(protocoles, 'protocole'),
      extensionsParExe: grouper(extensions, 'extension'),
      protocolesParDossier: grouperParDossier(protocoles, 'protocole'),
      extensionsParDossier: grouperParDossier(extensions, 'extension'),
      descriptions: new Map(desc.map((d) => [d.id, { description: d.description, etiquettes: d.etiquettes || [] }])),
      resolutionsConfirmees: new Map(
        resolues
          .filter((r) => r.retenu && r.emplacement)
          .map((r) => [
            String(r.emplacement).toLowerCase().replace(/\\+$/, ''),
            { id: r.retenu!.id, description: r.retenu!.description, etiquettes: r.retenu!.etiquettes || [] },
          ]),
      ),
    }

    const fiches = construireCatalogue(inventaire, sources)
    const m = mesurer(fiches)

    const l = (k: string, v: number | string) => console.log(`  ${k.padEnd(48, '.')} ${String(v).padStart(5)}`)
    console.log('\n' + '='.repeat(70))
    console.log('CATALOGUE CONSTRUIT — machine réelle')
    console.log('='.repeat(70))
    l('entrées inventoriées', m.total)
    l('NEUTRES (pilotes, services, composants)', m.neutres)
    l('applications', m.applications)
    l('  classées (preuve ou description)', m.classees)
    l('    dont par preuve locale', fiches.filter((f) => f.classement.niveau === 'PROUVE').length)
    l('    dont par description officielle', fiches.filter((f) => f.classement.niveau === 'DEDUIT').length)
    l('  inconnues (jamais bloquées)', m.inconnues)
    l('taux de classement', m.tauxClassement + ' %')
    l('bloquables SANS preuve (doit être 0)', m.bloquablesSansPreuve)

    // Répartition des activités effectivement attribuées.
    const parActivite = new Map<string, number>()
    for (const f of fiches) for (const a of f.classement.activites) parActivite.set(a, (parActivite.get(a) || 0) + 1)
    console.log('\n--- activités attribuées ---')
    for (const [a, n] of [...parActivite.entries()].sort((x, y) => y[1] - x[1])) {
      console.log(`  ${String(n).padStart(3)}  ${a}`)
    }

    console.log('\n--- échantillon de fiches classées ---')
    for (const f of fiches.filter((x) => x.classement.niveau === 'PROUVE' || x.classement.niveau === 'DEDUIT').slice(0, 18)) {
      console.log(`  ${f.nom.slice(0, 30).padEnd(30)} | ${f.classement.activites.join(', ').slice(0, 56)}`)
    }

    const inconnues = fiches.filter((f) => f.classement.niveau === 'INCONNU')
    console.log(`\n--- ${inconnues.length} applications encore inconnues ---`)
    console.log('  ' + inconnues.map((f) => f.nom).filter(Boolean).slice(0, 35).join(' | '))

    writeFileSync(F.sortie, JSON.stringify(fiches, null, 2))

    // --- INVARIANTS : ce qui doit tenir sur n'importe quelle machine ---
    expect(m.bloquablesSansPreuve, 'aucune application ne peut être bloquée sans preuve').toBe(0)
    for (const f of fiches) {
      if (f.classement.niveau === 'PROUVE' || f.classement.niveau === 'DEDUIT') {
        expect(f.classement.activites.length, `${f.nom} est classe mais sans activite`).toBeGreaterThan(0)
        expect(f.classement.justifications.length, `${f.nom} est classe sans justification`).toBeGreaterThan(0)
      } else {
        expect(f.classement.activites, `${f.nom} n'est pas classe mais porte des activites`).toEqual([])
        expect(f.classement.bloquable, `${f.nom} n'est pas classe mais reste bloquable`).toBe(false)
      }
    }
  })
})
