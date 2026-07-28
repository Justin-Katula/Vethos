# Vethos — Point 1 : mécanisme de blocage des applications

**Auteur :** Obed (avec Claude)
**Date :** 2026-07-28
**Statut :** Design en attente de validation
**Périmètre :** Reconstruction complète et autonome. Aucune dépendance aux tâches,
objectifs, planification ou score de priorité.

---

## 1. Objectif

Pendant une session de blocage, une application listée comme bloquée peut se
lancer normalement — rien ne l'en empêche, elle n'est jamais tuée. Vethos réagit
en se plaçant par-dessus : l'utilisateur ne voit qu'une page de blocage, jamais
l'application réelle, tant que la session est active.

## 2. Philosophie et non-objectifs

Ce mécanisme ne cherche pas à rendre le contournement techniquement impossible.
Un verrou système réel (bloquer Ctrl+Alt+Suppr, désactiver durablement le
Gestionnaire des tâches) exige un driver noyau signé par Microsoft, avec un
risque de plantage système complet. **Hors de portée et hors périmètre,
volontairement.**

L'objectif est de rendre le contournement **plus coûteux et plus lent que la
tentation** : friction, délai, justification écrite.

Non-objectifs explicites :

- Ne jamais tuer un processus cible, sauf demande explicite via le bouton `✕` (1.7).
- Ne jamais bloquer Ctrl+Alt+Suppr ni désactiver le Gestionnaire des tâches.
- Aucun drapeau de contrôle désactivé indéfiniment sans plan d'activation.
- Aucune référence aux tâches, objectifs ou score de priorité.

---

## 3. Décisions structurantes

### 3.1 Sidecar en C++ (un seul pont natif)

Un unique exécutable natif, `vethos-probe.exe`, piloté depuis Node par
stdin/stdout en JSONL. Pas de PowerShell, pas de `Add-Type` en ligne, pas de
second pont natif pour une autre partie.

**C++ plutôt que C#**, vérifié par compilation réelle sur la machine cible :
MSVC 14.51.36231 (VS 2026) + Windows SDK 10.0.26100 compilent et lient
`windows.h` + `shobjidl.h` + `audiopolicy.h` + `mmdeviceapi.h` + `dwmapi.h`.
Binaire de 140 Ko, **zéro dépendance runtime**.

Motifs :

- L'ancien sidecar C# était `SelfContained=false` : il **exigeait le runtime
  .NET 10 installé** chez l'utilisateur. Le C++ n'exige rien.
- Tout ce dont le Point 1 a besoin est COM/Win32 natif (`ITaskbarList`,
  `IAudioSessionManager2`, `SetWinEventHook`, `DwmGetWindowAttribute`). En C#
  cela imposait du marshaling P/Invoke, au point que l'ancien code a dû ajouter
  **NAudio** en dépendance pour WASAPI.
- Pas de démarrage CLR ni de GC dans un processus qui surveille les fenêtres en
  continu.

Coût accepté : gestion manuelle des durées de vie COM, encadrée par des
enveloppes RAII.

### 3.2 Vethos tourne en permanence, fenêtre fermée ou non

Une application de blocage qui ne tourne pas ne bloque rien. Le blocage ne doit
jamais dépendre de la présence d'une fenêtre.

- **`✕` sur la fenêtre principale ne quitte pas** : la fenêtre est masquée vers
  la zone de notification, le processus continue.
- **Lancement automatique à l'ouverture de session Windows**, pour survivre au
  redémarrage.
- Toute la machinerie de blocage vit dans le processus principal. La fenêtre
  n'est qu'un afficheur.

**Le vrai service Windows est rejeté**, pour une raison technique décisive :
depuis Windows Vista, un service tourne en **session 0**, isolée du bureau
interactif. Un processus SYSTEM en session 0 ne peut pas énumérer, positionner
ni recouvrir les fenêtres du bureau utilisateur — il ne les voit pas. Le Point 1
est entièrement du fenêtrage de session utilisateur. Un service devrait de toute
façon lancer un helper dans la session interactive pour faire le travail réel.

