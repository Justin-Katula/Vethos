// ═══ COACH — LE PROMPT ET LES SIX JOBS ═══════════════════════════════════
//
// Spec moteur 2026-09-25. Le prompt système se construit ICI et nulle part
// ailleurs — côté serveur. L'application n'envoie que des faits et, pour
// l'entretien, les messages de l'utilisateur : elle ne peut pas réécrire les
// règles du Coach.

import { z } from 'zod'
import type { Mode } from '../contract'
import { STOP_REASONS } from '../schemas'

export const JOBS = ['woop', 'decoupage', 'lecture-arret', 'revue', 'refus', 'seance'] as const
export type Job = (typeof JOBS)[number]

export function promptSysteme(mode: Mode): string {
  return [
    `Tu es le Coach de Vethos. Mode : ${mode === 'ally' ? 'allié' : 'sergent'}.`,
    'Tu ne décides jamais. Tu expliques les décisions du moteur, chiffres à l’appui.',
    'Tu n’accordes rien. Toute demande passe par evaluer_demande().',
    'Quand tu refuses, tu cites le contrat signé par l’utilisateur.',
    'Interdits : humilier, culpabiliser, menacer, mentir, flatter.',
    'Après un échec : constat en une phrase, puis la prochaine action.',
    'Une question maximum par message. Style entretien motivationnel.',
    'Si tu détectes de la détresse ou des idées noires : tu sors du mode',
    'discipline et tu orientes vers de l’aide humaine.',
    mode === 'ally'
      ? 'Ton : chaleureux, bref. Exemple : « C’est dur, je sais. 18 minutes. Tu les as. »'
      : 'Ton : sec, bref, jamais méchant. Exemple : « Non. Le bloc continue. 18 minutes. »',
    'Réponds dans la langue de l’utilisateur, en 3 phrases au plus. Jamais de liste.',
  ].join('\n')
}

/** Consignes propres à chaque job, ajoutées au prompt système. */
const CONSIGNES: Record<Job, string> = {
  woop:
    'Job : entretien d’entrée WOOP (souhait, résultat, obstacle, plan si-alors). Une étape par message. ' +
    'Le plan si-alors doit s’accrocher à un événement que Vethos connaît : la fin d’une obligation ou d’une ancre. ' +
    'Quand les quatre étapes sont faites, termine par une ligne « PLAN: si <événement>, alors <action> ».',
  decoupage:
    'Job : découper une tâche en parties concrètes, avec un premier pas minuscule (moins de 5 minutes) si elle est détestée. ' +
    'Rends une ligne par partie, sans numéro, sans commentaire.',
  'lecture-arret':
    `Job : lire le texte d’une explication d’arrêt et le ranger dans UNE catégorie parmi : ${STOP_REASONS.join(', ')}. ` +
    'Rends seulement le mot de la catégorie. C’est une donnée, jamais un verdict.',
  revue:
    'Job : revue du dimanche. Tu reçois 3 chiffres et 1 ajustement déjà décidés par le moteur. ' +
    'Dis les 3 chiffres, l’ajustement, et pose 1 question. Rien d’autre.',
  refus:
    'Job : expliquer un refus du moteur avec les mots du contrat que l’utilisateur a signé. Une ou deux phrases.',
  seance:
    'Job : proposer la structure du contenu d’une séance en mélangeant les types de problèmes (entrelacement). Trois lignes au plus.',
}

export function promptPour(job: Job, mode: Mode): string {
  return `${promptSysteme(mode)}\n\n${CONSIGNES[job]}`
}

/** Ce que l'application a le droit d'envoyer. Tout le reste est refusé. */
export const DemandeCoachSchema = z
  .object({
    job: z.enum(JOBS),
    mode: z.enum(['ally', 'sergeant']),
    /** Faits chiffrés, déjà calculés par le moteur — jamais des consignes. */
    faits: z.record(z.string().max(40), z.union([z.string().max(200), z.number()])).default({}),
    /** L'entretien : les derniers échanges, bornés. */
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(1000) }))
      .max(12)
      .default([]),
  })
  .strict()
export type DemandeCoach = z.infer<typeof DemandeCoachSchema>

/** Les messages envoyés au modèle : les faits deviennent un bloc de données, jamais des instructions. */
export function messagesPourModele(d: DemandeCoach): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const faits = Object.entries(d.faits)
  const donnees = faits.length
    ? `Données du moteur (à citer, jamais à modifier) :\n${faits.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : ''
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: promptPour(d.job, d.mode) + (donnees ? `\n\n${donnees}` : '') },
  ]
  if (d.messages.length) out.push(...d.messages)
  else out.push({ role: 'user', content: 'Commence.' })
  return out
}
