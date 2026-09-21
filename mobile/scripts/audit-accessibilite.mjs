import fs from 'node:fs'
import path from 'node:path'

/**
 * Toute cible tactile doit dire ce qu'elle EST et ce qu'elle FAIT.
 *
 * Une `Pressable` nue n'est qu'une vue qui réagit au doigt : VoiceOver ne
 * l'annonce pas comme un bouton, et ne dit pas non plus qu'elle est
 * désactivée. Un `TextInput` sans étiquette n'annonce que sa valeur — « 60 »,
 * sans jamais dire 60 quoi, parce que le placeholder disparaît dès que le
 * champ est rempli.
 *
 * Ces deux défauts ne se voient sur AUCUNE capture d'écran. C'est pour ça
 * qu'ils survivent : l'interface est parfaite à l'œil, et inutilisable sans.
 *
 * La règle appliquée ici :
 *
 * - `Pressable` → doit déclarer `accessibilityRole`. Son NOM peut venir soit
 *   d'un `accessibilityLabel`, soit d'un `<Text>` visible à l'intérieur — un
 *   bouton qui affiche « Ajouter » se nomme déjà tout seul.
 * - `TextInput` → doit déclarer `accessibilityLabel`. Toujours : son étiquette
 *   visible est posée À CÔTÉ, et rien ne les relie.
 *
 * Lancer : `npm run audit:a11y`
 */

const RACINES = ['src', 'app']

function fichiers(dossier, sortie = []) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, entree.name)
    if (entree.isDirectory()) fichiers(chemin, sortie)
    else if (entree.name.endsWith('.tsx') && !entree.name.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

/**
 * L'étendue exacte d'un élément JSX, depuis `<Nom` jusqu'à sa fermeture.
 *
 * Compte les `<Nom` imbriqués pour ne pas s'arrêter au premier `</Nom>` venu :
 * une `Pressable` dans une `Pressable` est rare, mais une seule suffirait à
 * fausser tout le rapport — et un audit qui se trompe une fois ne se relance
 * plus jamais.
 */
function etendue(source, nom, debut) {
  const finBalise = source.indexOf('>', debut)
  if (finBalise === -1) return source.slice(debut)
  // Auto-fermante : l'élément n'a pas d'enfants.
  if (source[finBalise - 1] === '/') return source.slice(debut, finBalise + 1)

  let profondeur = 1
  let i = finBalise + 1
  while (i < source.length && profondeur > 0) {
    const ouvrante = source.indexOf(`<${nom}`, i)
    const fermante = source.indexOf(`</${nom}>`, i)
    if (fermante === -1) break
    if (ouvrante !== -1 && ouvrante < fermante) {
      // Une imbriquée auto-fermante ne compte pas comme une ouverture.
      const finImbriquee = source.indexOf('>', ouvrante)
      if (finImbriquee !== -1 && source[finImbriquee - 1] !== '/') profondeur++
      i = finImbriquee + 1
      continue
    }
    profondeur--
    i = fermante + nom.length + 3
  }
  return source.slice(debut, i)
}

/**
 * Un bouton se nomme soit par une etiquette, soit par le texte qu'il affiche.
 *
 * `Text` est la primitive de React Native ; `Texte` et `Valeur` sont les
 * notres, et elles rendent un `Text`. Les oublier faisait passer pour muets
 * des boutons qui annoncent parfaitement leur nom — et un audit qui crie au
 * loup trois fois ne se relance plus jamais.
 *
 * Le passage d'enfants (`{children}`, `{contenu}`) compte aussi : le nom vient
 * alors de l'appelant, et c'est chez lui qu'il faut regarder.
 */
function nomme(bloc) {
  if (bloc.includes('accessibilityLabel')) return true
  if (/<(Text|Texte|Valeur)[\s>]/.test(bloc)) return true
  return /\{\s*(children|contenu)\s*\}/.test(bloc)
}

const manques = []
let inspectees = 0

for (const racine of RACINES) {
  for (const fichier of fichiers(racine)) {
    const source = fs.readFileSync(fichier, 'utf8')

    for (const nom of ['Pressable', 'TextInput']) {
      let depuis = 0
      for (;;) {
        const debut = source.indexOf(`<${nom}`, depuis)
        if (debut === -1) break
        depuis = debut + nom.length
        // Ignore `<PressableTruc` : on veut la balise exacte.
        if (/[A-Za-z0-9_]/.test(source[debut + nom.length + 1] ?? '')) continue

        inspectees++
        const bloc = etendue(source, nom, debut)
        const ligne = source.slice(0, debut).split('\n').length
        const ou = `${fichier}:${ligne}`

        if (nom === 'TextInput') {
          if (!bloc.includes('accessibilityLabel')) manques.push(`${ou}  TextInput sans étiquette`)
          continue
        }
        if (!bloc.includes('accessibilityRole')) {
          manques.push(`${ou}  Pressable sans rôle déclaré`)
          continue
        }
        if (!nomme(bloc)) manques.push(`${ou}  Pressable sans nom ni texte visible`)
      }
    }
  }
}

if (manques.length > 0) {
  console.error(manques.join('\n'))
  console.error(`\n${manques.length} cible(s) tactile(s) muette(s).`)
  process.exit(1)
}
// Le compte est affiche pour qu'un audit qui ne regarde plus rien — un
// chemin change, une extension oubliee — ne passe pas pour un audit vert.
console.log(`${inspectees} cibles tactiles inspectées : toutes se déclarent et se nomment.`)
