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

  if (!equipe) {
    // Pendant une compilation, l'absence n'est plus un detail : les trois
    // extensions natives ont besoin d'une equipe pour etre signees, et sans
    // elle l'echec arrive bien plus loin, dans Xcode, sous une forme qui ne
    // nomme pas la cause. Le greffon signale deja l'absence ; on dit ici
    // quoi faire, parce que c'est le seul endroit qui le sait.
    if (process.env.EAS_BUILD === 'true') {
      console.warn(
        '\n[vethos] APPLE_TEAM_ID absent de cette compilation.' +
          '\n         Pose-le une fois pour toutes :' +
          '\n         npx eas-cli secret:create --scope project --name APPLE_TEAM_ID --value XXXXXXXXXX\n',
      )
    }
    return config
  }

  return { ...config, ios: { ...config.ios, appleTeamId: equipe } }
}
