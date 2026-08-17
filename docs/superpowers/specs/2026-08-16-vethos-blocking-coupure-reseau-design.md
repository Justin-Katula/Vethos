# Vethos — Coupure réseau des applications bloquées

**Auteur :** Obed (avec Claude)
**Date :** 2026-08-16
**Statut :** Design en attente de validation
**Périmètre :** Extension du Point 1 (`2026-07-28-vethos-blocking-design.md`) — ajoute une coupure réseau par application bloquée, sans toucher à l'overlay, à la barre des tâches, au son, ni au bouton Fermer.

---

## 0. Note de contexte — ce document part du code réel, pas de la spec d'origine

Le Point 1 (2026-07-28) prescrivait un sidecar **C++** compilé (`native/vethos-probe/`, CMake, protocole JSONL). En pratique, Smart App Control a refusé ce binaire natif non signé sur la machine cible (voir le plan B, section « Contexte d'exécution »). Le code réellement livré (`src/main/tracking/process-window-probe.ts`) est différent : un processus **PowerShell persistant** qui compile un pont Win32 en **C# via `Add-Type`, en mémoire** — aucun exécutable sur le disque, donc rien que Smart App Control puisse refuser. Le protocole n'est pas non plus du JSONL : ce sont des lignes texte à séparateur `|` (confirmé par `CLOSE|token|windowId` et `MINIMIZE|token|windowId` dans `process-window-probe.ts`).

Ce document construit sur l'architecture **réellement livrée** (PowerShell + `Add-Type`, protocole `|`), pas sur le C++ de la spec d'origine. Toute référence au « sidecar » ci-dessous désigne ce processus PowerShell.

---

## 1. Objectif

Pendant qu'une application est à l'état `blocked` ou `minimized` (jamais `unlocked`), elle ne peut établir **aucune connexion réseau sortante**. La coupure est automatique, silencieuse, et strictement dérivée du même état que l'overlay, la barre des tâches et le son — elle se lève et se recoupe exactement comme eux, sans logique séparée.

Motivation (reformulée à partir de la discussion) : une application dont le réseau est coupé se comporte, de son propre point de vue, comme si elle avait perdu la connexion — un cas que toute application gère déjà, sans perte de données. C'est structurellement plus sûr qu'un `Process.Kill()`, et ça ne demande aucune action de l'utilisateur.

## 2. Philosophie et non-objectifs

Même philosophie que le Point 1 : friction et coût, pas impossibilité technique. Un utilisateur qui ouvre le Pare-feu Windows Defender et supprime la règle à la main peut le faire — ce n'est pas empêché, et ce n'est pas le but (cf. §7.3 du Point 1 sur l'UIPI : « signalé, jamais échoué en silence »).

Non-objectifs explicites :

- Ne remplace pas le bouton Fermer ni sa logique de fermeture (`WM_CLOSE`, avertissement de travail non sauvegardé). Ce sujet reste un correctif séparé, indépendant de ce document.
- Ne distingue pas les applications « réseau » des applications « locales » — la coupure s'applique **uniformément** à toute application bloquée, décision confirmée par l'utilisateur.
- Ne fait ni inspection ni redirection de trafic — uniquement bloquer ou autoriser, tout ou rien, par programme.
- N'ajoute aucun binaire compilé, aucun driver tiers, aucune dépendance npm.
- Ne bloque pas le trafic entrant (voir §3.4).

## 3. Décisions structurantes

### 3.1 Mécanisme : règle de pare-feu Windows par programme, via COM, depuis le sidecar existant

`INetFwPolicy2` / `INetFwRule2` (`HNetCfg.FwPolicy2`, la même API que celle derrière « Pare-feu Windows Defender avec fonctions avancées ») pilotée depuis le C# déjà chargé en mémoire par le sidecar. Une règle sortante (`Direction = NET_FW_RULE_DIR_OUT`, `Action = NET_FW_ACTION_BLOCK`) scopée sur le chemin complet de l'exécutable (`ApplicationName`).

Deux mécanismes écartés, avec leurs raisons :

| Écarté | Raison |
|---|---|
| Driver tiers (WinDivert ou équivalent) | Inspection/redirection de paquets — bien plus que ce qui est demandé (tout ou rien). Ajoute un driver signé par un tiers à faire confiance, alors que l'API pare-feu native suffit et n'ajoute rien au disque. |
| Hook/injection dans le processus cible | Contraire au principe déjà posé par le Point 1 de ne jamais toucher l'intérieur d'un processus cible (rien d'équivalent à `SetParent`, aucune modification de mémoire tierce). L'injection de code est aussi le type de comportement qui déclenche les antivirus — précisément ce que l'architecture PowerShell/`Add-Type` en mémoire cherche déjà à éviter. |

### 3.2 Résolution du chemin : depuis le PID, au moment du blocage — pas depuis l'énumération

`listProcesses()` (`src/main/tracking/enumerator.ts`) — utilisé par le scanner de `enforcer.ts` pour repérer une application bloquée avant même qu'elle ait ouvert une fenêtre — ne renvoie que `{ name, pid }` (`tasklist /FO CSV /NH`, sans chemin). Il ne fournit donc pas de quoi scoper une règle pare-feu.

Décision : `NETBLOCK` prend un `pid`, pas un `exePath`. Le sidecar résout lui-même le chemin complet via `QueryFullProcessImageNameW` au moment de l'appel — le processus est nécessairement encore vivant à cet instant, la résolution est donc fiable. Le chemin résolu est mémorisé côté sidecar (voir §3.3), pas recalculé à la levée du blocage — un `NETUNBLOCK` peut arriver après la mort du processus cible (fermeture pendant un déblocage, par exemple), où `QueryFullProcessImageNameW` échouerait.

Ce choix évite toute plomberie nouvelle côté TypeScript : `enforcer.ts` a déjà un `pid` partout où il en a besoin, il n'a jamais besoin de connaître ou de transporter un chemin.

### 3.3 Cycle de vie : jumeau de `mute`/`unmute`, pas une nouvelle famille

Le Point 1 a déjà résolu ce problème pour l'audio : `mute`/`unmute` sont scopés par `{ pid }`, une application peut avoir plusieurs fenêtres, et l'annulation (`release`/`release-all`) doit savoir combien de fois « redemander » avant de vraiment lever la mutation. `NETBLOCK`/`NETUNBLOCK` suivent exactement le même schéma :

- Clé : `{ pid }`, pas `{ hwnd }` — une règle pare-feu vise un programme, pas une fenêtre.
- Le sidecar tient le compte de références par chemin résolu (deux PID différents peuvent partager le même exécutable — deux fenêtres Chrome, par exemple) : la règle est ajoutée au passage de 0 à 1 référence, retirée au passage de 1 à 0.
- La mutation entre dans le même journal d'annulation en mémoire que taskbar/audio (Point 1, §5.2) et dans le même death-watch : mort du parent Electron ou EOF stdin rejoue l'annulation, y compris le retrait des règles pare-feu ajoutées.
- `release`/`release-all` (déjà dans le protocole) couvrent aussi cette mutation — aucune nouvelle commande de nettoyage à ajouter.

Conséquence directe : un crash de Vethos ne laisse **jamais** une application définitivement coupée du réseau, pour la même raison qu'il ne laisse jamais une fenêtre invisible. C'est une extension de la garantie §5 du Point 1, pas un nouveau mécanisme de récupération.

**Filet de sécurité au démarrage.** En plus du rejeu du journal, le sidecar balaie et supprime, avant toute chose, les règles nommées `Vethos-Net-Block-*` orphelines au moment où aucune session n'est active. Couvre le cas où les deux processus meurent d'un coup — coupure de courant — exactement le rôle déjà tenu par le journal disque du Point 1 (§5.3).

### 3.4 Sens du blocage : sortant uniquement

`Direction = NET_FW_RULE_DIR_OUT` exclusivement. Le trafic entrant n'est pas concerné : la distraction exige que l'application **atteigne** quelque chose (charger un flux, envoyer un message) ; bloquer l'entrant n'apporte rien pour cet objectif et risquerait de casser une IPC locale légitime de l'application (un helper interne qui attend une réponse, par exemple).

Note indépendante de ce choix : le pare-feu Windows ne filtre de toute façon jamais le trafic loopback (127.0.0.1), quelle que soit la règle — une IPC locale entre les propres processus d'une application n'est donc jamais affectée.

### 3.5 Nommage des règles

`Vethos-Net-Block-<12 premiers caractères hexadécimaux du SHA-1 du chemin complet, normalisé en minuscules>` comme `DisplayName` — déterministe (le même exécutable produit toujours le même nom, donc idempotent si `NETBLOCK` est appelé deux fois), sans dépendre de caractères spéciaux du chemin complet que l'API de nommage pourrait rejeter, et préfixé pour rester repérable si l'utilisateur ouvre lui-même le Pare-feu Windows Defender (cohérent avec « signalé, jamais caché » du Point 1).

## 4. Ce qui NE change PAS

- `unlock.ts`, `deepseek.ts` : aucune modification. `grantUnlock`/`isUnlocked`/`pruneExpired` pilotent déjà le passage `blocked ↔ unlocked` ; la politique réseau se contente de lire ce même état.
- La forme d'`AppState` (`session.ts`) : pas de nouvelle variante. Le réseau est une fonction pure de l'état existant, exactement comme `needsSaveWarning` l'est de `preexisting`.
- L'overlay, le masquage de barre des tâches, le son : aucune modification, aucun couplage — la coupure réseau est un effet de plus dérivé du même état, pas une dépendance des effets existants.
- Le bouton Fermer : aucune modification.

## 5. Nouvelle logique pure

Dans `src/main/blocking/session.ts` :

```ts
/** Le reseau doit-il etre coupe pour une application dans cet etat ?
 * Coupe tant que l'application n'est pas explicitement debloquee — y compris minimisee,
 * pour la meme raison que le son reste coupe pendant la minimisation (Point 1, §7.6). */
export function needsNetworkBlock(state: AppState): boolean {
  return state.kind !== 'unlocked'
}
```

Tests (`session.test.ts`) :

- `{ kind: 'blocked' }` → `true`
- `{ kind: 'minimized' }` → `true`
- `{ kind: 'unlocked', until: ... }` → `false`

## 6. Protocole sidecar (extension)

Suit la convention confirmée du code actuel — lignes texte, séparateur `|`, réponse `CONTROL|token|<0 ou 1>` (même forme que `CLOSE`/`MINIMIZE`).

| Commande | Charge utile | Réponse |
|---|---|---|
| `NETBLOCK` | `token, pid` | `CONTROL\|token\|1` — règle ajoutée ou déjà active pour ce chemin. `CONTROL\|token\|0` — résolution du chemin ou appel COM échoué. |
| `NETUNBLOCK` | `token, pid` | `CONTROL\|token\|1` — dernière référence levée, règle retirée (ou plus aucune référence à retirer). `CONTROL\|token\|0` — échec COM. |

Les deux sont idempotentes : appeler `NETBLOCK` deux fois pour le même chemin résolu ne crée pas deux règles ; appeler `NETUNBLOCK` sans blocage actif renvoie `1` sans effet.

## 7. Câblage côté contrôleur (`enforcer.ts`)

- `bloquer(pid, exeName)` — déjà le point où une application bloquée est reconnue, avant même qu'une fenêtre existe — envoie `NETBLOCK` immédiatement, sans attendre `watchProcessWindows`. La coupure réseau ne doit pas dépendre de l'apparition d'une fenêtre, contrairement à l'overlay.
- `libererUn(suivi)` — déjà appelé sur **chaque** chemin de sortie (disparition du processus, retrait de la liste, arrêt de session) — envoie `NETUNBLOCK`, au même endroit que `restoreBlockedAppResources`.
- Le déblocage par justification (flux existant `deepseek.ts`/`unlock.ts`) fait transiter l'état vers `unlocked` : le prochain passage de `deriveAppState` change la réponse de `needsNetworkBlock`, et le contrôleur envoie `NETUNBLOCK` — même mécanique que la restauration de la barre des tâches et du son aujourd'hui.
- À l'expiration du déblocage (`isUnlocked` redevient `false`), le contrôleur envoie `NETBLOCK` à nouveau — reblocage automatique, sans action de l'utilisateur, symétrique à la logique déjà en place.

## 8. Tests

### 8.1 Logique pure — vitest

Ajout à `session.test.ts` uniquement (§5). Aucun autre module pur n'est touché.

### 8.2 Preuves réelles

Vérifie l'état réel plutôt qu'une description, dans le même esprit que le reste du Point 1 — sans tentative de connexion réseau réelle (non déterministe, lente) : on interroge l'état de la règle elle-même.

- Après `NETBLOCK` sur un PID de test, `Get-NetFirewallRule -DisplayName 'Vethos-Net-Block-*'` confirme une règle `Enabled=True, Direction=Outbound, Action=Block` dont `Get-NetFirewallApplicationFilter` référence le chemin résolu attendu.
- Deux `NETBLOCK` sur deux PID du même exécutable, puis un seul `NETUNBLOCK` : la règle reste active. Le second `NETUNBLOCK` la retire.
- Mort brutale du sidecar (ou du parent Electron) avec un blocage réseau actif, puis vérification que la règle est retirée par le death-watch.
- Redémarrage à froid (aucune session) avec une règle `Vethos-Net-Block-*` orpheline laissée par un crash antérieur : confirmée supprimée par le filet de sécurité du §3.3.

Ces vérifications rejoignent la couverture déjà associée à `process-window-probe.ts` plutôt que d'introduire un nouveau script séparé.

## 9. Fichiers

### Modifiés

```
src/main/blocking/session.ts        + needsNetworkBlock
src/main/blocking/session.test.ts   + 3 cas
src/main/blocking/enforcer.ts       appels NETBLOCK/NETUNBLOCK sur bloquer()/libererUn()
src/main/tracking/process-window-probe.ts
                                     + commandes NETBLOCK/NETUNBLOCK, resolution QueryFullProcessImageNameW,
                                       COM INetFwPolicy2/INetFwRule2, entree dans le journal d'annulation
                                       et le death-watch, balayage des regles orphelines au demarrage
```

### Non touchés

`unlock.ts`, `deepseek.ts`, `schedule.ts`, `overlay-manager.ts`, `window-filter.ts`, `geometry.ts`, `BlockOverlay.tsx`, le bouton Fermer et sa logique de fermeture.

## 10. Critères d'acceptation

- Une application à l'état `blocked` ou `minimized` ne peut initier aucune connexion sortante — vérifié par une règle pare-feu active scopée sur son chemin exact.
- Le réseau se rétablit automatiquement pour une application débloquée par justification, pour exactement la durée d'`UNLOCK_MS` (jamais plus, jamais cumulé — hérité tel quel d'`unlock.ts`).
- Le réseau se recoupe automatiquement à l'expiration du déblocage, sans action de l'utilisateur.
- La minimisation ne lève jamais la coupure réseau.
- Plusieurs fenêtres/instances du même exécutable ne lèvent la coupure que lorsque la dernière référence disparaît ou se débloque.
- Aucune règle pare-feu ne survit à la fin normale d'une session, ni à un crash de Vethos ou du sidecar (journal + death-watch + balayage au démarrage).
- Aucun nouveau binaire compilé, aucun nouveau driver, aucune dépendance npm ajoutée — tout passe par le pont PowerShell/`Add-Type` déjà élevé et déjà en mémoire.
- `unlock.ts`, `deepseek.ts` et la forme d'`AppState` restent inchangés.
- Le bouton Fermer et sa logique de fermeture (`WM_CLOSE` vs `Process.Kill()`) restent hors du périmètre de ce document.

## 11. État de référence avant travaux

Mesuré le 2026-08-16 :

- `npx vitest run` → **518 tests, 37 fichiers, tous verts**.
- `npm run typecheck:node` → **vert**.
