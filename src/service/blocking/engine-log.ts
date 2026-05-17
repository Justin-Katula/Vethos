// Logger du moteur de blocage — utilisable dans le main ET le service.
// electron-log/node fonctionne dans n'importe quel contexte Node, y compris
// sous ELECTRON_RUN_AS_NODE (validé en Phase 1). Évite la dépendance à
// @main/logging/setup, couplé à l'API Electron `app`.
import log from 'electron-log/node'

export default log
