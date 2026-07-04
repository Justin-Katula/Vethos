# Spec — Mode liste blanche (« focus ») pour le blocage

**Date :** 2026-05-21
**Sous-projet :** Blocage piloté par tâche/objectif — ajout d'un mode inversé.
**Statut :** Conçu, en attente de relecture utilisateur avant `writing-plans`.

## 1. Problème

Aujourd'hui un profil de blocage est une **liste noire** : l'utilisateur liste les
sites/apps à bloquer, tout le reste reste autorisé. Mais quand on travaille sur une
tâche précise, le besoin naturel est l'inverse : « pour cette tâche j'ai besoin de
*ces* apps/sites, bloque **tout le reste** ». Reconstruire cette intention à coups de
liste noire est impossible (il faudrait énumérer tout ce qui distrait).

On ajoute donc un **mode liste blanche** (focus) : un interrupteur **par profil**.
Quand il est actif, les listes du profil deviennent l'ensemble **autorisé**, et Vethos
bloque tout ce qui n'y figure pas.

## 2. Périmètre

Livraison **phasée** (approche A validée avec l'utilisateur).

### Phase 1 — Apps (ce spec)
- Interrupteur `Liste noire / Liste blanche` par profil, persisté.
- En liste blanche : Vethos ferme en continu les **apps à fenêtre visible** qui ne sont
  pas dans l'ensemble autorisé (et hors safe-list système).
- Les **sites** ne sont **pas encore filtrés** en mode liste blanche (voir Phase 2).
  L'UI l'indique clairement.

### Phase 2 — Sites (spec séparée, hors de ce document)
- Filtrage « tout refuser sauf X » via un **résolveur DNS local** en default-deny.
  Le fichier `hosts` actuel ne sait que lister des domaines à bloquer ; il est
  incapable d'autoriser-seulement. Chantier isolé, écrit après la Phase 1.

### Non-objectifs
- Pas de bascule du pare-feu Windows en default-deny global (trop risqué, casserait
  tout le système et Vethos lui-même).
- Pas d'allowlist via AppLocker en Phase 1 (AppLocker sait faire du default-deny mais
  c'est complexe et peut empêcher tout lancement d'app — risque trop élevé). Le mode
  liste blanche s'appuie **uniquement** sur le kill de processus fenêtrés.
- Pas de refonte visuelle (la couche « beauté » reste pour le sous-projet Interface).

## 3. Comportement (UX)

- Dans l'éditeur de profil, un interrupteur en haut : **Liste noire** (défaut) /
  **Liste blanche**.
- En liste blanche, les libellés des champs basculent :
  - « Sites bloqués » → « Sites autorisés » + note : *« filtrage des sites bientôt
    (Phase 2) »*.
  - « Apps bloquées (processus) » → « Apps autorisées (processus) ».
  - « Apps réseau (par chemin) » → « Apps réseau autorisées ».
- Le scanner d'apps et les suggestions de sites fonctionnent à l'identique (ils
  remplissent les mêmes champs).
- **Garde-fou** : on **interdit de démarrer** une session en liste blanche si aucune
  app autorisée n'est définie (sinon « tout fermer » = piège). Message clair.
- Pendant une session liste blanche active, l'`ActiveSessionCard` indique le mode
  (« Focus : seules N apps autorisées »).

## 4. Modèle de données

`src/shared/schemas.ts` — `BlockingProfileSchema` gagne un champ :

```ts
mode: z.enum(['blocklist', 'allowlist']).default('blocklist'),
```

- Défaut `'blocklist'` → **rétrocompatible** : les profils existants et l'`ActiveSession`
  snapshot continuent de fonctionner sans migration de données.
- En mode `'allowlist'`, les trois listes existantes (`blockedSites`,
  `blockedProcesses`, `blockedNetworkApps`) sont **réinterprétées** comme l'ensemble
  *autorisé*. Pas de nouveaux champs (les validations regex sont identiques pour
  « autorisé » et « bloqué »).
