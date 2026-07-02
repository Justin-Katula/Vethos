import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildEmptyUserModel } from '@shared/user-model'
import { buildSessionPlanFromBlock } from './session-plan-engine'

const objective: Objective = { id:'22222222-2222-4222-8222-222222222222', name:'Projet', color:'#22c55e', linkedRuleIds:[], level:6, status:'active', createdAt:'2026-07-01T00:00:00.000Z' }
const task: Task = { id:'11111111-1111-4111-8111-111111111111', title:'Coder le module', linkedObjectiveId:objective.id, deadline:'2026-07-03', level:7, status:'active', createdAt:'2026-07-01T00:00:00.000Z' }

describe('session plan real context', () => {
  it('intègre la tâche active et le risque de distraction du UserModel', () => {
    const userModel = buildEmptyUserModel('user-1', { now:'2026-07-02T00:00:00.000Z' })
    userModel.disciplineModel.globalDistractionRisk = 82
    userModel.appSitePreferences = [{ identifier:'editor.exe', kind:'app', updatedAt:'2026-07-02T00:00:00.000Z', contextRules:[{ contextType:'task', contextId:task.id, classification:'useful', confidence:90, source:'user', reasons:['Nécessaire.'], updatedAt:'2026-07-02T00:00:00.000Z' }] }]
    const plan = buildSessionPlanFromBlock({ id:'b1', date:'2026-07-02', startMinute:600, endMinute:660, kind:'objective', refKind:'objective', refId:objective.id, label:'Projet', locked:true, linkedTaskId:null, linkedTaskIds:[] }, null, objective, [], {} as never, { activeTask:task, userModel })
    expect(plan.targetType).toBe('objective')
    expect(plan.protectionLevel).toBeGreaterThanOrEqual(82)
    expect(plan.allowedApps).toContain('editor.exe')
    expect(plan.reasons.some((reason) => reason.includes('tâche active'))).toBe(true)
  })
})
