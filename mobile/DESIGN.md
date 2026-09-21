---
name: Vethos mobile — vues du temps
description: Capture locale de Mon temps et Aujourd’hui dans l’identité existante.
colors:
  clair-bg: "#e6e6e6"
  clair-surface2: "#eeeeee"
  clair-text: "#181818"
  clair-text2: "#4e4e4e"
  clair-text3: "#787878"
  clair-accent-encre: "#c1121f"
  clair-bloc-ancre: "#253047"
  sombre-bg: "#000000"
  sombre-surface2: "#232323"
  sombre-text: "#f2f2f2"
  sombre-text2: "#bebebe"
  sombre-text3: "#8d8d8d"
  sombre-accent-encre: "#f0525f"
  sombre-bloc-ancre: "#2c3a56"
typography:
  headline:
    fontFamily: "Geist_600SemiBold"
    fontSize: "30px"
    letterSpacing: "-0.8px"
  body:
    fontFamily: "Geist_400Regular"
    fontSize: "14px"
  time:
    fontFamily: "GeistMono_400Regular"
    fontSize: "12px"
rounded:
  sm: "3px"
  md: "5px"
  lg: "6px"
  xl: "8px"
spacing:
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
---

# Design System: Vethos mobile — vues du temps

## Overview

Capture locale de **Mon temps**, **Aujourd’hui** et du formulaire d’obligation. Le [contrat racine](../DESIGN.md) et les engagements de marque de [PRODUCT.md](../PRODUCT.md) restent l’autorité : neutralité, Geist, filets fins, petits angles, français factuel. Aucun nouveau North Star ni changement global d’identité n’est établi.

Sources d’exécution : `src/theme/jetons.ts`, `src/ui/temps-visuel.ts`, `Horloge`, `CarteSemaine`, `AgendaJour`, `src/plan/Plan.tsx` et `lecture.ts`.

## Colors

Le cadran, la semaine et l’agenda partagent `couleurTemps` : sommeil et fixes → `text3`, tâches → `accentEncre`, objectifs → `text2`, ancres → `blocAncre`. Le rouge du présent s’ajoute aux tâches rouges établies par la marque.

Le contrat racine établit les objectifs ardoise ; ces composants utilisent actuellement `text2`, pas le jeton dédié `blocObjectif`. Les fixes sont regroupés en gris ici. Cette extraction ne remplace pas la palette racine.

## Typography

Geist porte les libellés, Geist Mono les horaires alignés. Les titres d’écran font 30, les titres d’agenda 16. Le centre du cadran utilise Geist regular avec chiffres tabulaires : taille de base 48, adaptée lorsque `fontScale` dépasse 1,3. Les noms de famille ci-dessus sont les identifiants Expo.

## Layout

Marges horizontales de 20 ; haut égal à la zone sûre + 20. Sept pistes 24 h de 25 × 224 sélectionnent l’agenda du jour. Chaque cible fait au moins 44 de large ; le groupe défile horizontalement au besoin. Le cadran mesure `min(336, largeur − 56)` ; minuit est en haut.

Les valeurs sont des unités logiques React Native. Les captures navigateur à 375 et 390 ne valent pas validation native iPhone : zones sûres, clavier, VoiceOver et grandes tailles de texte restent à vérifier.

## Elevation & Depth

Surfaces neutres et filets, sans ombres ni dégradés ajoutés. Le formulaire utilise une feuille native `pageSheet` avec transition `slide`.

## Shapes

Rayons hérités de 3 à 8 : pistes 5, sélections 6, champs et commandes 8. Arcs à extrémités droites ; points réservés aux repères.

## Components

**Semaine.** Sélection inversée du numéro, point rouge sous le jour choisi, repère rouge du présent. Sommeil visible sur 9 unités de largeur contre 25 pour les engagements.

**Cadran.** Même `JourTemps` que les autres lectures ; sommeil de largeur 6 contre 14, segments terminés à 0,5 d’opacité. Le libellé accessible annonce heure, segment courant et échelle 24 h.

**Agenda.** Lignes chronologiques sans sommeil : début/fin, nature, titre, durée. « En cours » identifie l’activité présente. État vide court.

**Source commune.** `FournisseurPlan` fournit jours et minute aux deux écrans et actualise au retour de l’application ; aucune minuterie propre aux composants.

**Commandes.** Ajout et choix : cibles minimales 44 ; champs : 50 ; Ajouter : 52. Pression par opacité, sélection inversée, sauvegarde désactivée en cours, erreurs textuelles rouges. Les cinq onglets et leur filet actif fixe sont hérités.

## Do's and Don'ts

- **Do** Conserver la neutralité, les filets et les petits rayons du contrat racine.
- **Do** Garder les mêmes segments, minute et couleurs entre semaine, cadran et agenda.
- **Do** Montrer le sommeil comme une bande étroite visible sur les représentations de 24 h.
- **Do** Garder une copie française courte, directe et factuelle.
- **Don't** Introduire du vert, des dégradés décoratifs ou des cartes imbriquées.
- **Don't** Présenter ces deux compositions locales comme une refonte globale de Vethos.
- **Don't** Assimiler des captures navigateur à une validation native iPhone.