- Décision assumée : les noms de champs gardent le préfixe `blocked*` côté stockage
  alors qu'ils portent du « autorisé » en mode allowlist. La sémantique est résolue au
  **bord** (UI relabel + couche d'application). Alternative écartée pour la Phase 1 :
  renommer en `sites`/`processes`/`networkApps` (plus propre mais migration + churn sur
  de nombreux fichiers).

## 5. Application côté service (apps)

### 5.1 Scope « fenêtres visibles »
Tuer *tout* processus non autorisé déstabiliserait Windows (`tasklist` liste aussi des
centaines de processus d'arrière-plan absents de la safe-list). Le mode focus ne doit
fermer que les **apps que l'utilisateur voit/utilise**.

- Nouveau : `listWindowedProcesses(): Promise<Process[]>` — n'énumère que les processus
  possédant une fenêtre principale (PowerShell : `Get-Process | Where-Object
  { $_.MainWindowHandle -ne 0 }`, sortie UTF-8). Voisin de l'`enumerator` actuel.

### 5.2 Tueur inversé
Nouveau mode dans `src/service/blocking/processes/killer.ts` (ou variante dédiée) :
à chaque tick, lister les processus fenêtrés et tuer ceux dont le nom d'exe **n'est pas**
dans l'ensemble autorisé **et n'est pas** safe-listé.

- Ensemble autorisé = `blockedProcesses` (réinterprétés) ∪ basenames de
  `blockedNetworkApps`.
- Réutilise `isSafeListed`.

### 5.3 Safe-list durcie
Comme on tue désormais largement, la `SYSTEM_SAFE_LIST` doit au minimum couvrir, en plus
de l'existant : le shell (déjà `explorer.exe`), les exes Vethos (UI + service /
`electron`), et idéalement les antivirus courants. Ajouts à valider à
l'implémentation ; ne jamais permettre que le mode focus ferme le shell, Vethos, ou la
sécurité.

### 5.4 Câblage
- `ProcessAdapter` (interface dans `session/manager.ts`) devient conscient du mode :
  `start({ mode: 'blocklist' | 'allowlist'; names: string[] })` (ou méthode dédiée).
- `createProcessControl` (`blocking-adapters.ts`) : en mode `allowlist`, **court-circuite
  AppLocker** et route directement vers le tueur fenêtré inversé.
- `manager.ts` (`startSession` + `hydrateFromDisk`) lit `profile.mode` et passe le mode
  + les bonnes listes. En `allowlist`, **ne pas** appliquer le bloc hosts ni les règles
  pare-feu de blocage (les sites ne sont pas filtrés en Phase 1, et on ne bloque pas le
  réseau « par défaut »).

## 6. Validation & sécurité

- Démarrage refusé si `mode === 'allowlist'` et ensemble autorisé d'apps vide.
- Scope fenêtres visibles (§5.1) = garde-fou principal contre le kill de processus système.
- Safe-list durcie (§5.3).
- Le service tourne en SYSTEM/élevé : le kill reste possible, d'où l'importance des
  garde-fous ci-dessus.

## 7. UI

`src/renderer/src/components/blocking/ProfileEditor.tsx` :
- Interrupteur de mode en tête de panneau.
- Libellés dynamiques selon `mode` (§3).
- Note Phase 2 sur le champ sites en mode liste blanche.
- Validation visuelle : si liste blanche + aucune app autorisée, bouton de sauvegarde/
  démarrage averti.

`ActiveSessionCard.tsx` (et éventuellement `BlockingPage.tsx`) : afficher le mode focus
de la session active.

## 8. Tests

- **schemas** : `mode` défaut `blocklist` ; parsing d'un profil `allowlist`.
- **killer inversé** : tue un processus fenêtré non autorisé ; épargne un autorisé ;
  épargne un safe-listé ; n'agit pas sur les processus sans fenêtre.
- **enumerator fenêtré** : parsing de la sortie PowerShell.
- **manager** : en `allowlist`, n'applique pas hosts/firewall, démarre le tueur inversé ;
  refuse le démarrage si aucune app autorisée ; `hydrateFromDisk` respecte le mode.
- **ProfileEditor** : bascule des libellés, garde-fou liste vide.

## 9. Risques connus

- Une app non autorisée encore ouverte est **fermée** → risque de perte de travail non
  sauvegardé. Acceptable (l'utilisateur opte pour le focus), à signaler dans l'UI.
- Kill par **nom d'exe** uniquement (`tasklist`/PowerShell ne donnent pas de chemin
  fiable ici) : pas de distinction par chemin. Suffisant en Phase 1.
- DoH (Phase 2) : non pertinent en Phase 1 (sites non filtrés).

## 10. Décisions ouvertes (corrigeables)

- Faut-il, en plus de fermer les apps non autorisées, **empêcher leur réseau** pour les
  apps safe-listées qu'on ne peut pas tuer ? → proposé : non en Phase 1.
- Antivirus à ajouter à la safe-list : liste précise à figer à l'implémentation.
