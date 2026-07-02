import type { UserModel } from '@shared/user-model'

export type DiagnosticIssue = { id: string; severity: 'low'|'medium'|'high'|'critical'; message: string; targetType?: string; targetId?: string; suggestion?: string }
export type UserModelDiagnostics = { status: 'healthy'|'warning'|'critical'; issues: DiagnosticIssue[]; summary: string[]; debug?: Record<string, unknown> }

export function runUserModelDiagnostics(model: UserModel, sourceData?: { userId?: string; objectiveIds?: string[] }): UserModelDiagnostics {
  const issues: DiagnosticIssue[] = []
  const add = (issue: DiagnosticIssue) => issues.push(issue)
  if (!model.userId?.trim()) add({ id:'missing-user-id', severity:'critical', message:'Le UserModel ne possède pas de userId.', suggestion:'Refuser la persistance et reconstruire pour l’utilisateur actif.' })
  if (sourceData?.userId && model.userId !== sourceData.userId) add({ id:'user-id-mismatch', severity:'critical', message:'Le UserModel appartient à un autre utilisateur.' })
  if (!model.declaredProfile) add({ id:'missing-profile', severity:'high', message:'Le profil déclaré est absent.' })
  if (!model.disciplineCommitments.length) add({ id:'no-commitments', severity:'medium', message:'Aucun engagement de discipline n’est défini.' })
  if (!model.metadata?.version) add({ id:'missing-version', severity:'high', message:'La version du modèle est absente.' })
  if (model.behaviorEvents.length > 2000) add({ id:'too-many-events', severity:'medium', message:'L’historique comportemental dépasse 2 000 événements.' })
  for (const id of sourceData?.objectiveIds ?? []) if (!model.objectivePreferences.some((item) => item.objectiveId === id)) add({ id:`objective-without-preference:${id}`, severity:'medium', message:'Un objectif ne possède pas de préférence calculée.', targetType:'objective', targetId:id })
  const scoreChecks: Array<[string, number, string?]> = [
    ['global-risk', model.disciplineModel.globalDistractionRisk], ['discipline-confidence', model.disciplineModel.confidence],
    ...model.objectivePreferences.flatMap((item) => [['declared',item.declaredImportanceScore,item.objectiveId],['commitment',item.observedCommitmentScore,item.objectiveId],['impact',item.lifeImpactScore,item.objectiveId],['avoidance',item.avoidanceScore,item.objectiveId],['stagnation',item.stagnationScore,item.objectiveId],['momentum',item.momentumScore,item.objectiveId],['confidence',item.confidence,item.objectiveId]] as Array<[string,number,string]>),
  ]
  for (const [name, value, id] of scoreChecks) if (!Number.isFinite(value) || value < 0 || value > 100) add({ id:`score-out-of-range:${name}:${id ?? ''}`, severity:'high', message:`Un score ${name} sort de l’intervalle 0–100.`, targetId:id })
  if (model.disciplineModel.globalDistractionRisk >= 60 && !model.disciplineModel.reasons.length) add({ id:'risk-without-reasons', severity:'high', message:'Un risque élevé est produit sans raison.' })
  const cognitiveSamples = model.cognitiveModel.hourlyPerformance.reduce((sum,item)=>sum+item.sampleCount,0)
  if (cognitiveSamples < 3 && model.cognitiveModel.hourlyPerformance.some((item)=>item.confidence>60)) add({ id:'cognitive-overconfidence', severity:'high', message:'La confiance cognitive est trop haute pour le nombre d’échantillons.' })
  for (const preference of model.appSitePreferences) {
    if (!preference.contextRules.length) add({ id:`preference-without-rules:${preference.identifier}`, severity:'medium', message:'Une préférence app/site ne possède aucune règle contextuelle.', targetType:preference.kind, targetId:preference.identifier })
    if (preference.kind === 'site' && /:\/\/|[/?#]/u.test(preference.identifier)) add({ id:`full-url:${preference.identifier}`, severity:'high', message:'Une URL complète est stockée au lieu d’un domaine.', targetType:'site', targetId:preference.identifier })
  }
  for (const event of model.behaviorEvents) {
    if (!event.createdAt) add({ id:`event-without-date:${event.id}`, severity:'medium', message:'Un événement ne possède pas de date.', targetId:event.id })
    if (event.targetType === 'site' && event.targetId && /:\/\/|[/?#]/u.test(event.targetId)) add({ id:`event-full-url:${event.id}`, severity:'high', message:'Un événement site contient une URL complète.', targetId:event.id })
    const serialized = JSON.stringify(event.metadata ?? {})
    if (/https?:\/\/|[?&](token|key|code|password)=/iu.test(serialized)) add({ id:`sensitive-metadata:${event.id}`, severity:'high', message:'Des métadonnées de site semblent contenir une URL ou un secret.' })
  }
  const correctionGroups = new Map<string, Set<string>>()
  for (const correction of model.corrections) {
    const key = `${correction.type}:${correction.targetId ?? '*'}`
    const values = correctionGroups.get(key) ?? new Set<string>()
    values.add(JSON.stringify(correction.newValue))
    correctionGroups.set(key, values)
  }
  for (const [key, values] of correctionGroups) if (values.size > 1) add({ id:`contradictory-corrections:${key}`, severity:'medium', message:'Des corrections contradictoires existent pour la même cible.' })
  const critical = issues.some((item)=>item.severity==='critical')
  const status = critical ? 'critical' : issues.length ? 'warning' : 'healthy'
  return { status, issues, summary: status === 'healthy' ? ['Le UserModel est cohérent et correctement borné.'] : [`${issues.length} problème(s) détecté(s).`, critical ? 'Le modèle ne doit pas être utilisé avant correction de l’isolation utilisateur.' : 'Le modèle reste utilisable avec prudence.'] }
}
