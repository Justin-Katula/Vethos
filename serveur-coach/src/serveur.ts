// ═══ SERVEUR DU COACH — LA PRISE ═════════════════════════════════════════
//
// node:http, aucune dépendance d'exécution. Lit sa configuration dans
// l'environnement et refuse de démarrer sans clé ni secret.

import { createServer, type IncomingMessage } from 'node:http'
import { creerCoeur, validerConfig, type Config } from './coeur'

const env = (k: string) => process.env[k]?.trim() || undefined
const cfg: Config = {
  deepseekKey: env('DEEPSEEK_API_KEY') ?? '',
  secret: env('COACH_SECRET') ?? '',
  model: env('DEEPSEEK_MODEL') ?? 'deepseek-chat',
  // Un plafond mal écrit (NaN) désactiverait TOUS les plafonds : on refuse
  // de démarrer plutôt que de tourner sans garde.
  parInstallationParJour: Number(env('COACH_PAR_INSTALLATION_PAR_JOUR') ?? 40),
  globalParJour: Number(env('COACH_GLOBAL_PAR_JOUR') ?? 2000),
  installationsParIpParHeure: Number(env('COACH_INSTALLATIONS_PAR_IP_PAR_HEURE') ?? 5),
  joursJeton: Number(env('COACH_JOURS_JETON') ?? 30),
}
const erreur = validerConfig(cfg)
if (erreur) {
  console.error(`Configuration refusée : ${erreur}.`)
  process.exit(1)
}
const coeur = creerCoeur(cfg)
/** Nombre de proxys de confiance devant le serveur (0 = aucun : X-Forwarded-For ignoré). */
const PROXYS = Number(env('COACH_PROXYS') ?? 0)

const MAX_CORPS = 16 * 1024

function lire(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, ko) => {
    let taille = 0
    const morceaux: Buffer[] = []
    req.on('data', (m: Buffer) => {
      taille += m.length
      if (taille > MAX_CORPS) {
        ko(new Error('trop gros'))
        req.destroy()
        return
      }
      morceaux.push(m)
    })
    req.on('end', () => {
      try {
        ok(morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString('utf8')) : {})
      } catch (e) {
        ko(e)
      }
    })
    req.on('error', ko)
  })
}

/**
 * L'adresse du client. Derrière N proxys de confiance, c'est la N-ième en
 * partant de la DROITE de X-Forwarded-For — la gauche, le client l'écrit
 * lui-même et la falsifie à volonté.
 */
const ipDe = (req: IncomingMessage) => {
  if (PROXYS > 0) {
    const chaine = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    const ip = chaine[chaine.length - PROXYS]
    if (ip) return ip
  }
  return req.socket.remoteAddress || 'inconnue'
}

createServer(async (req, res) => {
  const repondre = (status: number, corps: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(corps))
  }
  try {
    if (req.method === 'GET' && req.url === '/health') return repondre(200, { ok: true })
    if (req.method !== 'POST') return repondre(405, { erreur: 'méthode' })
    const corps = await lire(req).catch(() => null)
    if (corps === null) return repondre(400, { erreur: 'corps illisible' })
    if (req.url === '/v1/install') {
      const r = coeur.installer(ipDe(req))
      return repondre(r.status, r.corps)
    }
    if (req.url === '/v1/coach') {
      const r = await coeur.coach(req.headers.authorization, corps, ipDe(req))
      return repondre(r.status, r.corps)
    }
    return repondre(404, { erreur: 'introuvable' })
  } catch {
    // Jamais de détail d'erreur vers l'extérieur — ni la clé, ni une trace.
    return repondre(500, { erreur: 'erreur' })
  }
}).listen(Number(env('PORT') ?? 8787), () => {
  console.log(`Coach Vethos à l'écoute sur ${env('PORT') ?? 8787}`)
})
