/**
 * Wrapper typé sur window.vethos.
 * Permet d'importer une API testable plutôt que d'accéder à window directement.
 */
import type { VethosApi } from '../../../preload/index'

export const vethos: VethosApi = window.vethos
