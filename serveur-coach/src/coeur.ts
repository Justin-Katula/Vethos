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
  /** Durée de vie d'un jeton, en jours. */
  joursJeton?: number
}

export type Reponse = { status: number; corps: Record<string, unknown> }

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
  ] as const) {
    if (!Number.isInteger(v) || v <= 0) return `${k} doit être un entier positif`
  }
  return null
}

export function creerCoeur(cfg: Config, deps: { fetchImpl?: typeof fetch; maintenant?: () => Date } = {}) {
  const erreur = validerConfig(cfg)
  if (erreur) throw new Error(erreur)
  const f = deps.fetchImpl ?? fetch
  const now = deps.maintenant ?? (() => new Date())
  const joursJeton = cfg.joursJeton ?? 30

  let jour = ''
  const parInstallation = new Map<string, number>()
  let global = 0
  // Par heure : jetons délivrés et échecs d'authentification, par adresse.
  let heureCourante = -1
  const jetonsParAdresse = new Map<string, number>()
  const echecsParAdresse = new Map<string, number>()

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
  /** Chaque heure, les compteurs par adresse repartent de zéro : aucune mémoire qui grossit sans fin. */
  const tournerHeure = () => {
    const h = Math.floor(now().getTime() / 3_600_000)
    if (h !== heureCourante) {
      heureCourante = h
      jetonsParAdresse.clear()
      echecsParAdresse.clear()
    }
  }
  const tournerJour = () => {
    const j = now().toISOString().slice(0, 10)
    if (jour !== j) {
      jour = j
      parInstallation.clear()
      global = 0
    }
  }

  return {
    /** Signature d'un tour produit par le serveur : l'app la renvoie telle quelle. */
    signerTour: (contenu: string) => hmac(`tour:${contenu}`),

    /** Un jeton d'installation anonyme. Aucune donnée personnelle, aucun compte. */
    installer(ip: string): Reponse {
      tournerHeure()
      const cle = cleAdresse(ip)
      const n = jetonsParAdresse.get(cle) ?? 0
      if (n >= cfg.installationsParIpParHeure) return { status: 429, corps: { erreur: 'trop de demandes' } }
      jetonsParAdresse.set(cle, n + 1)
      const id = randomUUID().replace(/-/g, '')
      const exp = String(now().getTime() + joursJeton * 86_400_000)
      return { status: 200, corps: { token: `${id}.${exp}.${hmac(`jeton:${id}.${exp}`)}` } }
    },

    async coach(autorisation: string | undefined, brut: unknown, ip = 'inconnue'): Promise<Reponse> {
      tournerHeure()
      const cle = cleAdresse(ip)
      if ((echecsParAdresse.get(cle) ?? 0) >= 20) return { status: 429, corps: { erreur: 'trop d’échecs' } }
      const jeton = autorisation?.startsWith('Bearer ') ? autorisation.slice(7) : ''
      const id = verifier(jeton)
      if (!id) {
        echecsParAdresse.set(cle, (echecsParAdresse.get(cle) ?? 0) + 1)
        return { status: 401, corps: { erreur: 'jeton invalide' } }
      }

      const d = DemandeCoachSchema.safeParse(brut)
      if (!d.success) return { status: 400, corps: { erreur: 'demande invalide' } }
      // Un tour « assistant » que ce serveur n'a pas produit ne passe pas.
      for (const m of d.data.messages) {
        if (m.role === 'assistant' && (!m.sig || !egal(hmac(`tour:${m.content}`), m.sig)))
          return { status: 400, corps: { erreur: 'tour non signé' } }
      }

      // La détresse ne coûte rien et ne dépend pas du modèle.
      if (d.data.messages.some((m) => m.role === 'user' && detecteDetresse(m.content)))
        return { status: 200, corps: { texte: MESSAGE_AIDE, sig: hmac(`tour:${MESSAGE_AIDE}`) } }

      tournerJour()
      const utilise = parInstallation.get(id) ?? 0
      if (utilise >= cfg.parInstallationParJour || global >= cfg.globalParJour)
        return { status: 429, corps: { erreur: 'plafond atteint' } }
      parInstallation.set(id, utilise + 1)
      global++

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
        return { status: 200, corps: v ? { texte: v.texte, sig: hmac(`tour:${v.texte}`) } : { texte: null } }
      } catch {
        return { status: 504, corps: { erreur: 'délai dépassé' } }
      } finally {
        clearTimeout(t)
      }
    },
  }
}
