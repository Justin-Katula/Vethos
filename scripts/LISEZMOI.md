# Reconnaissance et classement des applications

Comment Vethos apprend, seul, quelles applications sont installées et à quoi elles
servent — sans jamais demander à un modèle de langage de quel produit il s'agit.

```bash
powershell -ExecutionPolicy Bypass -File scripts\construire-tout.ps1
```

---

## Le principe

Chaque échec rencontré pendant la construction était un **échec d'identité**, jamais
un échec de description. La recherche floue de winget rendait *Elm* pour Ollama,
*iQIYI* pour JDownloader, *PokerTH* pour Armoury Crate — un bon résultat sur huit.

D'où la règle qui gouverne tout :

> **On ne fait jamais confiance à un résultat extérieur. On le confronte à ce que le
> binaire dit déjà de lui-même.**

L'éditeur, la version et le nom d'origine sont inscrits dans le fichier par celui qui
l'a compilé. Ils ne viennent d'aucune recherche et ne peuvent pas être hallucinés.

---

## Les trois couches

### 1 — Découvrir *(local, gratuit)*

Cinq sources, parce qu'aucune n'est complète :

| Source | Ce qu'elle seule apporte |
|---|---|
| Registre de désinstallation | les installations classiques |
| Paquets MSIX | le Magasin Windows, **totalement absent du registre** |
| Manifestes Steam | les jeux, avec leur App ID |
| Raccourcis du menu Démarrer | ce que l'utilisateur voit |
| Processus en cours | ce qui tourne sans être déclaré |

### 2 — Identifier *(local d'abord, annuaires ensuite)*

Par ordre de force décroissante :

1. **Identité de paquet** — PFN MSIX, App ID Steam. Même clé des deux côtés, donc
   décisif : `4DF9E0F8.Netflix` → *Netflix*, `Microsoft.ScreenSketch` → *Snipping Tool*.
2. **Identifiant canonique winget** — établi par Windows, pas par une recherche.
3. **`ProductName` du binaire** — écrit par le compilateur. C'est ainsi que
   « Blender 5.0 / blender-launcher.exe » redevient *Blender / Blender Foundation*.
4. **Recherche, puis vérification** — dernier recours, décrit plus bas.

### 3 — Classer *(par les preuves, jamais par le nom)*

| Preuve | Exemple mesuré |
|---|---|
| Types de fichiers associés | `.nzb .dlc .metalink` → **télécharger** |
| Protocole d'URL déclaré | `steam://` → **jouer** + **gérer sa ludothèque** |
| Emplacement | bibliothèque Steam → **jouer** |
| Programmes hébergés | 6 sous un dossier → c'est un hôte |
| Description officielle | *« BitTorrent client »* → **télécharger** |

Le vocabulaire est fermé : **75 activités** dans `src/shared/activites.json`. Un test
vérifie qu'aucun identifiant hors de cette liste ne peut sortir du classement.

### Les preuves profondes

Quand tout ce qui précède se tait, il reste ce que l'éditeur a écrit sans y penser.
C'est ce qui a résolu les quatre derniers cas :

| Preuve | Ce qu'elle a révélé |
|---|---|
| Ressource VERSIONINFO **complète** | « AMD Settings » ne se décrit nulle part — sauf dans son numéro de version : `AMD-Radeon-Driver/drivers` |
| Pilote noyau embarqué (`.sys`, `WdfCoinstaller*`) | « PC Remote Receiver » ne dit rien, mais livre `driververifyx64` |
| `FileDescription` du bon binaire | « AMD Install Manager », une fois le bon exécutable choisi |
| Nom du dossier d'installation | `wpa.exe` ne dit que « wpa » ; son dossier annonce « Windows Performance Toolkit » |

On ne lisait que quatre des onze champs de la ressource de version. Les sept autres —
`Comments`, `InternalName`, `LegalTrademarks`, `ProductVersion` — sont écrits par le
compilateur, jamais par le marketing.

**Le choix du binaire principal compte autant que les preuves elles-mêmes.** Le filtre
qui écarte installateurs et désinstallateurs rejetait `AMDInstallManager.exe` sur le mot
« install », laissant gagner `7z.exe`, simple utilitaire embarqué — et l'application
entière s'appelait « 7-Zip ». Un exécutable qui porte le nom de son propre dossier passe
désormais avant tout autre.

---

## La vérification

Un candidat extérieur n'est retenu que si :

> **une preuve décisive, ou deux preuves concordantes — et aucune contradiction.**

| Preuve | Force |
|---|---|
| Identité de paquet identique | décisive |
| Même éditeur | forte |
| Même version | forte |
| Nom d'exécutable retrouvé dans la fiche | forte |
| Nom strictement identique | forte |
| **Ressemblance de nom** | **aucune** |

Une seule contradiction annule tout. Et **l'ambiguïté vaut refus** : une recherche sur
« Visual Studio » rend *Visual Studio Code*, *Visual Studio Community* et
*Visual Studio Code Insiders*, tous édités par Microsoft. Aucun n'est retenu.

Ce qui fonctionne dans l'autre sens : `MSIAfterburner` → `Guru3D.Afterburner` est
accepté malgré des noms différents, parce que l'éditeur, la version et le nom
d'exécutable concordent tous les trois.

---

## Les quatre niveaux d'une fiche

