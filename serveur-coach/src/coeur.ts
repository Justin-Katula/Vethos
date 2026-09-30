// ═══ SERVEUR DU COACH — LA LOGIQUE ═══════════════════════════════════════
//
// Pur et testable : pas de socket ici. `serveur.ts` n'est que la prise.
//
// Ce que ce serveur protège, dans l'ordre :
// 1. La clé DeepSeek. Elle vit dans l'environnement du serveur et nulle part
//    ailleurs — ni dans l'app, ni dans une réponse, ni dans un journal.
// 2. Le portefeuille. Un jeton anonyme par installation, qui EXPIRE ; un
//    plafond par installation et par jour ; un plafond global par jour ; un
//    plafond de jetons et d'échecs par adresse (IPv6 regroupé par /64). Même
//    volé, un jeton ne coûte que son plafond, et pas longtemps.
// 3. Les règles du Coach. Le prompt système est construit ICI ; les faits
//    sont une liste fermée par job ; un tour « assistant » n'est accepté que
//    s'il porte la signature du serveur qui l'a produit.

import { Buffer } from 'node:buffer'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { DemandeCoachSchema, messagesPourModele } from '@shared/coach/prompt'
import { detecteDetresse, filtrerReponse, MESSAGE_AIDE } from '@shared/coach/garde-fous'

export type Config = {
  deepseekKey: string
  secret: string
  model: string
  parInstallationParJour: number
  globalParJour: number
  installationsParIpParHeure: number
  /** Appels par adresse (IPv6 : par /64) et par jour, tous jetons confondus. */
  parAdresseParJour: number
  /** Durée de vie d'un jeton, en jours. */
  joursJeton?: number
}

export type Reponse = { status: number; corps: Record<string, unknown> }

/** Une fenêtre de comptage : l'heure ou le jour (UTC) en cours. */
export type Fenetre = 'heure' | 'jour'
export type Prise = { cle: string; fenetre: Fenetre; plafond: number }

/**
 * Où vivent les compteurs des plafonds. En mémoire pour un serveur qui reste
 * allumé ; dans Postgres pour une fonction Supabase, qui repart de zéro à
 * chaque appel. `prendre` est atomique : il ajoute 1 à CHAQUE compteur, ou à
 * aucun si l'un d'eux a déjà atteint son plafond.
 */
export interface Compteurs {
  prendre(prises: readonly Prise[]): Promise<boolean>
  lire(cle: string, fenetre: Fenetre): Promise<number>
}

/** L'identifiant de la fenêtre en cours : un compteur d'hier ne compte plus aujourd'hui. */
export const periode = (fenetre: Fenetre, t: Date) =>
  fenetre === 'heure' ? `h${Math.floor(t.getTime() / 3_600_000)}` : `j${t.toISOString().slice(0, 10)}`

export function compteursEnMemoire(maintenant: () => Date = () => new Date()): Compteurs {
  const n = new Map<string, number>()
  let courant = ''
  const cleDe = (cle: string, f: Fenetre) => `${periode(f, maintenant())}|${cle}`
  // Chaque nouvelle heure, les fenêtres passées s'effacent : aucune mémoire qui grossit sans fin.
  const purger = () => {
    const h = periode('heure', maintenant())
    if (h === courant) return
    courant = h
    const j = periode('jour', maintenant())
    for (const k of n.keys()) if (!k.startsWith(`${h}|`) && !k.startsWith(`${j}|`)) n.delete(k)
  }
  return {
    async prendre(prises) {
      purger()
      if (prises.some((p) => (n.get(cleDe(p.cle, p.fenetre)) ?? 0) >= p.plafond)) return false
      for (const p of prises) n.set(cleDe(p.cle, p.fenetre), (n.get(cleDe(p.cle, p.fenetre)) ?? 0) + 1)
      return true
    },
    async lire(cle, f) {
      purger()
      return n.get(cleDe(cle, f)) ?? 0
    },
  }
}

const b64 = (b: Buffer) => b.toString('base64url')

/** L'adresse qui compte pour les plafonds : une IPv6 se regroupe par /64 (un abonné en a des milliards). */
export function cleAdresse(ip: string): string {
  const v = ip.replace(/^::ffff:/, '')
  if (!v.includes(':')) return v
  const [tete] = v.split('::')
  const blocs = (tete ?? '').split(':').filter(Boolean)
  return `${blocs.slice(0, 4).join(':')}::/64`
}

export function validerConfig(c: Config): string | null {
  if (!c.deepseekKey) return 'DEEPSEEK_API_KEY manquante'
  if (!c.secret || c.secret.length < 32) return 'COACH_SECRET trop court (32 caractères au moins)'
  for (const [k, v] of [
    ['parInstallationParJour', c.parInstallationParJour],
    ['globalParJour', c.globalParJour],
    ['installationsParIpParHeure', c.installationsParIpParHeure],
    ['joursJeton', c.joursJeton ?? 30],
    ['parAdresseParJour', c.parAdresseParJour],
  ] as const) {
    if (!Number.isInteger(v) || v <= 0) return `${k} doit être un entier positif`
  }
  return null
}

