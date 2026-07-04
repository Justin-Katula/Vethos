export type CoachResult<T> = {
  decision: 'use_result' | 'fallback'
  classification: string
  confidence: number
  reasons: string[]
  safety: { status: 'safe' | 'fallback'; fallbackUsed: boolean }
  data: T
}

export function coachSuccess<T>(classification: string, data: T, reasons: string[], confidence = 80): CoachResult<T> {
  return { decision:'use_result', classification, confidence, reasons, safety:{ status:'safe', fallbackUsed:false }, data }
}

export function coachFallback<T>(classification: string, data: T, reason: string): CoachResult<T> {
  return { decision:'fallback', classification, confidence:0, reasons:[reason], safety:{ status:'fallback', fallbackUsed:true }, data }
}
