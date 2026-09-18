/**
 * Vérification d'un résultat de recherche contre les faits de la machine.
 *
 * Question posée : « comment mon application saura-t-elle que ce qu'elle a trouvé
 * est vraiment la bonne application, et non une information venue de nulle part ? »
 *
 * Réponse : elle ne fait jamais confiance au résultat. Elle le confronte à ce que
 * le binaire dit déjà de lui-même — son éditeur, sa version, son nom d'origine,
 * son identité de paquet. Ces faits-là ne viennent d'aucune recherche : ils sont
 * inscrits dans le fichier par celui qui l'a compilé.
 *
 * La règle tient en une ligne :
 *
 *   UNE preuve décisive, OU DEUX preuves fortes — et AUCUNE contradiction.
 *
 * Une ressemblance de nom ne compte jamais comme preuve. C'est précisément elle
 * qui a produit tous les faux résultats mesurés sur cette machine le 2026-09-11 :
 * Elm pour Ollama, iQIYI pour JDownloader, PokerTH pour Armoury Crate.
 */

/** Ce que la machine sait sans avoir rien demandé à personne. */
export interface FaitsLocaux {
  nom: string
  editeur: string | null
  version: string | null
  exeName: string | null
  identitePaquet: string | null
  protocoles: string[]
  extensions: string[]
}

/** Ce qu'une source extérieure prétend. Tout y est suspect jusqu'à vérification. */
export interface CandidatExterne {
  nom: string
  editeur: string | null
  version: string | null
  identitePaquet: string | null
  description: string | null
}

export type NiveauPreuve = 'DECISIF' | 'CONCORDANT' | 'INSUFFISANT' | 'CONTREDIT'

export interface Verdict {
  accepte: boolean
  niveau: NiveauPreuve
  preuves: string[]
  contradictions: string[]
}

/**
 * Réduit un nom d'éditeur à son noyau : on retire les formes juridiques et la
 * ponctuation. « The qBittorrent Project » et « qBittorrent » doivent se
 * reconnaître ; « Ollama » et « elm-lang.org » doivent rester étrangers.
 */
function noyauEditeur(s: string | null): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|sa|sas|sarl|srl|bv|ab|oy|as|plc|pbc|foundation|project|team|studios?|software|technologies|technology|labs?|group|the)\b/g, '')
    .replace(/\.(com|org|net|io|ai|dev|app|fr|ca)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Compare deux versions sur leurs deux premiers nombres : 5.0.3 et 5.0.9 concordent. */
function memeVersion(a: string | null, b: string | null): boolean {
  const n = (s: string | null) => String(s || '').match(/\d+/g)?.slice(0, 2).join('.') || ''
  const va = n(a)
  const vb = n(b)
  return va.length > 0 && va === vb
}

const sansExtension = (s: string | null): string =>
  String(s || '').toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '')

const normalise = (s: string | null): string =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/**
 * Confronte un candidat aux faits locaux.
 *
 * Aucune preuve n'est tirée du nom : deux produits peuvent porter le même nom, et
 * un même produit peut en porter plusieurs. Seuls comptent les faits qu'un tiers
 * ne peut pas inventer par hasard.
 */
