import { BONUS_SEUIL_DENSITE } from './bonus'
import { daysBetween } from './dates'
import { floorWorkFor } from './engine'
import type { DurationRealSource, PlanningResult, TaskItem } from './types'

// ═══ MESSAGES DE CHARGE ═════════════════════════════════════════════════════
//
// Quand la charge demandée est lourde, l'application le dit avec des CHIFFRES :
// ce que ça demande chaque jour, ce qu'il reste de temps libre, ce qui est placé
// et ce qui manque. Jamais un jugement, jamais une question (loi F). Elle ne
// discute pas le chiffre demandé : elle dit ce qu'il coûte, ou ce qui ne tient
// pas, et qu'elle place le reste au mieux.
//
// Les chiffres viennent du moteur (densité C.2, verdicts de placement) ; rien
// n'est estimé ici. Seul le plancher compte : le bonus n'y entre jamais.

export type ChargeMessage = {
  deadline: string
  niveau: 'tension' | 'deficit'
  texte: string
}

const MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 6000 → « 100 h » · 115 → « 1 h 55 » · 545 → « 9 h 05 » · 40 → « 40 min ». */
export function formatHeures(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const reste = m % 60
  return reste === 0 ? `${h} h` : `${h} h ${String(reste).padStart(2, '0')}`
}

const jourCourt = (date: string): string => {
  const [, mois, jour] = date.split('-')
  return `${Number(jour)} ${MOIS[Number(mois) - 1]}`
}

export function messagesCharge(args: {
  result: PlanningResult
  tasks: readonly TaskItem[]
  today: string
  durationSource?: DurationRealSource
}): ChargeMessage[] {
  const sorties: ChargeMessage[] = []
  for (const d of args.result.feasibility.densities) {
    const dues = args.tasks.filter((t) => t.deadline <= d.deadline && t.status === 'active')
    if (dues.length === 0) continue

    // Le plancher demandé, et ce que le calendrier en place réellement.
    let demande = 0
    let place = 0
    for (const t of dues) {
      const plancher = floorWorkFor(t, args.durationSource)
      const verdict = args.result.verdicts.find((v) => v.taskId === t.id)
      demande += plancher
      place += Math.min(plancher, verdict?.placedMinutes ?? 0)
    }
    const manque = demande - place
    const jours = Math.max(1, daysBetween(args.today, d.deadline) + 1)

    if (manque >= 5) {
      sorties.push({
        deadline: d.deadline,
        niveau: 'deficit',
        texte:
          `${formatHeures(demande)} asked, ${formatHeures(place)} placed before ${jourCourt(d.deadline)}. ` +
          `${formatHeures(manque)} missing. The rest is placed as well as it can be.`,
      })
      continue
    }

    // Une crise rogne les protections (repos au minimum, zone de réveil et buffers
    // réduits) : le moteur le chiffre sur le jour, l'utilisateur doit le lire.
    const reposRogne = args.result.capacities.some(
      (c) =>
        c.date <= d.deadline &&
        (c.wakeZoneSacrificedMinutes > 0 || c.postObligationSacrificedMinutes > 0),
    )

    if (d.density >= BONUS_SEUIL_DENSITE || reposRogne) {
      const parJour = d.loadMinutes / jours
      const libre = Math.max(0, (d.capacityMinutes - d.loadMinutes) / jours)
      sorties.push({
        deadline: d.deadline,
        niveau: 'tension',
        texte:
          `${formatHeures(demande)} before ${jourCourt(d.deadline)}: ${formatHeures(parJour)} a day, ` +
          `${Math.round(d.density * 100)}% of your capacity. Free time left: about ${formatHeures(libre)} a day.` +
          (reposRogne ? ' Rest is cut to its minimum.' : ''),
      })
    }
  }
  return sorties
}
