import type { PlacementCandidate, ProposedPlacementBlock } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'

export interface ValidateProposedBlockInput {
  block: ProposedPlacementBlock
  planningContext: AnyPlanningContextV2 & {
    lockedBlocks?: Array<{ start: string; end: string; type: string }>
  }
  existingProposedBlocks: ProposedPlacementBlock[]
  candidate: PlacementCandidate
}

export interface ValidateProposedBlockResult {
  valid: boolean
  reasons: string[]
  warnings: string[]
}

export function validateProposedBlock(input: ValidateProposedBlockInput): ValidateProposedBlockResult {
  const { block, planningContext, existingProposedBlocks, candidate } = input
  const reasons: string[] = []
  const warnings: string[] = []
  let valid = true

  const fail = (reason: string) => {
    valid = false
    reasons.push(reason)
  }

  // Basic validations
  if (block.durationMinutes <= 0) fail('La durée du bloc doit être > 0.')
  if (block.start >= block.end) fail('La date de début doit être antérieure à la date de fin.')
  if (block.locked) fail('Un bloc proposé ne peut pas avoir locked=true.')
  if (block.confidence < 0 || block.confidence > 100) fail('Confidence hors limites (0-100).')
  if (block.priorityScore !== undefined && (block.priorityScore < 0 || block.priorityScore > 100)) {
    fail('priorityScore hors limites (0-100).')
  }

  // Find source window
  const sourceWindow = planningContext.usableFreeWindows.find(w => w.id === block.sourceWindowId)
  if (!sourceWindow) {
    fail('Source FreeTimeWindow introuvable.')
  } else {
    // Must be entirely within the free window
    if (block.start < sourceWindow.start || block.end > sourceWindow.end) {
      fail('Le bloc déborde de sa FreeTimeWindow source.')
    }
    
    // Check duration <= usable
    if (block.durationMinutes > sourceWindow.usableDurationMinutes) {
      fail('Le bloc dépasse la durée utilisable de la fenêtre.')
    }

    // Check window types
    if (sourceWindow.windowType === 'unsafe' || sourceWindow.windowType === 'preparation_only') {
      fail(`Le bloc ne peut pas être placé dans une fenêtre de type ${sourceWindow.windowType}.`)
    }
    if (sourceWindow.windowType === 'recovery_only' && block.kind !== 'recovery' && block.kind !== 'manual_review' && block.placementMode !== 'manual_review') {
      fail('Fenêtre réservée à la récupération.')
    }

    // Check deep work
    if (candidate.requiresDeepWork && !sourceWindow.canHostDeepWork && block.kind !== 'manual_review') {
      fail('Deep work requis mais la fenêtre ne l\'autorise pas.')
    }
  }

  // Check deadline
  if (candidate.deadline && block.start >= candidate.deadline) {
    fail('Le bloc dépasse la deadline.')
  }

  // Check overlap with locked blocks (sleep, school, etc.)
  const lockedBlocks = planningContext.lockedBlocks ?? []
  for (const locked of lockedBlocks) {
    if (block.start < locked.end && block.end > locked.start) {
      fail(`Le bloc chevauche une période verrouillée (${locked.type}).`)
    }
  }

  // Check overlap with existing proposed blocks
  for (const existing of existingProposedBlocks) {
    if (block.id !== existing.id && block.start < existing.end && block.end > existing.start) {
      fail(`Le bloc chevauche un autre bloc proposé (${existing.id}).`)
    }
  }

  return { valid, reasons, warnings }
}
