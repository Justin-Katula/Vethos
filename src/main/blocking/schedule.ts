/**
 * Répond à la seule question dont dépend tout le mécanisme de blocage :
 * *selon les règles, une session devrait-elle être active maintenant ?*
 *
 * Vethos ne restaure jamais une session sauvegardée. À chaque réveil il pose
 * cette question et aligne la réalité sur la réponse. C'est ce qui lui permet
 * de se comporter comme une alarme : fenêtre fermée, machine sortie de veille
 * ou fraîchement redémarrée, le verdict ne dépend que des règles et de l'heure.
 *
 * Il n'existe qu'une source de vérité : le bloc du planning confirmé par
 * « Je commence ». La page Blocage ne possède plus sa propre minuterie.
 *
 * Module pur : l'heure entre toujours en paramètre, jamais lue ici.
 */

/**
 * D.8 : une session pilotée par un bloc du planning (tâche, objectif ou ancre),
 * ouverte par la confirmation « Je commence ».
 *
 * C'est le pont entre le mécanisme de blocage (Point 1) et le moteur de
 * planification (Point 2). Point 1 continue de fournir toute l'infrastructure —
 * overlay, sonde de fenêtre, masquage — et ne change pas d'une ligne : le
 * moteur décide simplement QUOI bloquer et QUAND, selon le bloc réellement actif.
 */
export type BlockSession = {
  /** Id du bloc confirmé, tel que produit par le moteur. */
  blockId: string
  startedAt: number
  endsAt: number
  /** `apps_à_bloquer(bloc)` — exactement cette liste, jamais celle d'un créneau. */
  appIds: string[]
  blockedSites?: string[]
}

export type BlockingRules = {
  /** D.8 : bloc actif, s'il y en a un. */
  block?: BlockSession | null
}

export type ActiveSession = {
  blockedAppIds: string[]
  /** Domaines bloqués, union de toutes les sources actives. */
  blockedSites: string[]
  endsAt: number
}

/** D.8 : même fenêtre semi-ouverte [début, fin) que partout ailleurs. */
export function blockSessionIsActiveAt(block: BlockSession, now: Date): boolean {
  const stamp = now.getTime()
  return block.endsAt > block.startedAt && block.startedAt <= stamp && stamp < block.endsAt
}

/**
 * Renvoie le bloc confirmé actif, et lui seul. Les anciennes valeurs
 * persistées `manual`/`slots` sont volontairement ignorées : une mise à jour
 * ne doit jamais ressusciter une ancienne session autonome.
 */
export function activeSessionAt(rules: BlockingRules, now: Date): ActiveSession | null {
  const block = rules.block
  if (block == null || !blockSessionIsActiveAt(block, now)) return null
  return {
    blockedAppIds: [...new Set(block.appIds)],
    blockedSites: [...new Set(block.blockedSites ?? [])],
    endsAt: block.endsAt,
  }
}
