// ═══ COACH VETHOS — LA PRISE SUPABASE ═══════════════════════════════════
//
// La même logique que `serveur-coach/src/serveur.ts`, mais dans une fonction
// Supabase (Deno). `coeur.js` est le cœur du serveur, empaqueté par
// `npm run coach:supabase` — ne pas le modifier à la main.
//
// Adresses : https://<projet>.supabase.co/functions/v1/coach/v1/install
//            https://<projet>.supabase.co/functions/v1/coach/v1/coach
// Déployée SANS vérification du JWT Supabase (--no-verify-jwt) : l'app
// s'authentifie avec le jeton d'installation que ce serveur signe lui-même.

import { creerCoeur, periode, validerConfig } from './coeur.js'

// Les types du cœur (voir `serveur-coach/src/coeur.ts`), redits ici : le
// paquet `coeur.js` n'en porte pas.
type Fenetre = 'heure' | 'jour'
type Prise = { cle: string; fenetre: Fenetre; plafond: number }
type Compteurs = { prendre(p: readonly Prise[]): Promise<boolean>; lire(cle: string, f: Fenetre): Promise<number> }
type Config = Parameters<typeof validerConfig>[0]

const env = (k: string) => Deno.env.get(k)?.trim() || undefined
const cfg: Config = {
  deepseekKey: env('DEEPSEEK_API_KEY') ?? '',
  secret: env('COACH_SECRET') ?? '',
  model: env('DEEPSEEK_MODEL') ?? 'deepseek-chat',
  parInstallationParJour: Number(env('COACH_PAR_INSTALLATION_PAR_JOUR') ?? 40),
  globalParJour: Number(env('COACH_GLOBAL_PAR_JOUR') ?? 2000),
  installationsParIpParHeure: Number(env('COACH_INSTALLATIONS_PAR_IP_PAR_HEURE') ?? 5),
  parAdresseParJour: Number(env('COACH_PAR_ADRESSE_PAR_JOUR') ?? 120),
  joursJeton: Number(env('COACH_JOURS_JETON') ?? 30),
}
const erreurConfig = validerConfig(cfg)
if (erreurConfig) console.error(`Configuration refusée : ${erreurConfig}.`)

const URL_BASE = env('SUPABASE_URL') ?? ''
const CLE_SERVICE = env('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** Appelle une fonction Postgres avec la clé service_role — jamais exposée à l'app. */
async function rpc(nom: string, args: unknown): Promise<unknown> {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CLE_SERVICE, Authorization: `Bearer ${CLE_SERVICE}` },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`rpc ${nom} : ${r.status}`)
  return r.json()
}

/** Une fenêtre expire à sa fin, plus une marge : la base efface ce qui ne compte plus. */
const expiration = (f: Fenetre) => new Date(Date.now() + (f === 'heure' ? 2 : 26) * 3_600_000).toISOString()

const compteursPostgres: Compteurs = {
  async prendre(prises) {
    const maintenant = new Date()
    return (await rpc('coach_prendre', {
      cles: prises.map((p) => `${periode(p.fenetre, maintenant)}|${p.cle}`),
      plafonds: prises.map((p) => p.plafond),
      expirations: prises.map((p) => expiration(p.fenetre)),
    })) === true
  },
  async lire(cle, f) {
    return Number(await rpc('coach_lire', { cle_lue: `${periode(f, new Date())}|${cle}` })) || 0
  },
}

const coeur = erreurConfig ? null : creerCoeur(cfg, { compteurs: compteursPostgres })
const MAX_CORPS = 16 * 1024

/**
 * L'adresse du client, posée par le relais de Supabase. Jamais la tête de
 * X-Forwarded-For : le client l'écrit lui-même et la falsifie à volonté.
 */
const ipDe = (req: Request) => {
  const posee = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip')
  if (posee) return posee.trim()
  const chaine = (req.headers.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  return chaine[chaine.length - 1] ?? 'inconnue'
}

const repondre = (status: number, corps: unknown) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

Deno.serve(async (req) => {
  try {
    const chemin = new URL(req.url).pathname
    if (req.method === 'GET' && chemin.endsWith('/health')) return repondre(coeur ? 200 : 503, { ok: !!coeur })
    if (!coeur) return repondre(503, { erreur: 'configuration' })
    if (req.method !== 'POST') return repondre(405, { erreur: 'méthode' })
    const texte = await req.text()
    if (texte.length > MAX_CORPS) return repondre(413, { erreur: 'trop gros' })
    let corps: unknown
    try {
      corps = texte ? JSON.parse(texte) : {}
    } catch {
      return repondre(400, { erreur: 'corps illisible' })
    }
    if (chemin.endsWith('/v1/install')) {
      const r = await coeur.installer(ipDe(req))
      return repondre(r.status, r.corps)
    }
    if (chemin.endsWith('/v1/coach')) {
      const r = await coeur.coach(req.headers.get('authorization') ?? undefined, corps, ipDe(req))
      return repondre(r.status, r.corps)
    }
    return repondre(404, { erreur: 'introuvable' })
  } catch {
    // Jamais de détail d'erreur vers l'extérieur — ni la clé, ni une trace.
    return repondre(500, { erreur: 'erreur' })
  }
})
