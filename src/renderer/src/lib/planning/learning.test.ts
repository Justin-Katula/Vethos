import { describe, it, expect } from 'vitest'
import { createObservation, groupObservationsByHour, reclassifyAllWindows, observationsByCategory, hasEnoughData, dataConfidenceLevel } from './learning'

describe('Partie G — learning', () => {
  describe('G.1 createObservation', () => {
    it('crée une observation avec timestamp', () => {
      const obs = createObservation({ category: 'maths', estimatedMinutes: 60, actualMinutes: 70, startHour: 9, completed: true })
      expect(obs.category).toBe('maths')
      expect(obs.createdAt).toBeDefined()
    })
  })

  describe('G.2 groupObservationsByHour', () => {
    it('regroupe par heure', () => {
      const observations = [
        createObservation({ startHour: 9, completed: true }),
        createObservation({ startHour: 9, completed: false }),
        createObservation({ startHour: 14, completed: true }),
      ]
      const map = groupObservationsByHour(observations)
      expect(map.get(9)).toHaveLength(2)
      expect(map.get(14)).toHaveLength(1)
    })

    it('ignore les observations sans startHour', () => {
      const observations = [createObservation({ completed: true })]
      const map = groupObservationsByHour(observations)
      expect(map.size).toBe(0)
    })
  })

  describe('G.2 reclassifyAllWindows', () => {
    it('retourne NORMALE pour les heures sans données', () => {
      const result = reclassifyAllWindows([])
      expect(result.get(9)).toBe('NORMALE')
    })

    it('reclasser en PROFONDE avec ≥5 obs à 75%+ complétion', () => {
      const observations = Array.from({ length: 5 }, () => createObservation({ startHour: 9, completed: true }))
      const result = reclassifyAllWindows(observations)
      expect(result.get(9)).toBe('PROFONDE')
    })
  })

  describe('observationsByCategory', () => {
    it('filtre par catégorie', () => {
      const observations = [
        createObservation({ category: 'maths', estimatedMinutes: 60, actualMinutes: 70 }),
        createObservation({ category: 'codage', estimatedMinutes: 120, actualMinutes: 180 }),
        createObservation({ category: 'maths', estimatedMinutes: 30, actualMinutes: 35 }),
      ]
      const maths = observationsByCategory(observations, 'maths')
      expect(maths).toHaveLength(2)
    })
  })

  describe('G.3 prudence', () => {
    it('hasEnoughData : false sous 5', () => {
      expect(hasEnoughData(4)).toBe(false)
      expect(hasEnoughData(5)).toBe(true)
    })

    it('dataConfidenceLevel', () => {
      expect(dataConfidenceLevel(0)).toBe('none')
      expect(dataConfidenceLevel(3)).toBe('low')
      expect(dataConfidenceLevel(7)).toBe('medium')
      expect(dataConfidenceLevel(15)).toBe('high')
    })
  })
})
