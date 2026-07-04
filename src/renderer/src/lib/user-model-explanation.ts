import type { UserAppSitePreference, UserCognitiveModel, UserCorrection, UserDisciplineModel, UserModel, UserObjectivePreference } from '@shared/user-model'

export type UserModelExplanation = { targetType: 'user_model'|'objective'|'cognitive_model'|'discipline_model'|'app'|'site'|'correction'; targetId?: string; title: string; summary: string; reasons: string[]; confidence: number; severity?: 'info'|'warning'|'high'; debug?: Record<string, unknown> }
const reasons = (items: readonly string[], fallback: string) => items.length ? [...items] : [fallback]

export function explainObjectivePreference(preference: UserObjectivePreference): UserModelExplanation {
  const avoided = preference.avoidanceScore >= 55
  const stagnant = preference.stagnationScore >= 55
  const momentum = preference.momentumScore >= 55
  const summary = avoided ? 'Cet objectif paraît important, mais plusieurs signaux indiquent qu’il est repoussé.' : stagnant ? 'Cet objectif manque de progression récente.' : momentum ? 'Cet objectif bénéficie d’une progression récente.' : 'La relation à cet objectif est encore en cours d’apprentissage.'
  const extra = preference.confidence < 45 ? ['Cette lecture reste une tendance provisoire faute de données suffisantes.'] : []
  return { targetType: 'objective', targetId: preference.objectiveId, title: 'Relation à l’objectif', summary, reasons: reasons([...preference.reasons, ...extra], 'Données encore insuffisantes.'), confidence: preference.confidence, severity: avoided || stagnant ? 'warning' : 'info' }
}

export function explainCognitiveModel(model: UserCognitiveModel): UserModelExplanation {
  const best = model.bestDeepWorkWindows[0]
  const confidence = best?.confidence ?? Math.max(0, ...model.hourlyPerformance.map((item) => item.confidence))
  const contradiction = model.declaredChronotype !== 'unknown' && model.detectedChronotype !== 'unknown' && model.declaredChronotype !== model.detectedChronotype
  return { targetType: 'cognitive_model', title: 'Rythme cognitif', summary: best ? `Les données suggèrent un créneau favorable autour de ${best.startHour} h.` : 'Aucun créneau fort ne peut encore être affirmé.', reasons: reasons([confidence < 45 ? 'La tendance reste prudente faute d’échantillons.' : 'Plusieurs échantillons soutiennent cette tendance.', ...(contradiction ? ['Le rythme déclaré et le rythme observé diffèrent; les deux sont conservés.'] : [])], 'Données encore insuffisantes.'), confidence }
}

export function explainDisciplineModel(model: UserDisciplineModel): UserModelExplanation {
  return { targetType: 'discipline_model', title: 'Contextes de vigilance', summary: model.globalDistractionRisk >= 60 ? 'Certains contextes demandent une protection plus ferme.' : 'Le risque observé reste modéré.', reasons: reasons(model.reasons, 'Pas encore assez de signaux comportementaux.'), confidence: model.confidence, severity: model.globalDistractionRisk >= 70 ? 'high' : model.globalDistractionRisk >= 45 ? 'warning' : 'info' }
}

export function explainAppSitePreference(preference: UserAppSitePreference): UserModelExplanation {
  const best = [...preference.contextRules].sort((a,b) => b.confidence-a.confidence)[0]
  return { targetType: preference.kind, targetId: preference.identifier, title: 'Classification contextuelle', summary: best ? `Classification actuelle : ${best.classification}.` : 'Classification encore inconnue.', reasons: reasons(best?.reasons ?? [], 'Aucune règle contextuelle disponible.'), confidence: best?.confidence ?? 0 }
}

export function explainCorrectionImpact(correction: UserCorrection): UserModelExplanation {
  const cautious = correction.context?.duringSession === true
  return { targetType: 'correction', targetId: correction.id, title: 'Impact de la correction', summary: cautious ? 'La correction est conservée avec un poids prudent car elle a été faite pendant une session.' : 'La correction est intégrée au modèle utilisateur.', reasons: [cautious ? 'Le contexte protégé peut favoriser une décision impulsive; aucune accusation n’est portée.' : `Force déclarée : ${correction.strength}.`], confidence: cautious ? 35 : correction.strength === 'permanent' ? 100 : correction.strength === 'strong' ? 80 : correction.strength === 'normal' ? 50 : 25 }
}

export function explainUserModel(model: UserModel): UserModelExplanation[] {
  return [
    { targetType: 'user_model', title: 'Ce que Vethos protège', summary: `${model.disciplineCommitments.length} engagement(s) actif(s).`, reasons: reasons(model.disciplineCommitments.map((item) => item.label), 'Aucun engagement explicite pour le moment.'), confidence: model.metadata.confidence },
    ...model.objectivePreferences.map(explainObjectivePreference), explainCognitiveModel(model.cognitiveModel), explainDisciplineModel(model.disciplineModel), ...model.appSitePreferences.map(explainAppSitePreference), ...model.corrections.slice(-5).map(explainCorrectionImpact),
  ]
}
