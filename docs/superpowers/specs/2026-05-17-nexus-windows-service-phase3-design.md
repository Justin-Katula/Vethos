# Nexus — P16 Phase 3 : vrai service Windows

**Auteur :** Obed (avec Claude)
**Date :** 2026-05-17
**Statut :** Design validé (plan d'attaque). Prêt pour la planification du Lot 1.
**Réf. :** Spec maître `docs/superpowers/specs/2026-05-15-nexus-windows-service-design.md` — §5, §7, §9, §11 Phase 3.

---

## 1. Objectif

À la fin de la Phase 2, le blocage tourne dans un service séparé, lancé par l'UI
en **process détaché** (`src/main/service-launcher.ts`). Cela survit au kill de
l'UI, mais **pas au reboot** de la machine, et l'UI doit encore tourner en
administrateur (`requestedExecutionLevel: requireAdministrator`).

La Phase 3 fait de Nexus un **vrai service Windows** :

1. Le service est installé comme service Windows : démarrage automatique **au
   boot**, en compte **SYSTEM**, **auto-restart** en cas de crash — il survit au
   reboot.
2. L'UI tourne en **utilisateur normal** (retrait de `requireAdministrator`).
3. L'installation / réparation du service se fait par une **élévation ponctuelle
   `sudo-prompt`** (UAC une seule fois).
4. Si le service est absent / arrêté / injoignable, l'UI le **détecte**, propose
   de le **réparer**, et — en cas d'échec — affiche un bandeau honnête et
   désactive le démarrage de session.

## 2. Risque central & approche : spike d'abord

Le mécanisme retenu par la spec maître est **node-windows**. Or :

- `node-windows` n'est **pas** une dépendance du projet (la spec maître le
  supposait à tort — seul `sudo-prompt` est présent).
- node-windows lance par défaut le script de service via `node`. Le service Nexus
  doit tourner sur le **binaire Electron en mode Node** (`ELECTRON_RUN_AS_NODE`).
  Cette intégration node-windows ↔ binaire Electron est, selon la spec §9, **le
  point technique le plus incertain** du sous-projet — jamais éprouvé.

La Phase 3 commence donc par un **spike** (Lot 1) qui dé-risque ce point **avant**
tout engagement sur le design détaillé des lots suivants.

## 3. Découpage en lots

### Lot 1 — Spike node-windows (seul lot au contenu certain)

Objectif : prouver ou réfuter que node-windows peut installer Nexus en vrai
service Windows tournant sur le binaire Electron en mode Node.

- Ajouter `node-windows` aux dépendances.
- Point d'entrée `Nexus.exe --install-service` / `--uninstall-service`, détecté
  **tout au début** de `src/main/index.ts` (avant `app.whenReady` / l'ouverture
  de la fenêtre) : exécute la routine node-windows `Service.install()` /
  `uninstall()` puis quitte le process.
- Service installé : `NexusBlockingService`, configuré pour exécuter le bundle
  `out/service/index.js` via le binaire Electron en mode Node, auto-restart activé.
- **Vérification — manuelle** (`NEXUS_INTEG`, inhérent à un service Windows) :
  installation OK ; le service démarre ; **redémarre au boot** ; tourne en compte
  **SYSTEM** ; le named pipe répond et une session bloque réellement ;
  l'auto-restart node-windows relance le service après un kill du process.
- **Critère de réussite** : le service survit à un reboot et bloque en SYSTEM.
- **Si le spike échoue** : on s'arrête et on réévalue le runtime — Node SEA
  (`.exe` autonome) ou pilotage direct de winsw / `sc.exe` — **avant** de
  planifier les lots suivants.

### Lot 2 — Installation & réparation (provisoire, conditionné au spike)

- `src/main/elevated-install.ts` : relance `Nexus.exe --install-service` via
  `sudo-prompt` (élévation UAC ponctuelle).
- Le `src/main/service-launcher.ts` du Lot 4b (spawn en process détaché) est
  **remplacé** : en Phase 3 le service est un vrai service Windows, plus un
  process détaché lancé par l'UI. `ensureServiceRunning()` quitte le chemin de
  démarrage de l'UI.

### Lot 3 — Détection & bandeau côté UI (provisoire, conditionné au spike)

- `src/main/service-client/service-status.ts` : statut `ok` / `installing` /
  `unavailable` (service non installé, installé mais arrêté, ou injoignable).
- Nouveaux canaux IPC `BLOCKING_GET_SERVICE_STATUS`, `BLOCKING_REPAIR_SERVICE`,
  et événement `BLOCKING_EVENT_SERVICE_STATUS`.
- Bandeau d'état dans `BlockingPage`, réutilisant le pattern du bandeau admin P13
  (bandeau persistant + bouton « Réparer » + démarrage de session désactivé quand
  le service est indisponible).
- Flux d'auto-réparation : service absent → dialog « Installer le composant de
  blocage » → `elevated-install` ; service arrêté → tentative de redémarrage.

### Lot 4 — UI non élevée (provisoire, conditionné au spike)

- Retrait de `requestedExecutionLevel: requireAdministrator` de `electron-builder.yml`.
- L'UI tourne en utilisateur normal : suppression de `ensureElevatedAtStartup`
  du démarrage du `main`.
- Le bandeau d'état du service **remplace** le bandeau admin P13 (l'UI n'étant
  plus élevée, l'ancien bandeau admin n'a plus de sens).

## 4. Coordination

Un correctif du bug de lancement actuel (chemin d'élévation de l'UI : la relance
en administrateur ne rouvre pas l'app) est mené **en parallèle par Codex**. La
Phase 3 retire justement ce mécanisme d'élévation de l'UI (Lot 4) — il faudra
resynchroniser avec le correctif de Codex au moment du merge dans `master`.

## 5. Hors scope (Phase 4)

Durcissement : ACL du pipe nommé et de `C:\ProgramData\Nexus`,
reconnexion / backoff affinés du client pipe, notification « service non
démarré », mise à jour de `NEXUS_SPEC.md`.

## 6. Tests

- **Lot 1** : le spike est vérifié **manuellement** — installation réelle d'un
  service Windows + reboot — non automatisable en CI. Le *code* du spike (entrée
  `--install-service`, intégration node-windows) doit néanmoins passer
  `typecheck`, `lint` et le build.
- **Lots 2-4** : `service-status` testé avec un contrôle de service mocké ; le
  reste vérifié par `typecheck` / `lint` + intégration manuelle (spec §10).

## 7. Méthode

Un lot à la fois : `writing-plans` (plan validé) → `subagent-driven-development`
(implémenteur + revue de conformité + revue qualité par task). Branche
`nexus-service-phase3`, depuis `master` (`7376111`). La Phase 3 sera mergée dans
`master` à la fin du Lot 4.