| Niveau | Sens | Bloquable |
|---|---|---|
| `PROUVE` | associations de fichiers, protocole, emplacement | oui |
| `DEDUIT` | description officielle de l'éditeur | oui |
| `INCONNU` | aucune preuve | **non** |
| `NEUTRE` | pilote, service, runtime : pas une application | **non** |

**La règle d'or : une application inconnue n'est jamais bloquée.** Ne pas savoir n'est
pas une raison de punir. C'est précisément l'inverse qui bloquait 150 applications
quand l'utilisateur voulait jouer.

---

## Résultat mesuré

Sur une machine réelle, 221 emplacements inventoriés :

- **151 NEUTRES** — pilotes, couches matérielles, services. Aucun index ne les décrit,
  et c'est normal : personne ne publie de fiche pour « ASUS AIOFan HAL ».
- **70 applications**, dont **70 classées — 100 %** : 50 par preuve locale, 20 par
  description officielle.
- **0 inconnue.**
- **0 application bloquable sans preuve.** C'est l'invariant vérifié à chaque build.

Les quatre dernières ont cédé non pas à une recherche extérieure — aucun index public
ne référence les logiciels de constructeur d'AMD, Monect ou ASUS — mais à des preuves
locales que l'on ne lisait pas encore. Voir « Les preuves profondes » ci-dessous.

La règle d'or n'a pas bougé pour autant : une application qui resterait inconnue ne
serait jamais bloquée. Le taux de 100 % est un résultat, jamais un objectif — le faire
monter en devinant serait exactement le défaut d'origine.

## La boucle vérifiée de bout en bout

`src/main/identite/decision-reelle.test.ts` rejoue la décision sur le catalogue
construit. C'est l'épreuve du défaut d'origine — « je veux jouer » n'autorisait que
trois lanceurs et une boutique :

| Vérification | Résultat |
|---|---|
| « jouer » autorise toutes les applications qui servent à jouer | 17 sur 17 |
| une application inconnue reste autorisée, quelle que soit la tâche | 4 sur 4 |
| « écrire du code » autorise les outils de développement et bloque les jeux | oui |
| un lanceur de jeux sait aussi « jouer » | 5 sur 5 |

La dernière ligne compte : un jeu Steam se lance depuis Steam. Un lanceur qui ne
servirait qu'à « gérer sa ludothèque » rendrait le jeu injoignable.

---

## Fichiers

| Rôle | Fichier |
|---|---|
| Boucle vérifiée de bout en bout | `../src/main/identite/decision-reelle.test.ts` |
| Inventaire local | `identite-locale.ps1` |
| Sonde : tout ce que la machine dit d'une application | `sonde-profonde.ps1` |
| Protocoles d'URL | `preuves-protocoles.ps1` |
| Types de fichiers | `preuves-extensions.ps1` |
| Identifiants installés | `identifiants-winget.ps1` |
| Magasin Windows | `resoudre-store.cjs` |
| Descriptions officielles | `descriptions-winget.cjs` |
| Recherche + vérification | `resoudre-inconnues.cjs` |
| Provenance | `provenance.cjs` |
| Vocabulaire des activités | `../src/shared/activites.json` |
| Classement | `../src/shared/classement/` |
| Vérification | `../src/main/identite/verification.ts` |
| Assemblage | `../src/main/identite/construire-catalogue.ts` |

---

## Six pièges qui coûtent cher

**Un dossier partagé n'a pas de pilote à lui.** `C:\Windows\System32` déborde de
fichiers `.sys` qui n'appartiennent à aucune des applications qui y résident. Sans
réserve, l'Éditeur du Registre et la Connexion Bureau à distance « installaient un
pilote ». La même réserve vaut pour toutes les preuves tirées du contenu d'un dossier.



**Un dossier imbriqué n'est pas un morceau du dossier parent.** Cinq jeux Steam ont
`Steam` pour dossier parent. Absorber un enfant sur la seule imbrication des chemins
faisait disparaître les jeux dans leur lanceur — le défaut d'origine sous un autre
costume. Le discriminant est le segment de chemin : `...\Engine\Binaries\Win64` désigne
un morceau, `steamapps\common\<jeu>` désigne un produit.

**Un dossier partagé n'est pas un dossier de produit.** Réunir ce que déclarent tous
les exécutables d'un dossier est juste pour un produit installé chez lui. Appliqué à
`C:\Windows\System32`, le même balayage ramasse les associations de tout le système :
l'Éditeur du Registre se retrouvait à « naviguer sur le web » et « écrire du code ».

**Un motif court se cache à l'intérieur des mots.** « amdinsta·llm·anager » contient
« llm », et le gestionnaire d'installation d'AMD passait pour un outil de dialogue avec
une IA. Les motifs de quatre lettres ou moins ne correspondent qu'à des mots entiers —
au-delà, la recherche reste libre, pour que « shell » reconnaisse « PowerShell ».

## Deux pièges de protocole

**Le gabarit du Magasin s'écrit `Details`, avec une majuscule**, et la réponse arrive
sous `Product` au singulier — là où la résolution par identité rend `Products`. Avec la
mauvaise casse, le service répond `200` et un corps vide, ce qui ressemble à une absence
de données alors que la description existe.

**Le binaire principal n'est presque jamais celui qui porte les associations.** Python
associe `.py` à `py.exe`, Office répartit ses 82 associations entre Word, Excel et
Outlook, et l'exécutable le plus volumineux d'un dossier est souvent son
désinstallateur. On réunit donc ce que déclare *tout* exécutable du dossier et de ses
sous-dossiers.
