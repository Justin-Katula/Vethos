import type { ProposedPlacementBlock, PlacementPlanV2 } from '../../../shared/placement-model'
import type { PlacedBlock, PlacementDiagnostics, ItemBudgetBreakdown, PlacementStatus } from './placement-engine'
import type { Task, Objective, RegistryItem } from '@shared/schemas'
import type { UserModel } from '@shared/user-model'
import { buildTaskModelV2 } from './task-model-builder'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { scoreTaskPriorityV2 } from './task-priority-scorer-v2'
import { scoreObjectivePriorityV2 } from './objective-priority-scorer-v2'
import { rankPriorityItemsV2 } from './priority-ranking-engine-v2'
import { selectPrimaryObjectiveId } from './priority-engine'

function parseClockTimeToMinute(time: string): number {
  const [hStr, mStr] = time.split(':')
  const h = hStr ? parseInt(hStr, 10) : 0
  const m = mStr ? parseInt(mStr, 10) : 0
  return h * 60 + m
}

export function mapProposedPlacementBlocksToPlacedBlocks(
  blocks: ProposedPlacementBlock[],
  sourcePlan?: PlacementPlanV2,
): PlacedBlock[] {
  return blocks.map((block) => {
    // kind mapping: 'break' | 'free' | 'task' | 'objective'
    let mappedKind: PlacedBlock['kind'] = 'free'
    if (block.kind === 'recovery') mappedKind = 'break'
    else if (block.targetType === 'task') mappedKind = 'task'
    else if (block.targetType === 'objective') mappedKind = 'objective'

    let mappedRefKind: PlacedBlock['refKind'] = 'free'
    if (block.kind === 'recovery') mappedRefKind = 'break'
    else if (block.targetType === 'task') mappedRefKind = 'task'
    else if (block.targetType === 'objective') mappedRefKind = 'objective'

    const linkedTaskIds = block.linkedTaskId ? [block.linkedTaskId] : []

    return {
      id: block.id,
      date: block.date,
      startMinute: parseClockTimeToMinute(block.start),
      endMinute: parseClockTimeToMinute(block.end),
      kind: mappedKind,
      refKind: mappedRefKind,
      refId: block.targetId || null,
      label: block.title,
      locked: true,
      linkedTaskId: block.linkedTaskId || null,
      linkedTaskIds,
      sourcePlacementBlock: block,
      ...(sourcePlan ? { sourcePlacementPlanV2: sourcePlan } : {}),
    }
  })
}

export function buildV1DiagnosticsFromV2(
  planV2: PlacementPlanV2,
  tasks: Task[],
  objectives: Objective[],
  totalUsableFreeMinutes: number
): PlacementDiagnostics {
  let mappedStatus: PlacementStatus = 'planifiable'
  if (planV2.mode === 'rescue' || planV2.mode === 'intensive') {
    mappedStatus = 'risk'
  } else if (planV2.mode === 'minimum_viable' || planV2.unplacedItems.length > 0) {
    mappedStatus = 'impossible'
  }

  const plannedMinutes = planV2.summary.totalProposedMinutes
  const unplannedMinutes = Math.max(0, totalUsableFreeMinutes - plannedMinutes)

  const items: ItemBudgetBreakdown[] = []
  const unplacedMap = new Map(planV2.unplacedItems.map(item => [item.targetId, item]))

  const proposedBlocksByTarget = new Map<string, ProposedPlacementBlock[]>()
  for (const block of planV2.proposedBlocks) {
    if (!block.targetId) continue
    const list = proposedBlocksByTarget.get(block.targetId) || []
    list.push(block)
    proposedBlocksByTarget.set(block.targetId, list)
  }

  for (const task of tasks) {
    const blocks = proposedBlocksByTarget.get(task.id) || []
    const placedMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
    const isUnplaced = unplacedMap.has(task.id)
    const requiredMinutes = task.remainingMinutes ?? task.estimatedMinutes ?? null

    items.push({
      key: `task-${task.id}`,
      kind: 'task',
      refId: task.id,
      label: task.title,
      score: 1,
      rawBudgetMinutes: requiredMinutes ?? 60,
      cappedMinutes: requiredMinutes ?? 60,
      placeableMinutes: requiredMinutes ?? 60,
      placedMinutes,
      maxMeritedMinutes: requiredMinutes ?? 60,
      dailyCapMinutes: 240,
      minBlockMinutes: 30,
      requiredMinutes,
      availableBeforeDeadlineMinutes: null,
      unplannedMinutes: isUnplaced ? (requiredMinutes ?? 60) : Math.max(0, (requiredMinutes ?? 0) - placedMinutes),
      status: isUnplaced ? 'impossible' : (placedMinutes < (requiredMinutes ?? 0) ? 'risk' : 'planifiable'),
    })
  }

  for (const obj of objectives) {
    const blocks = proposedBlocksByTarget.get(obj.id) || []
    const placedMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
    const isUnplaced = unplacedMap.has(obj.id)
    const requiredMinutes = tasks
      .filter((task) => task.linkedObjectiveId === obj.id && task.status !== 'completed')
      .reduce((sum, task) => sum + (task.remainingMinutes ?? task.estimatedMinutes ?? 0), 0) || null

    items.push({
      key: `objective-${obj.id}`,
      kind: 'objective',
      refId: obj.id,
      label: obj.name,
      score: 1,
      rawBudgetMinutes: requiredMinutes ?? 120,
      cappedMinutes: requiredMinutes ?? 120,
      placeableMinutes: requiredMinutes ?? 120,
      placedMinutes,
      maxMeritedMinutes: requiredMinutes ?? 120,
      dailyCapMinutes: 480,
      minBlockMinutes: 60,
      requiredMinutes,
      availableBeforeDeadlineMinutes: null,
      unplannedMinutes: isUnplaced ? (requiredMinutes ?? 120) : Math.max(0, (requiredMinutes ?? 0) - placedMinutes),
      status: isUnplaced ? 'impossible' : (placedMinutes < (requiredMinutes ?? 0) ? 'risk' : 'planifiable'),
    })
  }

  return {
    status: mappedStatus,
    totalFreeMinutes: totalUsableFreeMinutes,
    plannedMinutes,
    unplannedMinutes,
    items,
  }
}

