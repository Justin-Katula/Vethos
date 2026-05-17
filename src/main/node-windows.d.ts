// Déclaration de types locale pour node-windows : le paquet n'a pas de @types
// officiel fiable. Couvre uniquement l'API `Service` utilisée par le spike P16.
declare module 'node-windows' {
  export interface ServiceOptions {
    /** Nom du service Windows (sans espaces). */
    name: string
    description?: string
    /** Chemin absolu du script JS exécuté par le service. */
    script: string
    /** Variables d'environnement du service. */
    env?: Array<{ name: string; value: string }>
    /** Délai initial (s) avant la 1re tentative de redémarrage. */
    wait?: number
    /** Facteur de croissance du délai entre redémarrages. */
    grow?: number
    /** Nombre maximum de redémarrages dans une fenêtre de 60 s. */
    maxRestarts?: number
  }

  export type ServiceEvent =
    | 'install'
    | 'alreadyinstalled'
    | 'invalidinstallation'
    | 'uninstall'
    | 'start'
    | 'stop'
    | 'error'

  export class Service {
    constructor(options: ServiceOptions)
    /** True si le service est déjà installé. */
    readonly exists: boolean
    install(): void
    uninstall(): void
    start(): void
    stop(): void
    on(event: 'error', listener: (err: Error) => void): this
    on(event: Exclude<ServiceEvent, 'error'>, listener: () => void): this
  }
}