Ce constat rejoint l'historique du projet : la spec P16 Phase 3
(`docs/superpowers/specs/2026-05-17-nexus-windows-service-phase3-design.md`)
qualifiait l'intégration node-windows ↔ binaire Electron de « point technique le
plus incertain du sous-projet — jamais éprouvé ». Le sous-projet a été abandonné.

### 3.3 Réconciliation déclarative, pas de reprise d'état

Vethos ne restaure pas une session sauvegardée. À chaque réveil il pose une seule
question — *« selon les règles, un blocage devrait-il être actif maintenant ? »* —
puis aligne la réalité sur la réponse.

La couture avec le futur moteur de planification est réduite à une interface :

```ts
type BlockingSchedule = {
  activeSessionAt(now: Date): { blockedApps: AppRef[]; endsAt: Date } | null
}
```

Aujourd'hui elle est alimentée par la page Blocage. Plus tard, le vrai moteur se
branche derrière sans toucher la machinerie de blocage.

### 3.4 Aucun mode fantôme

Chaque partie est branchée et testée réellement. Aucun calcul dans le vide
derrière un drapeau qui resterait désactivé.

---

## 4. Architecture

```
Renderer (React)              Main (Node)                       Sidecar (C++)
────────────────              ───────────                       ─────────────
/blocage        ◄── IPC ──►   blocking/controller.ts  ◄─JSONL─►  vethos-probe.exe
/block-overlay                blocking/session.ts       (pur)      énumération fenêtres
                              blocking/geometry.ts      (pur)      SetWinEventHook
                              blocking/window-filter.ts (pur)      ITaskbarList
                              blocking/unlock.ts        (pur)      WASAPI mute
                              blocking/journal.ts       (pur)      état fenêtre
                              blocking/schedule.ts      (pur)      fermeture fenêtre
                              blocking/overlay-manager.ts          death-watch → annulation
                              blocking/sidecar-bridge.ts
                              blocking/deepseek.ts
                              tray.ts
```

**Règle de séparation : le sidecar possède l'*annulation*, le contrôleur possède
la *politique*.** Le sidecar ne décide jamais rien — il exécute et sait défaire.

### 4.1 Protocole sidecar

JSONL, une commande ou un événement par ligne.

Commandes (main → sidecar) :

| Commande | Charge utile |
|---|---|
| `ping` | — |
| `watch` | `{ exeNames: string[] }` — liste surveillée |
| `snapshot` | — renvoie les fenêtres candidates courantes + heures de création des processus |
| `own-overlay` | `{ overlayHwnd, targetHwnd }` |
| `hide-taskbar` / `show-taskbar` | `{ hwnd }` |
| `mute` / `unmute` | `{ pid }` |
| `set-window-state` | `{ hwnd, state: 'minimize' \| 'maximize' \| 'restore' }` |
| `close-window` | `{ hwnd, graceMs }` |
| `release` | `{ hwnd }` — annule les mutations d'une fenêtre |
| `release-all` | — annule tout |
| `shutdown` | — **arrêt voulu** : annule tout, puis sort **sans relancer Vethos** (voir §5.2) |

Événements (sidecar → main) :

| Événement | Charge utile |
|---|---|
| `window-appeared` | `{ hwnd, pid, exeName, title, className, exStyle, cloaked, owned, bounds, showState, elevated, processCreatedAt }` |
| `window-changed` | `{ hwnd, bounds, showState }` |
| `window-gone` | `{ hwnd }` |
| `taskbar-reapplied` | `{ hwnd }` — le chien de garde a dû réappliquer |
| `audio-remuted` | `{ pid }` — le son avait été repris, remis en pause |
| `uipi-blocked` | `{ hwnd, pid, exeName }` |
| `released` | `{ hwnd, restored: string[] }` |

