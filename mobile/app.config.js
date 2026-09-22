/**
 * Le seul morceau de configuration qui n'appartient pas au dépôt.
 *
 * `ios.appleTeamId` identifie un compte Apple Developer — celui de la personne
 * qui compile, pas celui du produit. Écrit dans `app.json`, il partait dans
 * git, et le premier clone d'une autre machine aurait signé sous une équipe
 * qui n'est pas la sienne.
 *
 * Expo lit `app.json` d'abord et le passe ici : ce fichier ne remplace rien, il
 * ajoute la seule valeur qui varie d'une personne à l'autre. Sans la variable,
 * la configuration est exactement celle d'avant — le serveur signale alors
 * l'absence à chaque démarrage, ce qui est la bonne façon de la remarquer.
 *
 *     APPLE_TEAM_ID=XXXXXXXXXX npm run build:dev
 */
module.exports = ({ config }) => {
  const equipe = process.env.APPLE_TEAM_ID?.trim()
  if (!equipe) return config
  return { ...config, ios: { ...config.ios, appleTeamId: equipe } }
}
