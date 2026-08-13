# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Application de bureau Windows empaquetée avec Electron. Le langage d'interface
est celui du web : un habillage natif ne change pas cette nature.

## Users

Utilisateur unique et engagé, sur son propre ordinateur, qui veut savoir quoi
faire maintenant sans avoir à en décider. Étudiant ou travailleur avec des
échéances réelles et des obligations fixes (cours, travail, trajets).

L'auteur compte **distribuer** l'application. Conséquence directe sur toute
décision d'interface : elle doit s'enseigner seule. Quelqu'un qui l'ouvre pour
la première fois ne connaît ni le vocabulaire du moteur ni ses règles. Les états
vides instruisent, le premier lancement tient debout sans accompagnement, et
aucun libellé ne suppose la lecture d'une spécification.

## Product Purpose

Décider à la place de l'utilisateur ce qui tient dans le temps qu'il a
réellement, et l'empêcher de se disperser pendant qu'il l'exécute.

L'utilisateur déclare sa réalité fixe une fois. L'application en déduit sa
capacité effective, place les tâches et les objectifs, et prouve par des
chiffres ce qui rentre et ce qui ne rentre pas avant chaque échéance.

Succès : l'utilisateur ouvre l'application, voit quoi faire, et referme.

## Positioning

**L'application ne pose jamais de question.** Elle ne demande pas quoi faire,
comment répartir le temps, ni quel sacrifice consentir en cas d'impossibilité :
elle décide, avec un ordre de priorité établi, et rend le calcul vérifiable.
C'est l'utilisateur qui vient lui demander quelque chose, jamais l'inverse.

Corollaire : quand c'est impossible, elle le prouve avec un déficit chiffré en
minutes et des options déjà quantifiées, au lieu d'afficher un statut vague.

## Operating Context

Deux piliers d'importance **égale**, et l'interface doit les traiter comme tels :

1. **Planifier** : déclarer son temps, laisser le moteur placer le travail.
2. **Bloquer** : empêcher les applications et sites distrayants pendant le
   travail, via un recouvrement natif Windows.

Rythme d'usage : **mise en place, puis ça tourne.** L'utilisateur déclare son
temps et ses tâches, puis l'application travaille en fond. Il ne l'ouvre ensuite
que pour consulter un état ou ajuster. L'accueil est donc une surface de
consultation, pas un plan de travail où l'on séjourne.

## Capabilities and Constraints

Confirmé et en place :

- Moteur de planification complet : capacité effective, estimation corrigée par
  l'historique mesuré, test de faisabilité par densité, cascade de placement,
  protection du repos, apprentissage. 452 tests. **Intouchable.**
- Trois types d'objets aux lois distinctes : tâche (deadline + marge), objectif
  (cible hebdomadaire, jamais de deadline), ancre (heure fixe).
- Blocage par recouvrement Windows avec un sidecar C#.
- Stockage local chiffré par compte, validé par schéma à l'écriture et à la
  lecture. Aucun serveur.
- Mises à jour automatiques (electron-updater).

Contraintes durables :

- Aucune notification pendant les heures de sommeil, sans exception.
- Un objectif ne peut jamais recevoir de deadline.
- Deux ancres ne peuvent jamais occuper le même créneau.
- La marge de sécurité prouvée d'une tâche ne s'échange jamais contre du confort.
- Le sidecar de blocage doit être signé pour être distribué (Smart App Control
  refuse un binaire non signé, sans exclusion possible).

Non décidé : modèle de distribution (gratuit, payant, licence), et si le compte
local restera local.

## Brand Commitments

- Nom : **Vethos**. Signature actuelle : « Focus, par design. »
- Langue : français, tutoiement.
- Actifs existants : logo dans `Logo/` (bouclier + V).
- Voix : directe et factuelle. L'application affirme ce qu'elle a calculé au
  lieu de suggérer. Elle ne s'excuse pas et ne flatte pas.

## Evidence on Hand

- Spécification écrite du moteur de planification, appliquée à la lettre, avec
  huit critères d'acceptation vérifiés par tests.
- 452 tests verts couvrant chaque formule du moteur.
- Historique Git de l'interface, dont trois refontes visuelles rejetées par
  l'auteur comme « moches ».

## Open Decisions

- Le nom `Nexus` subsiste dans le code et le stockage (`nexus_*.json`,
  `window.nexus`) alors que le produit s'appelle Vethos. Renommage non tranché.