export function creerCoeur(
  cfg: Config,
  deps: { fetchImpl?: typeof fetch; maintenant?: () => Date; compteurs?: Compteurs } = {},
) {
  const erreur = validerConfig(cfg)
  if (erreur) throw new Error(erreur)
  const f = deps.fetchImpl ?? fetch
  const now = deps.maintenant ?? (() => new Date())
  const joursJeton = cfg.joursJeton ?? 30
  const compteurs = deps.compteurs ?? compteursEnMemoire(now)
  const MAX_ECHECS = 20

  const hmac = (texte: string) => b64(createHmac('sha256', cfg.secret).update(texte).digest())
  const egal = (a: string, b: string) => {
    const x = Buffer.from(a)
    const y = Buffer.from(b)
    return x.length === y.length && timingSafeEqual(x, y)
  }
  /** Jeton = id.expiration.signature — l'expiration est signée, donc infalsifiable. */
  const verifier = (jeton: string): string | null => {
    const [id, exp, sig] = jeton.split('.')
    if (!id || !exp || !sig || !/^[\w-]{10,64}$/.test(id) || !/^\d{8,13}$/.test(exp)) return null
    if (!egal(hmac(`jeton:${id}.${exp}`), sig)) return null
    return Number(exp) > now().getTime() ? id : null
  }
  return {
    /** Signature d'un tour produit par le serveur : l'app la renvoie telle quelle. */
    /** Un tour est lié à l'installation qui l'a reçu : il ne se rejoue pas ailleurs. */
    signerTour: (installation: string, contenu: string) => hmac(`tour:${installation}:${contenu}`),

    /** Un jeton d'installation anonyme. Aucune donnée personnelle, aucun compte. */
    async installer(ip: string): Promise<Reponse> {
      const cle = cleAdresse(ip)
      if (!(await compteurs.prendre([{ cle: `jetons:${cle}`, fenetre: 'heure', plafond: cfg.installationsParIpParHeure }])))
        return { status: 429, corps: { erreur: 'trop de demandes' } }
      const id = randomUUID().replace(/-/g, '')
      const exp = String(now().getTime() + joursJeton * 86_400_000)
      return { status: 200, corps: { token: `${id}.${exp}.${hmac(`jeton:${id}.${exp}`)}` } }
    },

    async coach(autorisation: string | undefined, brut: unknown, ip = 'inconnue'): Promise<Reponse> {
      const cle = cleAdresse(ip)
      if ((await compteurs.lire(`echecs:${cle}`, 'heure')) >= MAX_ECHECS)
        return { status: 429, corps: { erreur: 'trop d’échecs' } }
      const jeton = autorisation?.startsWith('Bearer ') ? autorisation.slice(7) : ''
      const id = verifier(jeton)
      if (!id) {
        await compteurs.prendre([{ cle: `echecs:${cle}`, fenetre: 'heure', plafond: MAX_ECHECS }])
        return { status: 401, corps: { erreur: 'jeton invalide' } }
      }

      const d = DemandeCoachSchema.safeParse(brut)
      if (!d.success) return { status: 400, corps: { erreur: 'demande invalide' } }
      // Un tour « assistant » que ce serveur n'a pas produit ne passe pas.
      for (const m of d.data.messages) {
        if (m.role === 'assistant' && (!m.sig || !egal(hmac(`tour:${id}:${m.content}`), m.sig)))
          return { status: 400, corps: { erreur: 'tour non signé' } }
      }

      // La détresse ne coûte rien et ne dépend pas du modèle.
      if (d.data.messages.some((m) => m.role === 'user' && detecteDetresse(m.content)))
        return { status: 200, corps: { texte: MESSAGE_AIDE, sig: hmac(`tour:${id}:${MESSAGE_AIDE}`) } }

      // Par installation, par adresse (une seule adresse ne vide pas le plafond
      // global en fabriquant des jetons) et pour tout le monde : les trois ou rien.
      const pris = await compteurs.prendre([
        { cle: `installation:${id}`, fenetre: 'jour', plafond: cfg.parInstallationParJour },
        { cle: `adresse:${cle}`, fenetre: 'jour', plafond: cfg.parAdresseParJour },
        { cle: 'global', fenetre: 'jour', plafond: cfg.globalParJour },
      ])
      if (!pris) return { status: 429, corps: { erreur: 'plafond atteint' } }

      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 15_000)
      try {
        const r = await f('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.deepseekKey}` },
          body: JSON.stringify({
            model: cfg.model,
            messages: messagesPourModele(d.data),
            temperature: 0.4,
            max_tokens: 300,
          }),
          signal: ctrl.signal,
        })
        if (!r.ok) return { status: 502, corps: { erreur: 'modèle indisponible' } }
        const j = (await r.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
        const brutTexte = j.choices?.[0]?.message?.content
        const v = typeof brutTexte === 'string' ? filtrerReponse(brutTexte) : null
        return { status: 200, corps: v ? { texte: v.texte, sig: hmac(`tour:${id}:${v.texte}`) } : { texte: null } }
      } catch {
        return { status: 504, corps: { erreur: 'délai dépassé' } }
      } finally {
        clearTimeout(t)
      }
    },
  }
}
