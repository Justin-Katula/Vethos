// ═══ COACH — LE CLIENT ═══════════════════════════════════════════════════
//
// La clé DeepSeek ne quitte JAMAIS le serveur : l'application ne connaît
// qu'une adresse et un jeton d'installation anonyme, délivré par le serveur.
// Sans adresse configurée, le Coach n'existe pas — rien ne s'affiche, rien
// ne fait semblant.

import { detecteDetresse, filtrerReponse, MESSAGE_AIDE } from './garde-fous'
import type { DemandeCoach } from './prompt'
import type { DemandeArbitre } from './arbitre'

/** Une réponse du Coach, et la signature du serveur qui l'accompagne (pour la renvoyer dans la conversation). */
export type Tour = { texte: string; sig?: string }

export type ClientCoach = {
  disponible: boolean
  /** Rend le tour à montrer, ou null (hors ligne, refusé, filtré) : l'appelant retombe alors sur la phrase du moteur. */
  converser: (d: DemandeCoach) => Promise<Tour | null>
  /** Le texte seul. */
  demander: (d: DemandeCoach) => Promise<string | null>
  /**
   * Le juge d'un Stop ou d'un Later. Ne lève jamais : hors ligne, serveur
   * muet ou plafond atteint → `indecis`, et l'app applique ses règles fixes.
   */
  arbitrer: (d: DemandeArbitre) => Promise<ReponseArbitre>
}

export type ReponseArbitre =
  | { action: 'question'; question: string; sig: string }
  | { action: 'decision'; decision: 'accepte' | 'refuse'; incoherence: { a: string; b: string } | null }
  | { action: 'aide'; message: string }
  | { action: 'indecis' }

export function creerClientCoach(args: {
  url: string | null | undefined
  lireJeton: () => Promise<string | null>
  ecrireJeton: (jeton: string | null) => Promise<void>
  fetchImpl?: typeof fetch
  delaiMs?: number
  /** La session du compte, pour le plafond par compte du juge. */
  session?: () => Promise<string | null>
}): ClientCoach {
  const base = args.url?.replace(/\/+$/, '') ?? ''
  const f = args.fetchImpl ?? fetch
  if (!base) return { disponible: false, converser: async () => null, demander: async () => null, arbitrer: async () => ({ action: 'indecis' }) }

  const appeler = async (chemin: string, corps: unknown, jeton?: string, entetes: Record<string, string> = {}) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), args.delaiMs ?? 20_000)
    try {
      return await f(`${base}${chemin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), ...entetes },
        body: JSON.stringify(corps),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(t)
    }
  }

  const jeton = async (neuf = false): Promise<string | null> => {
    if (!neuf) {
      const connu = await args.lireJeton()
      if (connu) return connu
    }
    const r = await appeler('/v1/install', {})
    if (!r.ok) return null
    const j = (await r.json()) as { token?: unknown }
    if (typeof j.token !== 'string') return null
    await args.ecrireJeton(j.token)
    return j.token
  }

  const converser = async (d: DemandeCoach): Promise<Tour | null> => {
    // La détresse se voit AVANT tout appel : l'aide ne dépend pas du réseau.
    if ((d.messages ?? []).some((m) => m.role === 'user' && detecteDetresse(m.content))) return { texte: MESSAGE_AIDE }
    try {
      let j = await jeton()
      if (!j) return null
      let r = await appeler('/v1/coach', d, j)
      // Jeton expiré ou secret changé : on en demande un neuf, une fois.
      if (r.status === 401) {
        await args.ecrireJeton(null)
        j = await jeton(true)
        if (!j) return null
        r = await appeler('/v1/coach', d, j)
        // Les tours signés pour l'ancien jeton ne valent plus : on repart du
        // dernier message de l'utilisateur.
        if (r.status === 400 && (d.messages ?? []).length > 1) {
          const dernier = d.messages![d.messages!.length - 1]!
          r = await appeler('/v1/coach', { ...d, messages: [{ role: 'user', content: dernier.content }] }, j)
        }
      }
      if (!r.ok) return null
      const corps = (await r.json()) as { texte?: unknown; sig?: unknown }
      if (typeof corps.texte !== 'string') return null
      // Défense en profondeur : le serveur filtre déjà, l'appareil refiltre.
      const v = filtrerReponse(corps.texte)
      if (!v) return null
      return v.texte === corps.texte && typeof corps.sig === 'string' ? { texte: v.texte, sig: corps.sig } : { texte: v.texte }
    } catch {
      return null
    }
  }

  const arbitrer = async (d: DemandeArbitre): Promise<ReponseArbitre> => {
    if ([d.texte, ...d.echanges.map((e) => e.reponse)].some((t) => detecteDetresse(t))) return { action: 'aide', message: MESSAGE_AIDE }
    try {
      const session = (await args.session?.().catch(() => null)) ?? null
      const entetes: Record<string, string> = session ? { 'x-vethos-session': session } : {}
      let j = await jeton()
      if (!j) return { action: 'indecis' }
      let r = await appeler('/v1/arbitre', d, j, entetes)
      if (r.status === 401) {
        await args.ecrireJeton(null)
        j = await jeton(true)
        if (!j) return { action: 'indecis' }
        r = await appeler('/v1/arbitre', d, j, entetes)
      }
      if (!r.ok) return { action: 'indecis' }
      const c = (await r.json()) as Record<string, unknown>
      if (c.action === 'question' && typeof c.question === 'string' && typeof c.sig === 'string') return { action: 'question', question: c.question, sig: c.sig }
      if (c.action === 'decision' && (c.decision === 'accepte' || c.decision === 'refuse')) {
        const i = c.incoherence as { a?: unknown; b?: unknown } | null | undefined
        return { action: 'decision', decision: c.decision, incoherence: i && typeof i.a === 'string' && typeof i.b === 'string' ? { a: i.a, b: i.b } : null }
      }
      if (c.action === 'aide' && typeof c.message === 'string') return { action: 'aide', message: c.message }
      return { action: 'indecis' }
    } catch {
      return { action: 'indecis' }
    }
  }

  return {
    disponible: true,
    converser,
    demander: async (d) => (await converser(d))?.texte ?? null,
    arbitrer,
  }
}