export function sortTasksV2(
  tasks: Task[],
  objectives: Objective[],
  registry: RegistryItem[],
  settings: { userModel?: UserModel | null },
  now: Date
): Task[] {
  const primaryObjectiveId = selectPrimaryObjectiveId(objectives, settings.userModel)
  // 1. Build objective V2 models
  const objectiveModels = objectives.map(obj => {
    const objTasks = tasks.filter(t => t.linkedObjectiveId === obj.id)
    return buildObjectiveModelV2({
      objective: obj,
      tasks: objTasks,
      registry,
      userModel: settings.userModel,
      now,
      priorityContext: { primaryObjectiveId },
    })
  })
  const objectiveModelMap = new Map(objectiveModels.map(m => [m.identity.id, m]))

  // 2. Build task V2 models
  const taskModels = tasks.map(task => {
    const obj = task.linkedObjectiveId ? objectives.find(o => o.id === task.linkedObjectiveId) : null
    const objModel = task.linkedObjectiveId ? objectiveModelMap.get(task.linkedObjectiveId) : null
    return buildTaskModelV2({
      task,
      objective: obj,
      objectiveModel: objModel,
      registry,
      now,
    })
  })

  // 3. Score V2 priorities
  const taskScores = taskModels.map(taskModel => {
    const task = tasks.find(t => t.id === taskModel.identity.id)
    const objModel = task?.linkedObjectiveId ? objectiveModelMap.get(task.linkedObjectiveId) : null
    return scoreTaskPriorityV2({
      taskModelV2: taskModel,
      linkedObjectiveModelV2: objModel,
      userModel: settings.userModel ?? null,
      planningContext: null,
      cognitiveModel: null,
      completionGateResult: null,
      oldScore: undefined,
      now,
    })
  })

  const objectiveScores = objectiveModels.map(objModel => {
    const objTasks = taskScores.filter(tScore => {
      const task = tasks.find(t => t.id === tScore.targetId)
      return task?.linkedObjectiveId === objModel.identity.id
    })
    return scoreObjectivePriorityV2({
      objectiveModelV2: objModel,
      linkedTaskScores: objTasks,
      userModel: settings.userModel ?? null,
      planningContext: null,
      cognitiveModel: null,
      oldScore: undefined,
      now,
    })
  })

  // 4. Rank them using rankPriorityItemsV2 in 'action' mode
  const rankings = rankPriorityItemsV2(
    { tasks: taskScores, objectives: objectiveScores },
    { mode: 'action', now }
  )

  // 5. Sort the tasks based on their V2 rank
  const rankMap = new Map(rankings.rankedItems.map(item => [item.score.targetId, item.rank]))

  return [...tasks].sort((a, b) => {
    const rankA = rankMap.get(a.id) ?? 9999
    const rankB = rankMap.get(b.id) ?? 9999
    return rankA - rankB
  })
}
