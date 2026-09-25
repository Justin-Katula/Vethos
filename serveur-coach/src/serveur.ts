// ═══ SERVEUR DU COACH — LA PRISE ═════════════════════════════════════════
//
// node:http, aucune dépendance d'exécution. Lit sa configuration dans
// l'environnement et refuse de démarrer sans clé ni secret.

import { createServer, type IncomingMessage } from 'node:http'
import { creerCoeur } from './coeur'

const env = (k: string) => process.env[k]?.trim() || undefined
const deepseekKey = env('DEEPSEEK_API_KEY')
const secret = env('COACH_SECRET')
if (!deepseekKey || !secret || secret.length < 32) {
  console.error('DEEPSEEK_API_KEY et COACH_SECRET (32 caractères au moins) sont requis.')
  process.exit(1)
}

const coeur = creerCoeur({
  deepseekKey,
  secret,
  model: env('DEEPSEEK_MODEL') ?? 'deepseek-chat',
  parInstallationParJour: Number(env('COACH_PAR_INSTALLATION_PAR_JOUR') ?? 40),
  globalParJour: Number(env('COACH_GLOBAL_PAR_JOUR') ?? 2000),
  installationsParIpParHeure: Number(env('COACH_INSTALLATIONS_PAR_IP_PAR_HEURE') ?? 5),
})

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

const ipDe = (req: IncomingMessage) =>
  (env('COACH_DERRIERE_PROXY') ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '') ||
  req.socket.remoteAddress ||
  'inconnue'

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
      const r = await coeur.coach(req.headers.authorization, corps)
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
