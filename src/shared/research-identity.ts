/**
 * ResearchIdentity & Search Provider Taxonomy
 *
 * Définit le contrat formel de l'identité de recherche, des métriques de gaspillage évité,
 * des 4 fournisseurs de recherche configurables (Serper, ScraperAPI, Scrape.do, Bright Data),
 * des quotas, du cache de recherche et du journal d'enrichissement Vethos.
 */

export interface ResearchIdentity {
  appIdInterne: string
  displayName: string
  productName?: string
  publisher?: string
  executableName?: string
  executablePath?: string
  aumid?: string
  packageFamilyName?: string
  steamAppId?: string
  source?: string
}

export type ResearchFinalState =
  | 'CATALOG_HIT'
  | 'SKIPPED_NOT_ROOT_APP'
  | 'RESOLVED_FROM_SPECIALIZED_SOURCE'
  | 'RESOLVED_FROM_GENERAL_SEARCH'
  | 'WEB_NO_RELIABLE_SOURCE'
  | 'SEARCH_FREE_QUOTA_EXHAUSTED'
  | 'AI_RESOLVED'
  | 'UNRESOLVED'
  | 'IN_FLIGHT_REUSED'

export interface WasteMetrics {
  searchesAvoidedByCatalog: number
  searchesAvoidedByMetadata: number
  searchesAvoidedBySpecializedSource: number
  searchesAvoidedByNotRootApp: number
  duplicateSearchesAvoided: number
  specializedLookupCount: number
  generalSearchCount: number
  providerTransportAttempts: number
  paidSearchCount: number
  totalSearchCreditsConsumed: number
}

export interface ResearchLogRecord {
  appId: string
  identityKey: string
  displayName: string
  productName?: string
  publisher?: string
  catalogHit: boolean
  rootApplication: boolean
  specializedLookupUsed: boolean
  generalSearchCount: number
  providerTransportAttempts: number
  query1?: string
  query2?: string
  providerUsed: string
  creditsConsumed: number
  sourcesReturned: number
  sourcesRejectedWrongEntity: number
  sourcesAccepted: number
  deepSeekCalled: boolean
  finalState: ResearchFinalState
}

/**
 * Format normalisé interne de résultat de recherche produit par tous les adaptateurs de fournisseurs.
 */
export interface SearchResult {
  title: string
  url: string
  domain: string
  snippet: string
  provider: string
}

export interface SearchOptions {
  timeoutMs?: number
  numResults?: number
  country?: string
  language?: string
}

export type QuotaStateSource = 'PROVIDER_API' | 'LOCAL_ESTIMATE'

export interface ProviderQuotaState {
  providerId: string
  requestsUsed: number
  creditsUsed: number
  estimatedSearchesRemaining: number
  quotaStateSource: QuotaStateSource
  freeQuotaRemaining?: number
  freeQuotaResetAt?: string
  lastCheckedAt?: string
  details?: Record<string, unknown>
}

export interface SearchProviderConfig {
  id: string
  name: string
  enabled: boolean
  priority: number
  freeQuotaRemaining?: number
  freeQuotaResetAt?: string
  estimatedCreditsPerSearch: number
  estimatedCostPerSearch: number
  consecutiveFailures: number
  cooldownUntil?: number
  isFreeTier?: boolean
  costPerRequest?: number
  remainingQuota?: number
}

export interface SearchProvider {
  id: string
  name: string
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
  isAvailable(): Promise<boolean> | boolean
  getQuotaState(): Promise<ProviderQuotaState> | ProviderQuotaState
  getConfig(): SearchProviderConfig
  updateConfig(patch: Partial<SearchProviderConfig>): void
}

/**
 * Entrée de cache local de résultats de recherche Web.
 */
export interface SearchCacheEntry {
  cacheKey: string
  query: string
  results: SearchResult[]
  provider: string
  searchedAt: number
  ttlMs: number
}

/**
 * Durée par défaut de validité du cache de recherche (7 jours : l'identité logicielle est pérenne).
 */
export const DEFAULT_SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Sécurité anti-dépense payante par défaut : aucune recherche payante automatique sans accord explicite.
 */
export const DEFAULT_ALLOW_PAID_SEARCH = false

export interface ProviderCallMetric {
  provider: string
  query: string
  logicalSearchNumber: number
  transportAttempt: number
  latencyMs: number
  httpStatus: number
  success: boolean
  creditsConsumed: number
  quotaBefore?: number
  quotaAfter?: number
  quotaStateSource: QuotaStateSource
  resultCount: number
}

export interface GlobalSearchMetrics {
  catalogHits: number
  userCatalogHits: number
  specializedSourceHits: number
  notRootSkipped: number
  generalSearches: number
  providerTransportAttempts: number
  entityRejectedResults: number
  earlyStops: number
  query2Required: number
  unresolved: number
  deepSeekCalls: number
  providerStats: Record<
    string,
    {
      successfulSearches: number
      failedSearches: number
      creditsUsed: number
      freeSearchesUsed: number
      estimatedFreeRemaining: number
    }
  >
}
