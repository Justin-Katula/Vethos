// ═══ SERVEUR DU COACH — LA LOGIQUE ═══════════════════════════════════════
//
// Pur et testable : pas de socket ici. `serveur.ts` n'est que la prise.
//
// Ce que ce serveur protège, dans l'ordre :
// 1. La clé DeepSeek. Elle vit dans l'environnement du serveur et nulle part
//    ailleurs — ni dans l'app, ni dans une réponse, ni dans un journal.
// 2. Le portefeuille. Un jeton anonyme par installation, un plafond par
//    installation et par jour, un plafond global par jour, un plafond de
//    jetons par IP. Même volé, un jeton ne coûte que son plafond.
// 3. Les règles du Coach. Le prompt système est construit ICI : l'app envoie
//    des faits et des messages, jamais des consignes.

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
}

export type Reponse = { status: number; corps: Record<string, unknown> }

type Compteurs = { jour: string; parInstallation: Map<string, number>; global: number; ipHeure: Map<string, { heure: number; n: number }> }

const b64 = (b: Buffer) => b.toString('base64url')

export function creerCoeur(cfg: Config, deps: { fetchImpl?: typeof fetch; maintenant?: () => Date } = {}) {
  const f = deps.fetchImpl ?? fetch
  const now = deps.maintenant ?? (() => new Date())
  const c: Compteurs = { jour: '', parInstallation: new Map(), global: 0, ipHeure: new Map() }

  const signer = (id: string) => b64(createHmac('sha256', cfg.secret).update(id).digest())
  const verifier = (jeton: string): string | null => {
    const [id, sig] = jeton.split('.')
    if (!id || !sig || !/^[\w-]{10,64}$/.test(id)) return null
    const attendu = Buffer.from(signer(id))
    const recu = Buffer.from(sig)
    return attendu.length === recu.length && timingSafeEqual(attendu, recu) ? id : null
  }
  const nouveauJour = () => {
    const j = now().toISOString().slice(0, 10)
    if (c.jour !== j) {
      c.jour = j
      c.parInstallation.clear()
      c.global = 0
    }
  }

  return {
    /** Un jeton d'installation anonyme. Aucune donnée personnelle, aucun compte. */
    installer(ip: string): Reponse {
      const heure = Math.floor(now().getTime() / 3_600_000)
      const e = c.ipHeure.get(ip)
      const n = e && e.heure === heure ? e.n : 0
      if (n >= cfg.installationsParIpParHeure) return { status: 429, corps: { erreur: 'trop de demandes' } }
      c.ipHeure.set(ip, { heure, n: n + 1 })
      const id = randomUUID().replace(/-/g, '')
      return { status: 200, corps: { token: `${id}.${signer(id)}` } }
    },

    async coach(autorisation: string | undefined, brut: unknown): Promise<Reponse> {
      const jeton = autorisation?.startsWith('Bearer ') ? autorisation.slice(7) : ''
      const id = verifier(jeton)
      if (!id) return { status: 401, corps: { erreur: 'jeton invalide' } }

      const d = DemandeCoachSchema.safeParse(brut)
      if (!d.success) return { status: 400, corps: { erreur: 'demande invalide' } }

      // La détresse ne coûte rien et ne dépend pas du modèle.
      if (d.data.messages.some((m) => m.role === 'user' && detecteDetresse(m.content)))
        return { status: 200, corps: { texte: MESSAGE_AIDE } }

      nouveauJour()
      const utilise = c.parInstallation.get(id) ?? 0
      if (utilise >= cfg.parInstallationParJour || c.global >= cfg.globalParJour)
        return { status: 429, corps: { erreur: 'plafond atteint' } }
      c.parInstallation.set(id, utilise + 1)
      c.global++

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
        return { status: 200, corps: { texte: v?.texte ?? null } }
      } catch {
        return { status: 504, corps: { erreur: 'délai dépassé' } }
      } finally {
        clearTimeout(t)
      }
    },
  }
}
