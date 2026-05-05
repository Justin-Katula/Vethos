/** Préfixes de sous-domaines générés automatiquement pour chaque domaine bloqué. */
export const AUTO_SUBDOMAIN_PREFIXES = ['', 'www.', 'm.', 'mobile.'] as const

/** Génère toutes les variantes pour un domaine donné. */
export function expandDomain(domain: string): string[] {
  return AUTO_SUBDOMAIN_PREFIXES.map((p) => `${p}${domain}`)
}
