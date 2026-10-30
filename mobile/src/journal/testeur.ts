import { supabase } from '@/compte/supabase'
import { activerJournal } from './journal'

/**
 * Ce compte est-il testeur ? Une ligne dans `testeurs` (Supabase), lisible par
 * lui seul. Hors ligne ou en erreur, on garde ce que le téléphone savait.
 */
export async function lireDrapeauTesteur(compte: string | null): Promise<void> {
  if (!compte) return activerJournal(false)
  const sb = supabase()
  if (!sb) return
  try {
    const { data, error } = await sb.from('testeurs').select('user_id').eq('user_id', compte).maybeSingle()
    if (error) return
    await activerJournal(!!data)
  } catch {
    // Réseau absent : rien ne change.
  }
}
