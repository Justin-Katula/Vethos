import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Chiffre le contenu avant qu'il ne touche le disque.
 *
 * Injecté plutôt qu'importé : le chiffrement réel s'appuie sur `safeStorage`
 * d'Electron, et ce module doit rester utilisable — et testable — sans lui.
 */
export type Coffre = {
  chiffrer: (clair: string) => string
  dechiffrer: (chiffre: string) => string
}

/**
 * Enveloppe d'un fichier chiffré. Sa présence distingue un fichier chiffré d'un
 * fichier en clair écrit par une version précédente : on peut donc lire les deux
 * sans rien demander à l'utilisateur, et le fichier se chiffre à sa prochaine
 * écriture. Aucune donnée n'est perdue à la mise à jour.
 */
type Enveloppe = { vethosChiffre: 1; charge: string }

function estEnveloppe(valeur: unknown): valeur is Enveloppe {
  return (
    typeof valeur === 'object' &&
    valeur !== null &&
    (valeur as Enveloppe).vethosChiffre === 1 &&
    typeof (valeur as Enveloppe).charge === 'string'
  )
}

let writeCounter = 0
const writeQueues = new Map<string, Promise<void>>()

/**
 * Écrit `data` en JSON dans `filePath` de façon atomique.
 * Stratégie : écrire dans un fichier temporaire unique puis `rename`
 * (atomique sur NTFS).
 * Si le process crash entre les deux, le fichier original reste intact.
 */
async function writeAtomically<T>(filePath: string, data: T, coffre?: Coffre): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${writeCounter++}.tmp`
  const clair = JSON.stringify(data, null, 2)
  const json = coffre
    ? JSON.stringify({ vethosChiffre: 1, charge: coffre.chiffrer(clair) } satisfies Enveloppe)
    : clair
  try {
    await fs.writeFile(tmpPath, json, 'utf8')
    await fs.rename(tmpPath, filePath)
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined)
    throw err
  }
}

export function atomicWrite<T>(filePath: string, data: T, coffre?: Coffre): Promise<void> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(() => writeAtomically(filePath, data, coffre))
  writeQueues.set(filePath, next)
  next
    .finally(() => {
      if (writeQueues.get(filePath) === next) {
        writeQueues.delete(filePath)
      }
    })
    .catch(() => undefined)
  return next
}

/**
 * Lit `filePath` et le parse comme JSON.
 * Retourne `null` si le fichier n'existe pas.
 * Lève une erreur si le JSON est invalide (à gérer par l'appelant).
 */
export async function atomicRead<T>(filePath: string, coffre?: Coffre): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const brut: unknown = JSON.parse(content)
    // Fichier en clair d'une version precedente : on le rend tel quel. Il sera
    // chiffre a sa prochaine ecriture.
    if (!estEnveloppe(brut)) return brut as T
    if (!coffre) {
      // Chiffré, mais plus personne pour le déchiffrer.
      throw new SyntaxError('Encrypted file and no vault available.')
    }
    try {
      return JSON.parse(coffre.dechiffrer(brut.charge)) as T
    } catch {
      // Déchiffrement impossible : fichier copié depuis une autre machine ou un
      // autre compte Windows. On le traite comme un fichier corrompu — l'appelant
      // le met de côté en `.bak` et repart à zéro plutôt que de planter.
      throw new SyntaxError('Cannot decrypt: this file came from somewhere else.')
    }
  } catch (err) {
    if (isNoEntryError(err)) {
      return null
    }
    throw err
  }
}

function isNoEntryError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT'
}
