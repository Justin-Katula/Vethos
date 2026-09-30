// ═══ COMPTE VETHOS — SUPPRESSION ════════════════════════════════════════
//
// DELETE /functions/v1/compte, avec la session de l'utilisateur en en-tête.
// Supprime SON compte, et seulement le sien : l'identité vient du jeton,
// vérifié par Supabase, jamais d'un paramètre que l'app pourrait choisir.
// Déployée avec --no-verify-jwt : la fonction vérifie elle-même la session
// auprès de Supabase (compatible avec les nouvelles clés de signature).

const env = (k: string) => Deno.env.get(k)?.trim() || ''
const URL_BASE = env('SUPABASE_URL')
const CLE_PUBLIQUE = env('SUPABASE_ANON_KEY')
const CLE_SERVICE = env('SUPABASE_SERVICE_ROLE_KEY')

const repondre = (status: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

Deno.serve(async (req) => {
  if (req.method !== 'DELETE') return repondre(405, { erreur: 'méthode' })
  const autorisation = req.headers.get('authorization') ?? ''
  if (!autorisation.startsWith('Bearer ')) return repondre(401, { erreur: 'session' })
  try {
    // Qui appelle ? Supabase le dit à partir du jeton de session.
    const qui = await fetch(`${URL_BASE}/auth/v1/user`, { headers: { apikey: CLE_PUBLIQUE, Authorization: autorisation } })
    if (!qui.ok) return repondre(401, { erreur: 'session' })
    const { id } = (await qui.json()) as { id?: string }
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return repondre(401, { erreur: 'session' })

    const r = await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: { apikey: CLE_SERVICE, Authorization: `Bearer ${CLE_SERVICE}` },
    })
    if (!r.ok) {
      console.error('compte : suppression refusée', r.status)
      return repondre(502, { erreur: 'suppression' })
    }
    return repondre(200, { ok: true })
  } catch (e) {
    console.error('compte :', e instanceof Error ? e.message : 'erreur')
    return repondre(500, { erreur: 'erreur' })
  }
})