Le sidecar émet les **attributs bruts** ; c'est le TypeScript pur qui décide ce
qui est une cible valide. Cela rend la décision testable (voir §6, bug 4).

---

## 5. Garantie centrale : on ne perd jamais une fenêtre

C'est le cœur du design. L'échec est catastrophique — une application invisible
à vie — donc la garantie est **triple et redondante**.

### 5.1 Ne jamais faire `SW_HIDE` sur une fenêtre cible

Jamais, sous aucune condition. L'overlay la recouvre : c'est toute la
philosophie. La cacher est redondant *et* c'est la cause racine des bugs 1, 2 et 6.

Pour la minimisation (1.6), on utilise `SW_MINIMIZE` : un état Windows normal,
que l'utilisateur peut récupérer lui-même à l'Alt+Tab même si Vethos meurt.

### 5.2 Death-watch dans le sidecar

Le sidecar tient un journal d'annulation en mémoire, une entrée par HWND touché :

```
{ hwnd, pid, exeName, processCreatedAt,
  taskbarWasVisible, originalShowState, audioWasMuted }
```

Il attend simultanément sur le handle du processus Electron parent **et** sur EOF
de stdin. L'un ou l'autre déclenche, dans cet ordre :

1. rejouer l'annulation — toutes les fenêtres retrouvent leur état capturé ;
2. relancer Vethos, qui se réconcilie et rétablit le blocage.

Tuer Vethos depuis le Gestionnaire des tâches donne donc quelques secondes de
liberté, puis le blocage revient — friction, pas verrou. Et **aucune fenêtre
n'est jamais piégée**, même dans ce scénario.

**Mort voulue contre mort subie.** La relance ne doit se déclencher que sur une
mort *subie*. Un arrêt volontaire de Vethos — « Quitter Vethos » hors session,
redémarrage de Windows, mise à jour de l'application — envoie d'abord la commande
`shutdown` : le sidecar annule tout puis sort **sans relancer**. Le drapeau de
relance n'est armé que tant qu'une session est active et qu'aucun `shutdown`
n'a été reçu.

Sans cette distinction, quitter proprement l'application hors session la ferait
ressusciter en boucle.

### 5.3 Journal sur disque, rejoué au démarrage

Avant chaque mutation, le contrôleur écrit dans `blocking-journal.json` via
`src/shared/storage/atomic.ts` (existant). Au lancement suivant, s'il reste un
journal, Vethos restaure les fenêtres encore vivantes puis l'efface.

L'appariement se fait sur `(pid, processCreatedAt)` et non sur le seul PID : les
PID sont réutilisés par Windows, `processCreatedAt` empêche d'agir sur un
processus étranger.

Couvre le cas où **les deux** processus meurent d'un coup — coupure de courant,
arrêt de l'arborescence depuis le Gestionnaire des tâches.

---

## 6. Correspondance bug → cause racine → correctif

Les huit bugs de la première tentative, avec leur cause identifiée dans le code
de l'époque (récupérable à `git show d83994d`).

