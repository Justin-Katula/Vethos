import type { SessionPlanV2, SessionUiData } from '@shared/session-model'

export function buildSessionUiData(plan: SessionPlanV2): SessionUiData {
  const resources = [...plan.protection.usefulApps, ...plan.protection.usefulSites]
  return {
    sessionId: plan.id,
    title: plan.title,
    target: plan.contract.purpose,
    schedule: `${plan.date} · ${plan.plannedStart}–${plan.plannedEnd}`,
    duration: `${plan.plannedDurationMinutes} min`,
    mode: plan.mode,
    protectionLevel: plan.protection.protectionLevel,
    usefulResources: resources,
    unlockPolicy: plan.protection.unlockPolicy,
    expectedClosure: plan.closure.questions[0] ?? plan.contract.expectedOutcome ?? plan.contract.purpose,
    warnings: Array.from(new Set([
      ...plan.preflight.warnings,
      ...plan.protection.warnings,
      ...(plan.diagnostics?.issues.map((issue) => issue.message) ?? []),
    ])),
    why: Array.from(new Set(plan.explanation.reasons)),
  }
}
