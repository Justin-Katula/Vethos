// ═══ COACH — LE CLIENT ═══════════════════════════════════════════════════
//
// La clé DeepSeek ne quitte JAMAIS le serveur : l'application ne connaît
// qu'une adresse et un jeton d'installation anonyme, délivré par le serveur.
// Sans adresse configurée, le Coach n'existe pas — rien ne s'affiche, rien
// ne fait semblant.

import { detecteDetresse, filtrerReponse, MESSAGE_AIDE } from './garde-fous'
import type { DemandeCoach } from './prompt'

export type ClientCoach = {
  disponible: boolean
  /** Rend le texte à montrer, ou null (hors ligne, refusé, filtré) : l'appelant retombe alors sur la phrase du moteur. */
  demander: (d: DemandeCoach) => Promise<string | null>
}

export function creerClientCoach(args: {
  url: string | null | undefined
  lireJeton: () => Promise<string | null>
  ecrireJeton: (jeton: string) => Promise<void>
  fetchImpl?: typeof fetch
  delaiMs?: number
}): ClientCoach {
  const base = args.url?.replace(/\/+$/, '') ?? ''
  const f = args.fetchImpl ?? fetch
  if (!base) return { disponible: false, demander: async () => null }

  const appeler = async (chemin: string, corps: unknown, jeton?: string) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), args.delaiMs ?? 20_000)
    try {
      const r = await f(`${base}${chemin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
        body: JSON.stringify(corps),
        signal: ctrl.signal,
      })
      return r
    } finally {
      clearTimeout(t)
    }
  }

  const jeton = async (): Promise<string | null> => {
    const connu = await args.lireJeton()
    if (connu) return connu
    const r = await appeler('/v1/install', {})
    if (!r.ok) return null
    const j = (await r.json()) as { token?: unknown }
    if (typeof j.token !== 'string') return null
    await args.ecrireJeton(j.token)
    return j.token
  }

  return {
    disponible: true,
    async demander(d) {
      // La détresse se voit AVANT tout appel : l'aide ne dépend pas du réseau.
      if (d.messages.some((m) => m.role === 'user' && detecteDetresse(m.content))) return MESSAGE_AIDE
      try {
        const j = await jeton()
        if (!j) return null
        const r = await appeler('/v1/coach', d, j)
        if (!r.ok) return null
        const corps = (await r.json()) as { texte?: unknown }
        if (typeof corps.texte !== 'string') return null
        // Défense en profondeur : le serveur filtre déjà, l'appareil refiltre.
        return filtrerReponse(corps.texte)?.texte ?? null
      } catch {
        return null
      }
    },
  }
}
