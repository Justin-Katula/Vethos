export type DeepSeekChatRole = 'system' | 'user' | 'assistant'

export type DeepSeekChatMessage = {
  role: DeepSeekChatRole
  content: string
}

export type DeepSeekChatRequest = {
  model?: string
  messages?: DeepSeekChatMessage[]
  prompt?: string
  thinking?: {
    type: 'enabled' | 'disabled'
    reasoningEffort?: 'high' | 'max'
  }
  temperature?: number
  maxTokens?: number
}

export type DeepSeekChatResult = {
  id?: string
  model?: string
  content: string
  reasoningContent?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

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
