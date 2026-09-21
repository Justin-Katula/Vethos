// Metro doit voir le moteur de planification, qui vit HORS de ce dossier.
//
// Le moteur (`../src/shared/planning`) est la cervelle de Vethos : capacité,
// placement, faisabilité, repos, apprentissage — 6 900 lignes et 271 tests. Il
// n'importe ni Electron ni Node, seulement zod. On le PARTAGE au lieu de le
// recopier : une correction profite aux deux applications, et elles ne peuvent
// pas diverger sans que les tests le disent.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const racineMobile = __dirname
const racineDepot = path.resolve(racineMobile, '..')

const config = getDefaultConfig(racineMobile)

// Metro refuse par défaut de sortir du dossier du projet.
config.watchFolders = [path.resolve(racineDepot, 'src', 'shared')]

// Les deux applications ont chacune leur `node_modules` ; on cherche d'abord
// dans celui du mobile pour ne jamais charger la version du bureau.
config.resolver.nodeModulesPaths = [
  path.resolve(racineMobile, 'node_modules'),
  path.resolve(racineDepot, 'node_modules'),
]

config.resolver.extraNodeModules = {
  // Le bureau écrit `@shared/...` : on fait pointer le même nom au même endroit,
  // pour que les fichiers partagés se compilent ici sans une seule retouche.
  '@shared': path.resolve(racineDepot, 'src', 'shared'),
}

module.exports = config
