/**
 * Wrapper typé sur window.nexus.
 * Permet d'importer une API testable plutôt que d'accéder à window directement.
 */
import type { NexusApi } from '../../../preload/index'

export const nexus: NexusApi = window.nexus