| # | Bug observé | Cause racine | Correctif |
|---|---|---|---|
| 1 | Applications piégées invisibles après fermeture brutale | `WindowProbe.cs:287` — `MinimizeWindowByHwnd` faisait `ShowWindowAsync(hWnd, SW_HIDE)`, sans aucune garantie de restauration | §5 en entier : jamais `SW_HIDE`, plus death-watch, plus journal disque |
| 2 | Pas de ré-apparition en fin de session ou après justification | La restauration filtrait les « fantômes » et perdait l'association `hwnd → meta` | Journal d'annulation par HWND ; on restaure l'état **capturé**, jamais un état supposé |
| 3 | Terminaux noirs parasites au premier plan | Sidecar console lancé de façon visible | Lancement avec `CREATE_NO_WINDOW` + `windowsHide: true`, jamais via un shell |
| 4 | Fenêtres et onglets multipliés dans la barre des tâches (`BlenderGLEW`, splash) | La restauration réinjectait une entrée de barre des tâches sur des fenêtres internes qui n'en avaient jamais eu | `window-filter.ts` : prédicat strict de fenêtre « alt-tab-able ». On ne touche que ces fenêtres, et on ne restaure que ce qu'on a effectivement modifié |
| 5 | Overlay positionné au coin `0,0` au ré-ancrage | Bounds DWM lues sur une fenêtre cachée ou minimisée : coordonnées périmées, typiquement `-32000` | `geometry.ts` : bounds invalides → overlay masqué, jamais placé à `0,0`. Ré-ancrage sur `LOCATIONCHANGE` réel |
| 6 | Cible qui disparaît et réapparaît en boucle à la minimisation | Le chien de garde et l'application se disputaient la visibilité (hide contre show) | Le chien de garde ne réapplique **que** le masquage de barre des tâches, jamais la visibilité. L'état de minimisation vient de la machine à états, pas d'un minuteur |
| 7 | Barre des tâches réaffichée au retour du blocage après justification | Le reblocage ne réappliquait pas le masquage | Le masquage est **dérivé** de l'état de session par fonction pure, donc réappliqué à chaque transition |
| 8 | 10 minutes d'attente à chaque test | — | `UNLOCK_MS = app.isPackaged ? 600_000 : 30_000` |

---

## 7. Les sept parties

### 7.1 Détection de lancement

Le sidecar surveille en continu via `SetWinEventHook`
(`EVENT_OBJECT_CREATE`, `EVENT_OBJECT_DESTROY`, `EVENT_OBJECT_LOCATIONCHANGE`,
`EVENT_SYSTEM_MINIMIZESTART/END`) — pas de sondage périodique.

Au démarrage de session, un `snapshot` couvre les applications **déjà lancées**.

**Donnée critique — préexistante ou nouvelle.** L'autorité est l'heure de
création du **processus** (`GetProcessTimes`), comparée à l'heure de début de
session :

```
preexisting = processCreatedAt < session.startedAt
```

Établie **au moment de la détection** et figée dans l'état de l'application
détectée. Jamais reconstituée après coup. Ce choix couvre le cas où
l'application tournait déjà mais n'a ouvert sa fenêtre qu'après le début de la
session — le snapshot seul se tromperait.

### 7.2 Fenêtre overlay attachée

Chaque cible reçoit un `BrowserWindow` sans cadre, `skipTaskbar: true`, rendu
**fenêtre possédée** de sa cible :

```
SetWindowLongPtr(overlayHwnd, GWLP_HWNDPARENT, targetHwnd)
```

Windows maintient alors nativement l'overlay au-dessus de son propriétaire.
Aucune tentative de tromper Windows : c'est l'usage normal de son mécanisme de
fenêtrage.

Deux contraintes absolues :

- **Ownership, jamais `SetParent`.** `SetParent` inter-processus attache les
  files d'entrée des deux threads et peut faire geler les deux applications.
  L'ownership n'a pas ce défaut.
- **Jamais `alwaysOnTop`.** C'est précisément ce qui crée la bataille de premier
  plan que la spec interdit.

Comme chaque overlay est possédé par *sa* cible, aucune paire n'entre en
compétition pour le premier plan global. `overlay-manager.ts` est le gestionnaire
central unique : il crée, détruit et arbitre le focus entre paires, mais ne
touche jamais au z-order — Windows s'en charge.

Position et taille dérivées de `DWMWA_EXTENDED_FRAME_BOUNDS`, mises à jour sur
`LOCATIONCHANGE` limité à un rafraîchissement par trame.

### 7.3 Masquage total de la barre des tâches

**Overlay** — `skipTaskbar: true` plus `WS_EX_TOOLWINDOW`, réglé à la création.

