export type ScrapedPageMetadata = {
  url: string
  domain: string
  title: string
  description?: string
  keywords?: string
}

export type SemanticActiveTask = {
  id?: string
  title: string
  objectiveName?: string
  allowedDomains?: string[]
}

export type SemanticValidationPayload = {
  active_task: SemanticActiveTask
  user_justification: string
  scraped_metadata: ScrapedPageMetadata
}

export type SemanticValidationResult = {
  intentionScore: number
  truthScore: number
  totalScore: number
  allowed: boolean
  allowMinutes: number
  reason: string
  rawContent?: string
}
