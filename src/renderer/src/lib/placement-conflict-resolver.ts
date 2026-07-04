import type { ProposedPlacementBlock } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'

export interface ResolvePlacementConflictsInput {
  proposedBlocks: ProposedPlacementBlock[]
  planningContext: AnyPlanningContextV2
}

export interface ResolvePlacementConflictsResult {
  blocks: ProposedPlacementBlock[]
  removedBlocks: ProposedPlacementBlock[]
  warnings: string[]
}

export function resolvePlacementConflicts(input: ResolvePlacementConflictsInput): ResolvePlacementConflictsResult {
  const { proposedBlocks } = input
  
  const blocks: ProposedPlacementBlock[] = []
  const removedBlocks: ProposedPlacementBlock[] = []
  const warnings: string[] = []

  // Sort initially by priority score DESC, then confidence DESC, then duration DESC
  // This defines the "winner" in a conflict.
  const sortedBlocks = [...proposedBlocks].sort((a, b) => {
    if ((a.priorityScore ?? 0) !== (b.priorityScore ?? 0)) {
      return (b.priorityScore ?? 0) - (a.priorityScore ?? 0)
    }
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence
    }
    return b.durationMinutes - a.durationMinutes
  })

  // Track the targetIds we've already placed to avoid accidental duplicates
  // We allow multiple blocks per targetId as long as they don't overlap (e.g. diagnostic + practice in rescue plans).

  for (const block of sortedBlocks) {
    let conflict = false
    let conflictReason = ''

    // 1. (Removed) Allow multiple blocks for same targetId (e.g. for rescue plans).
    // Exact duplicates will be caught by the overlap check below.

    // 2. Check overlap with already accepted blocks
    if (!conflict) {
      for (const accepted of blocks) {
        if (block.start < accepted.end && block.end > accepted.start) {
          conflict = true
          conflictReason = `Chevauchement avec le bloc ${accepted.id}.`
          break
        }
      }
    }

    // 3. (Optional here) Check if inside FreeTimeWindow. 
    // Usually handled by constraint engine, but conflict resolver should double check if needed.
    // If we assume constraint engine works perfectly on individual blocks, here we mainly care about cross-block conflicts.

    if (conflict) {
      removedBlocks.push(block)
      warnings.push(`Bloc ${block.id} (${block.title}) retiré : ${conflictReason}`)
    } else {
      blocks.push(block)
    }
  }

  // Sort final blocks chronologically for readability
  blocks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

  return { blocks, removedBlocks, warnings }
}