**Cible** — fragile par nature, traité comme une surveillance continue :

- Masquage par `ITaskbarList::DeleteTab`, l'API officielle du shell.
- Un chien de garde réapplique le masquage lorsqu'une application recrée ou
  modifie ses fenêtres — nouvelle fenêtre, plein écran, popup. Toutes les
  fenêtres d'un processus surveillé sont couvertes, pas seulement la principale.
- Le chien de garde ne touche **que** la barre des tâches. Jamais la visibilité
  (bug 6).

**UIPI.** Si la cible tourne avec des privilèges plus élevés que Vethos, Windows
interdit par conception la modification de ses fenêtres — c'est une frontière de
sécurité, pas un défaut à contourner. Détection par comparaison des niveaux
d'élévation des jetons ; le sidecar émet `uipi-blocked` et l'interface l'affiche
franchement : « Vethos ne peut pas masquer cette application — elle tourne en
administrateur. » Signalé, jamais échoué en silence, jamais de plantage.

### 7.4 Contrôle audio

Dès détection, coupure du son du processus via WASAPI
(`IAudioSessionManager2` → `ISimpleAudioVolume::SetMute`), sur **toutes** les
sessions audio du PID. Jamais par simulation de touche clavier.

Résistance au contournement : le sidecar réévalue périodiquement l'état de mute
des sessions du PID et le réapplique s'il a été levé, en émettant `audio-remuted`
à chaque fois — ce qui fournit la preuve exigée au §9.

### 7.5 Justification et IA

Champ texte pour justifier le déblocage d'une application précise.

**Infrastructure IA réutilisée.** Elle n'existe plus dans `HEAD` : elle a été
supprimée avec le reste du blocage au commit `33c5d0c`. Ce qui subsiste
aujourd'hui :

- `DEEPSEEK_API_KEY` dans `.env` — seule clé d'API IA du dépôt ;
- le client `src/main/blocking/deepseek.ts`, récupérable à
  `git show d83994d:src/main/blocking/deepseek.ts` (203 lignes).

Ce client est **restauré tel quel**, avec ses tests. Il n'est pas réécrit. Il
appelle DeepSeek via le `fetch` natif de Node (aucune dépendance npm ajoutée),
demande un verdict JSON `{ valid, reason }`, et **refuse par défaut** en cas
d'erreur réseau, de clé absente ou de réponse illisible — on ne débloque jamais
par accident.

**Déblocage.** Si la justification est jugée valable, l'application concernée —
et elle seule — est débloquée pour exactement `UNLOCK_MS` :

```ts
const UNLOCK_MS = app.isPackaged ? 600_000 : 30_000  // 10 min | 30 s en dev
```

L'échéance est absolue et **toujours recalculée depuis l'instant présent** :
`until = now + UNLOCK_MS`. Jamais `untilPrécédent + UNLOCK_MS`. Un déblocage ne
se cumule ni ne se prolonge.

À l'expiration, reblocage automatique. Une nouvelle justification est jugée sans
mémoire de la précédente : on soumet à nouveau, on ne prolonge pas.

Pendant le déblocage : overlay détruit, barre des tâches restaurée, son rétabli.
Ces trois effets sont dérivés de l'état par fonction pure, donc leur inverse est
automatique au reblocage (bug 7).

### 7.6 Minimiser (`–`)

L'overlay disparaît de l'écran et son entrée apparaît dans une **liste interne à
Vethos** — jamais dans la barre des tâches Windows.

La cible reçoit `SW_MINIMIZE` (jamais `SW_HIDE`). Comme l'overlay est une fenêtre
possédée, Windows le masque automatiquement avec son propriétaire — le
comportement est natif, pas simulé.

L'application reste masquée et en pause pendant toute la minimisation :
le masquage de barre des tâches et la coupure du son restent actifs.

### 7.7 Maximiser (`▢`) et Fermer (`✕`)

