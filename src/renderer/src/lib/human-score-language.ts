export function priorityPhrase(score: number): string {
  if (score >= 85) return 'À protéger maintenant'
  if (score >= 65) return 'Importante aujourd’hui'
  if (score >= 35) return 'À garder en vue'
  return 'Peut attendre'
}
export function urgencyPhrase(score: number): string {
  if (score >= 85) return 'La deadline demande une action immédiate'
  if (score >= 65) return 'Le temps commence à manquer'
  if (score >= 35) return 'Le calendrier reste surveillé'
  return 'La marge est confortable'
}
export function workloadPhrase(score: number): string {
  if (score >= 80) return 'Beaucoup de travail reste à répartir'
  if (score >= 50) return 'La charge est conséquente mais gérable'
  return 'La charge reste légère'
}
export function stagnationPhrase(score: number): string {
  return score >= 65 ? 'Cette direction commence à stagner' : score >= 35 ? 'Un redémarrage serait utile' : 'Le travail reste vivant'
}
export function momentumPhrase(score: number): string {
  return score >= 65 ? 'Un bon élan est déjà présent' : score >= 35 ? 'L’élan se construit' : 'Il faut encore amorcer le mouvement'
}
export function protectionPhrase(score: number): string {
  return score >= 80 ? 'Une protection très ferme est recommandée' : score >= 60 ? 'Une protection forte est recommandée' : score >= 35 ? 'Une protection modérée suffit' : 'Une protection légère suffit'
}
