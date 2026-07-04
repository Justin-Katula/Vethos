import type { VethosApi } from './index'

declare global {
  interface Window {
    vethos: VethosApi
  }
}

export {}