Les trois contrôles de l'overlay agissent sur **la paire**, jamais sur l'overlay
seul. La géométrie de l'overlay étant toujours dérivée de la cible, il suffit
d'agir sur la cible et de laisser le ré-ancrage suivre.

**Maximiser** — `SW_MAXIMIZE` sur la cible ; `LOCATIONCHANGE` se déclenche ;
l'overlay se ré-ancre sur les nouvelles bounds. Le bouton bascule en
« restaurer » (`SW_RESTORE`) quand la cible est maximisée.

Conséquence voulue : si l'utilisateur maximise la cible autrement — double-clic
sur la barre de titre, `Win+↑`, ancrage latéral — l'overlay suit par le même
chemin de code. L'illusion d'une seule application tient dans tous les cas.

**Fermer** — avertissement de travail non sauvegardé **uniquement si
`preexisting === true`** (donnée établie en 7.1). Si l'application a été lancée
pendant la session, l'utilisateur n'a jamais pu s'en servir : fermeture directe,
sans avertissement.

C'est Vethos qui affiche cet avertissement, puisque l'utilisateur ne voit jamais
la vraie fenêtre et donc jamais le propre avertissement de l'application.

Après confirmation — ou directement si aucun avertissement n'est nécessaire —
les deux disparaissent ensemble, dans cet ordre précis :

1. rompre l'ownership (`GWLP_HWNDPARENT` remis à `NULL`) ;
2. annuler les mutations de la cible — barre des tâches et son restaurés ;
3. détruire l'overlay ;
4. `WM_CLOSE` sur la cible.

L'ordre importe : l'overlay étant une fenêtre possédée, Windows le détruirait
lui-même à la destruction du propriétaire. Le détruire d'abord évite la course
entre notre démontage et celui de Windows.

`WM_CLOSE` est une demande de fermeture propre, pas un `TerminateProcess` :
l'application n'est jamais tuée de force. Si elle refuse de se fermer — boîte de
dialogue « enregistrer les modifications ? » de sa part — on n'insiste pas :
l'overlay reste détruit et la fenêtre redevient normale. Vethos ne force jamais.

---

## 8. Persistance et réveil

### 8.1 Zone de notification

