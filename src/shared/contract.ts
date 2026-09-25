// ═══ CONTRAT D'ULYSSE ET MODES ═══════════════════════════════════════════
//
// Spec moteur 2026-09-25. L'app peut dire non parce que l'utilisateur l'a
// décidé lui-même, à un moment calme. La fermeté et la structure sont les
// mêmes dans les deux modes ; seul le ton change. L'engagement aide, il ne
// fait pas de miracle : dans l'étude CARES, 66 % de ceux qui avaient signé
// ont quand même échoué — d'où le ton d'après un échec, qui constate en une
// phrase et donne la prochaine action.

import { z } from 'zod'

export const MODES = ['ally', 'sergeant'] as const
export type Mode = (typeof MODES)[number]

/** Une modification ne prend effet qu'après 48 h. */
export const DELAI_MODIFICATION_MS = 48 * 60 * 60 * 1000

export const ContractSchema = z
  .object({
    signedAt: z.string().datetime(),
    mode: z.enum(MODES),
    /** Ce que l'app a le droit de refuser, tel que signé. */
    refuses: z.object({ changesDuringBlock: z.boolean().default(true) }).default({ changesDuringBlock: true }),
    /** Une modification en attente, et quand elle prendra effet. */
    pending: z
      .object({ mode: z.enum(MODES), effectiveAt: z.string().datetime(), requestedAt: z.string().datetime() })
      .nullable()
      .default(null),
  })
  .strict()
export type Contract = z.infer<typeof ContractSchema>

export function signContract(mode: Mode, now: Date): Contract {
  return { signedAt: now.toISOString(), mode, refuses: { changesDuringBlock: true }, pending: null }
}

/** Le contrat en vigueur à `now` : une modification échue s'applique. */
export function effectiveContract(c: Contract, now: Date): Contract {
  if (c.pending && new Date(c.pending.effectiveAt).getTime() <= now.getTime()) {
    return { ...c, mode: c.pending.mode, pending: null }
  }
  return c
}

export type ContractDecision = { ok: true; contract: Contract } | { ok: false; reason: 'during-block' | 'unchanged' }

/**
 * Une modification du contrat se fait HORS bloc et prend effet après 48 h.
 * Pendant un bloc, elle est refusée — c'est tout l'intérêt de l'avoir signé
 * à un moment calme.
 */
export function requestModeChange(c: Contract, mode: Mode, now: Date, inBlock: boolean): ContractDecision {
  if (inBlock) return { ok: false, reason: 'during-block' }
  const current = effectiveContract(c, now)
  if (current.mode === mode && !current.pending) return { ok: false, reason: 'unchanged' }
  if (current.mode === mode) return { ok: true, contract: { ...current, pending: null } }
  return {
    ok: true,
    contract: {
      ...current,
      pending: {
        mode,
        requestedAt: now.toISOString(),
        effectiveAt: new Date(now.getTime() + DELAI_MODIFICATION_MS).toISOString(),
      },
    },
  }
}

/**
 * Pendant un bloc, l'app refuse tout changement du plan (engagements,
 * heures fixes). Les demandes de repos ou de temps libre restent immédiates :
 * elles passent par E.5, qui ne dépend pas du contrat.
 */
export function refusesChange(c: Contract | null | undefined, inBlock: boolean): boolean {
  return !!c && inBlock && c.refuses.changesDuringBlock
}

// ─── Le ton ───────────────────────────────────────────────────────────────

const plural = (n: number) => `${n} minute${n > 1 ? 's' : ''}`

/** Pendant un bloc, quand l'utilisateur veut changer quelque chose. */
export function duringBlockLine(mode: Mode, minutesLeft: number): string {
  const m = plural(Math.max(1, Math.round(minutesLeft)))
  return mode === 'ally' ? `It’s hard, I know. ${m}. You’ve got this.` : `No. The block goes on. ${m}.`
}

/** Après un échec : un constat en une phrase, puis la prochaine action. */
export function afterMissLine(mode: Mode, nextBlockAt: string | null): string {
  if (mode === 'ally') return nextBlockAt ? `Missed this time. Next block at ${nextBlockAt}, we go together.` : 'Missed this time. Tomorrow, we go together.'
  return nextBlockAt ? `Missed. Next block ${nextBlockAt}. Go.` : 'Missed. Tomorrow. Go.'
}

/** Le refus d'un changement, avec les mots du contrat signé. */
export function refusalLine(mode: Mode, signedAt: string, minutesLeft: number): string {
  const d = new Date(signedAt)
  const when = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  return mode === 'ally'
    ? `On ${when} you signed: no changes during a block. ${plural(Math.max(1, Math.round(minutesLeft)))} left.`
    : `Signed ${when}: no changes during a block. ${plural(Math.max(1, Math.round(minutesLeft)))}.`
}