export function verifierCandidat(local: FaitsLocaux, candidat: CandidatExterne): Verdict {
  const preuves: string[] = []
  const contradictions: string[] = []

  // --- Preuve décisive : l'identité de paquet ---
  // Elle est délivrée par le système ou par le dépôt, jamais devinée.
  if (local.identitePaquet && candidat.identitePaquet) {
    if (normalise(local.identitePaquet) === normalise(candidat.identitePaquet)) {
      return {
        accepte: true,
        niveau: 'DECISIF',
        preuves: [`identité de paquet identique : ${local.identitePaquet}`],
        contradictions: [],
      }
    }
    contradictions.push(
      `identités de paquet différentes : « ${local.identitePaquet} » contre « ${candidat.identitePaquet} »`,
    )
  }

  // --- Éditeur : la preuve la plus discriminante après l'identité de paquet ---
  const edLocal = noyauEditeur(local.editeur)
  const edCandidat = noyauEditeur(candidat.editeur)
  let fortes = 0

  if (edLocal && edCandidat) {
    if (edLocal === edCandidat || edLocal.includes(edCandidat) || edCandidat.includes(edLocal)) {
      preuves.push(`même éditeur : « ${local.editeur} »`)
      fortes++
    } else {
      contradictions.push(
        `éditeurs incompatibles : le binaire dit « ${local.editeur} », la source dit « ${candidat.editeur} »`,
      )
    }
  }

  // --- Version ---
  if (local.version && candidat.version) {
    if (memeVersion(local.version, candidat.version)) {
      preuves.push(`même version : ${local.version}`)
      fortes++
    } else {
      contradictions.push(`versions différentes : ${local.version} contre ${candidat.version}`)
    }
  }

  // --- Nom d'exécutable retrouvé dans le candidat ---
  // Un tiers ne nomme pas son produit d'après un fichier qu'il n'a pas vu.
  const exe = sansExtension(local.exeName)
  if (exe.length >= 4) {
    const cible = normalise(candidat.nom) + normalise(candidat.description)
    if (cible.includes(exe)) {
      preuves.push(`nom d'exécutable « ${local.exeName} » retrouvé dans la source`)
      fortes++
    }
  }

  // --- Nom STRICTEMENT identique ---
  // Une RESSEMBLANCE de nom ne prouve rien : c'est elle qui a produit tous les faux
  // résultats. Mais une identité EXACTE, une fois les versions et éditions retirées,
  // est d'une autre nature — surtout adossée à un éditeur qui concorde.
  // Mesure du 2026-09-17 : sans cette preuve, « Incredibuild » édité par
  // « Incredibuild Software Ltd. » était refusé face à la fiche du même nom et du
  // même éditeur, faute de version dans le binaire.
  // Le garde-fou tient : « Visual Studio » ne devient jamais « Visual Studio Code »,
  // et « Minecraft » jamais « Minecraft Dungeons II » — ces noms ne sont pas identiques.
  const nomLocalPropre = normalise(
    String(local.nom).replace(/\([^)]*\)/g, ' ').replace(/\b\d+(\.\d+)+[\w.-]*\b/g, ' '),
  )
  const nomCandidatPropre = normalise(
    String(candidat.nom).replace(/\([^)]*\)/g, ' ').replace(/\b\d+(\.\d+)+[\w.-]*\b/g, ' '),
  )
  if (nomLocalPropre.length >= 4 && nomLocalPropre === nomCandidatPropre) {
    preuves.push(`nom strictement identique : « ${candidat.nom} »`)
    fortes++
  }

  // --- Verdict ---
  // Une seule contradiction suffit à tout annuler : deux faits qui se contredisent
  // ne parlent pas du même produit, même si dix autres concordent.
  if (contradictions.length > 0) {
    return { accepte: false, niveau: 'CONTREDIT', preuves, contradictions }
  }
  if (fortes >= 2) {
    return { accepte: true, niveau: 'CONCORDANT', preuves, contradictions }
  }

  return { accepte: false, niveau: 'INSUFFISANT', preuves, contradictions }
}

export interface Choix {
  retenu: CandidatExterne | null
  verdict: Verdict | null
  /** Candidats ayant passé la vérification. Plusieurs = ambiguïté = refus. */
  nbAcceptes: number
  raisonRefus: string | null
}

/**
 * Choisit AU PLUS un candidat parmi ceux proposés par une source extérieure.
 *
 * Règle ajoutée après mesure : la concordance d'éditeur ne suffit pas quand un
 * éditeur publie plusieurs produits. Le 2026-09-17, une recherche sur
 * « Visual Studio » a renvoyé trois fiches — Visual Studio Code, Visual Studio
 * Community et Visual Studio Code Insiders — toutes éditées par Microsoft
 * Corporation, donc toutes vérifiées avec succès. Retenir la première aurait
 * confondu deux produits distincts.
 *
 * L'ambiguïté vaut donc refus, exactement comme pour le rattachement des noms.
 * Ne rien conclure est toujours préférable à désigner le mauvais produit.
 */
export function choisirCandidat(local: FaitsLocaux, candidats: readonly CandidatExterne[]): Choix {
  if (candidats.length === 0) {
    return { retenu: null, verdict: null, nbAcceptes: 0, raisonRefus: 'aucun candidat proposé' }
  }

  const juges = candidats.map((c) => ({ c, v: verifierCandidat(local, c) }))

  // Une preuve décisive tranche seule, même si d'autres candidats concordent.
  const decisifs = juges.filter((j) => j.v.niveau === 'DECISIF')
  if (decisifs.length === 1) {
    return { retenu: decisifs[0]!.c, verdict: decisifs[0]!.v, nbAcceptes: 1, raisonRefus: null }
  }
  if (decisifs.length > 1) {
    return { retenu: null, verdict: null, nbAcceptes: decisifs.length, raisonRefus: 'plusieurs identités de paquet identiques' }
  }

  const acceptes = juges.filter((j) => j.v.accepte)
  if (acceptes.length === 1) {
    return { retenu: acceptes[0]!.c, verdict: acceptes[0]!.v, nbAcceptes: 1, raisonRefus: null }
  }
  if (acceptes.length > 1) {
    return {
      retenu: null,
      verdict: null,
      nbAcceptes: acceptes.length,
      raisonRefus: `${acceptes.length} candidats concordent, aucun ne se distingue : ${acceptes.map((a) => a.c.nom).join(', ')}`,
    }
  }

  return { retenu: null, verdict: null, nbAcceptes: 0, raisonRefus: 'aucun candidat ne résiste à la vérification' }
}