- `✕` sur la fenêtre principale : `event.preventDefault()` puis masquage.
  `window-all-closed` (aujourd'hui `src/main/index.ts:132` → `app.quit()`) ne
  quitte plus.
- Menu de la zone de notification : « Ouvrir Vethos », séparateur,
  « Quitter Vethos ».
- **« Quitter Vethos » est refusé pendant une session active**, avec un message
  clair. Hors session, il quitte normalement.
- Le vidage des écritures différées existant (`before-quit`,
  `src/main/index.ts:147`) est conservé et adapté au cas où aucune fenêtre
  n'existe.

### 8.2 Lancement au démarrage

`app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })`. Au
démarrage de session, Vethos se lance sans fenêtre, directement dans la zone de
notification, et se réconcilie immédiatement.

Le verrou d'instance unique existe déjà (`src/main/index.ts:136`) et est conservé.

### 8.3 Horloge de réconciliation

Une boucle dans le processus principal évalue `activeSessionAt(now)` toutes les
5 secondes, et **immédiatement** sur :

- `powerMonitor.on('resume')` — sortie de veille ;
- `powerMonitor.on('unlock-screen')` — déverrouillage de session ;
- démarrage de l'application.

Ces réveils sont indispensables : une machine en veille pendant le créneau doit
bloquer dès son réveil, sans attendre le tick suivant.

### 8.4 Règles de déclenchement

Deux sources, fusionnées par la même fonction pure `activeSessionAt` :

- **Créneaux récurrents** — `{ id, label, daysOfWeek, startMinute, endMinute, appIds }`.
  Se déclenchent seuls, application fermée : c'est le comportement « alarme ».
- **Démarrage manuel** — `{ startedAt, endsAt, appIds }`, un coup unique, pour
  tester sans attendre l'heure.

Il n'y a **pas de bouton Arrêter** : une session se termine à son échéance. La
justification IA (7.5) est le seul échappatoire, application par application.

**Les règles ne peuvent pas raccourcir une session en cours.** Supprimer un
créneau, en modifier les horaires ou retirer une application de la liste pendant
qu'une session tourne n'a aucun effet avant la fin de cette session — sinon
éditer les règles deviendrait un bouton Arrêter déguisé. Les modifications sont
enregistrées et prennent effet à la session suivante ; l'interface le dit
explicitement.

---

## 9. Tests

### 9.1 Logique pure — vitest

Chaque module pur a son fichier de test.

| Module | Ce qui est couvert |
|---|---|
| `session.ts` | machine à états : préexistante contre nouvelle ; transitions bloqué → débloqué → reblocké ; état minimisé |
| `schedule.ts` | `activeSessionAt` : créneaux récurrents, jours de semaine, chevauchement avec un démarrage manuel, franchissement de minuit |
| `window-filter.ts` | prédicat alt-tab-able : rejet de `WS_EX_TOOLWINDOW`, des fenêtres possédées, des fenêtres masquées DWM, des titres vides, des classes assistantes (bug 4) |
| `geometry.ts` | bounds `-32000` → masqué ; largeur ou hauteur nulle → masqué ; minimisé → masqué ; bounds valides → placé (bug 5) |
| `unlock.ts` | durée exacte 10 min ; 30 s en dev ; expiration ; absence de cumul et de prolongation |
| `journal.ts` | encodage, décodage, plan de rejeu, rejet sur `processCreatedAt` divergent |
| `deepseek.ts` | verdict valable, non valable, réponse illisible, clé absente, délai dépassé — tous refusent sauf le verdict valable explicite |

### 9.2 Preuves réelles

La spec exige des preuves réelles, pas des descriptions.
`scripts/blocking-smoke.mjs` pilote le sidecar directement et produit un journal
horodaté couvrant :

- deux overlays simultanés, chacun ancré sur sa cible, sans bataille de premier
  plan observée dans les événements de z-order ;
- fermeture d'un overlay parmi plusieurs, les autres restant stables ;
- son coupé à la détection, puis plusieurs tentatives de reprise forcée, chacune
  suivie d'un `audio-remuted` ;
- masquage de barre des tâches toujours actif après ouverture d'une fenêtre
  secondaire par la cible ;
- un cas préexistant et un cas nouveau, avec les heures de création de processus
  et l'heure de début de session ;
- mort brutale du parent pendant une session, puis vérification que toutes les
  fenêtres sont restaurées **et** que Vethos est relancé ;
- arrêt volontaire par `shutdown`, puis vérification que les fenêtres sont
  restaurées **et que Vethos n'est pas relancé** — la distinction du §5.2.

---

## 10. Fichiers

### Créés

```
native/vethos-probe/
  CMakeLists.txt
  src/main.cpp            boucle JSONL, dispatch, death-watch
  src/protocol.{h,cpp}    encodage et décodage JSONL
  src/windows_probe.{h,cpp}  énumération, attributs, bounds DWM, ownership, show-state
  src/taskbar.{h,cpp}     ITaskbarList DeleteTab/AddTab + chien de garde
  src/audio.{h,cpp}       WASAPI mute par PID + remise en pause
  src/watcher.{h,cpp}     SetWinEventHook
  src/undo_log.{h,cpp}    journal d'annulation et rejeu
  src/elevation.{h,cpp}   détection UIPI
scripts/build-sidecar.mjs

src/main/blocking/
  controller.ts           boucle de réconciliation
  session.ts        (pur) machine à états
  schedule.ts       (pur) activeSessionAt
  window-filter.ts  (pur) prédicat de fenêtre cible
  geometry.ts       (pur) placement de l'overlay
  unlock.ts         (pur) déblocages temporaires
  journal.ts        (pur) journal de restauration
  overlay-manager.ts      cycle de vie des overlays
  sidecar-bridge.ts       spawn, JSONL, reconnexion
  deepseek.ts             restauré de d83994d
  handlers.ts             IPC
  *.test.ts               un par module pur

src/main/tray.ts          zone de notification, close-to-tray, lancement au démarrage
src/renderer/src/pages/BlockingPage.tsx
src/renderer/src/pages/BlockOverlay.tsx
src/renderer/src/store/blocking.store.ts
```

### Modifiés

```
src/main/index.ts         close-to-tray, réveils powerMonitor, rejeu du journal au boot
src/shared/ipc-channels.ts  canaux BLOCKING_*
src/shared/schemas.ts     schémas de session, créneaux, journal + STORAGE_KEYS
src/preload/index.ts      espace de noms blocking
src/renderer/src/App.tsx  routes /blocage et /block-overlay
src/renderer/src/components/Sidebar.tsx  entrée Blocage
package.json              script de compilation du sidecar
electron-builder.yml      embarquement de resources/sidecar/
```

### Réutilisé sans modification

- `src/shared/storage/atomic.ts` — écriture atomique du journal.
- `src/main/tracking/app-discovery.ts` — sélecteur d'applications de la page Blocage.
- `src/main/logging/setup.ts` — journalisation.

---

## 11. Ordre de livraison

Conforme à la spec, un commit par étape :

1. **Socle** — sidecar C++ minimal (`ping`, `snapshot`, JSONL, death-watch),
   script de compilation, pont Node, journal disque.
2. **7.1** détection, préexistante contre nouvelle.
3. **7.2** overlay attaché, gestionnaire multi-overlay.
4. **7.3** masquage de barre des tâches, overlay puis cible, cas UIPI.
5. **7.4** audio.
6. **7.6** minimiser.
7. **7.7** maximiser et fermer.
8. **§8** zone de notification, lancement au démarrage, horloge de réconciliation.
9. **7.5** justification IA, en dernier.

L'interface (page Blocage, overlay) est construite au fur et à mesure, jamais en
mode fantôme.

---

## 12. Critères d'acceptation

- Une application bloquée peut toujours se lancer — jamais empêchée, jamais tuée
  de force en dehors du bouton `✕`.
- Aucune application bloquée ni overlay n'apparaît jamais dans la barre des tâches.
- Plusieurs overlays simultanés ne se battent jamais pour le premier plan.
- Le son reste coupé après tentative de contournement, vérifié sur plusieurs
  tentatives successives.
- Un déblocage par justification ne dépasse jamais 10 minutes — 30 secondes en
  dev — et ne se renouvelle jamais automatiquement.
- `✕` n'affiche l'avertissement que si l'application était réellement
  préexistante à la session.
- Fermer la fenêtre principale ne quitte pas Vethos ; le blocage continue.
- Vethos se relance à l'ouverture de session Windows.
- Aucune fenêtre n'est jamais laissée invisible, quel que soit le mode d'arrêt de
  Vethos.
- Aucun drapeau de contrôle réel activé par défaut sans test associé.
- Rien dans ce point ne référence tâches, objectifs ou score de priorité.

---

## 13. État de référence avant travaux

Mesuré le 2026-07-28 :

- `npx vitest run` → **206 tests, 20 fichiers, tous verts**.
- `npm run typecheck:node` → **vert**.
- `npm run typecheck:web` → **rouge avant intervention**, sur trois fichiers non
  suivis par git et étrangers au Point 1 : `src/renderer/src/store/ancres.store.ts`
  et `src/renderer/src/store/learning.store.ts` importent `./scoped-storage`, qui
  n'existe pas. Ces fichiers ne sont pas touchés par ce travail.
