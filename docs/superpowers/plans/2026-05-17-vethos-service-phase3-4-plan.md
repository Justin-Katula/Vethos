# P16 — Phase 3 (Lots 2-4) + Phase 4 : plan d'implémentation

**Pour Codex.** Ce document est le plan d'implémentation de la fin de la Phase 3 et
de la Phase 4 du sous-projet P16 (service Windows de blocage). Codex implémente ;
Claude vérifiera ensuite, lot par lot.

**Références.**
- Design Phase 3 : `docs/superpowers/specs/2026-05-17-vethos-windows-service-phase3-design.md`
- Plan du Lot 1 (spike) : `docs/superpowers/plans/2026-05-17-vethos-service-phase3-lot1-plan.md`
- Spec maître : `docs/superpowers/specs/2026-05-15-vethos-windows-service-design.md` (§5, §7, §9, §11)

**Branche.** `vethos-service-phase3` (depuis `master` `7376111`). Phase 4 : branche
neuve depuis `master` après le merge de la Phase 3.

**Méthode.** Un lot à la fois. Chaque lot finit sur `npm run typecheck` (node + web)
+ `npm run lint` + `npm run test` **verts** (167 tests actuellement — ne pas
régresser) et **un commit par lot** (ou par tâche) pour permettre la vérification.

> ⚠️ **CONTINGENCE — à lire avant tout.** Les Lots 2-4 supposent que le **spike du
> Lot 1 réussit** : que node-windows installe bien Vethos comme service Windows
> tournant sur le binaire Electron (`ELECTRON_RUN_AS_NODE`), démarrant au boot en
> compte SYSTEM. **Le Lot 1 doit être implémenté ET vérifié manuellement (install
> réelle + reboot, cf. son plan) AVANT d'attaquer le Lot 2.** Si le spike échoue,
> ce plan est caduc : le design Phase 3 doit être révisé vers un runtime de repli
> (Node SEA, ou pilotage direct de winsw / `sc.exe`).

---

## Lot 2 — Installation & réparation

**But.** Mécaniser l'installation du service via une élévation ponctuelle, et
retirer le lancement en process détaché de la Phase 2 (le service est désormais un
vrai service Windows, plus un process spawné par l'UI).

**Fichiers.**
- Créer `src/main/elevated-install.ts`.
- Modifier `src/main/service-install.ts` (créé au Lot 1).
- Modifier `src/main/index.ts`.
- Supprimer `src/main/service-launcher.ts` (Lot 4b — remplacé).

**Tâches.**

1. **`elevated-install.ts`** — relance Vethos en mode install/désinstall via UAC.
   Même pattern que `requestElevatedRelaunch` de `src/main/blocking/elevation.ts`.
   ```ts
   import { exec as sudoExec } from 'sudo-prompt'
   import log from './logging/setup'

   function relaunchElevated(flag: '--install-service' | '--uninstall-service'): Promise<boolean> {
     return new Promise((resolve) => {
       sudoExec(`"${process.execPath}" ${flag}`, { name: 'Vethos' }, (err) => {
         if (err) {
           log.error('[elevated-install] échec de la relance élevée', err)
           resolve(false)
           return
         }
         resolve(true)
       })
     })
   }

   export const requestServiceInstall = (): Promise<boolean> =>
     relaunchElevated('--install-service')
   export const requestServiceUninstall = (): Promise<boolean> =>
     relaunchElevated('--uninstall-service')
   ```

2. **Migration intégrée à l'install.** Dans `service-install.ts`, `installService()`
   doit, **avant** `svc.install()`, appeler `migrateBlockingData(app.getPath('userData'),
   serviceDataDir())` — la fonction de `src/main/blocking/migrate-blocking-data.ts`,
   `serviceDataDir` de `@service/data-dir`. La migration vers `C:\ProgramData\Vethos`
   se fait ainsi au moment de l'install (routine élevée, qui peut écrire ProgramData).

3. **Retirer le lancement détaché Phase 2.** Dans `index.ts` : supprimer l'import et
   l'appel `await ensureServiceRunning()`. `git rm src/main/service-launcher.ts`.
   `migrate-blocking-data.ts` **reste** (désormais consommé par `service-install.ts`).

4. `typecheck` + `lint` + `test` verts. Commit `feat(main): installation élevée du service (Phase 3 Lot 2)`.

**Vérification manuelle** (Claude la demandera) : `Vethos.exe --install-service`
depuis un contexte non élevé → UAC → service installé, et `vethos_blocking*.json`
copiés dans `C:\ProgramData\Vethos`.

---

## Lot 3 — Détection d'état & bandeau UI

**But.** L'UI détecte si le service est OK / absent / arrêté, propose de le
réparer, et l'affiche dans un bandeau de `BlockingPage`.

**Fichiers.**
- Créer `src/main/service-client/service-status.ts`.
- Modifier `src/shared/ipc-channels.ts`, `src/main/blocking/ipc/blocking.handlers.ts`,
  `src/preload/index.ts`, et le renderer (`BlockingPage` + store de blocage).

**Tâches.**

1. **`ipc-channels.ts`** — ajouter dans `IPC_CHANNELS` :
   `BLOCKING_GET_SERVICE_STATUS: 'blocking:getServiceStatus'`,
   `BLOCKING_REPAIR_SERVICE: 'blocking:repairService'`,
   `BLOCKING_EVENT_SERVICE_STATUS: 'blocking:event:serviceStatus'`.

2. **`service-status.ts`** — `getServiceStatus(): Promise<ServiceStatus>` avec
   `export type ServiceStatus = 'ok' | 'unavailable'`. Logique :
   - **Le service répond-il sur le pipe ?** Sonde une-fois : `net.createConnection(PIPE_PATH)`
     (`PIPE_PATH` de `@shared/service-protocol`), événement `connect` → vrai,
     `error`/timeout 1 s → faux. (Le `service-launcher.ts` supprimé au Lot 2 avait
     une fonction `probeService` identique — la ré-implémenter ici, ~15 lignes,
     auto-contenue ; ne pas dépendre du fichier supprimé.)
   - pipe répond → `ok` ; sinon → `unavailable`.
   - (Distinguer « non installé » vs « installé mais arrêté » via `sc query
     VethosBlockingService` est un *plus* — utile pour le message du bandeau ;
     optionnel pour ce lot, le statut binaire `ok`/`unavailable` suffit au flux.)

3. **`blocking.handlers.ts`** (le relais) — enregistrer :
   - `ipcMain.handle(BLOCKING_GET_SERVICE_STATUS, () => getServiceStatus())`.
   - `ipcMain.handle(BLOCKING_REPAIR_SERVICE, () => requestServiceInstall())`
     (de `elevated-install.ts` — relance l'install élevée ; si le service est juste
     arrêté, l'install node-windows est idempotente et le redémarre).
   - Émettre `BLOCKING_EVENT_SERVICE_STATUS` au renderer quand la connexion du
     `ServiceClient` change : `createServiceClient` accepte une option
     `onStatusChange(connected: boolean)` — la câbler pour faire
     `webContents.send(BLOCKING_EVENT_SERVICE_STATUS, connected ? 'ok' : 'unavailable')`.

4. **`preload/index.ts`** — exposer `getServiceStatus()`, `repairService()`,
   `onServiceStatus(cb)` sur l'API `blocking` (suivre le pattern des autres canaux
   `blocking` du preload).

5. **Renderer** — bandeau d'état du service dans `BlockingPage` :
   - **Réutiliser le pattern du bandeau admin P13** déjà présent dans `BlockingPage`
     (bandeau persistant + bouton d'action). Codex : repérer ce bandeau dans le code
     et le cloner.
   - Bandeau visible quand le statut ≠ `ok` ; bouton « Réparer le service » →
     `repairService()` ; bouton « Démarrer la session » désactivé quand `unavailable`.
   - S'abonner à `onServiceStatus` pour mettre à jour le bandeau en direct.

6. `typecheck` + `lint` + `test` verts. Commit `feat: détection d'état du service + bandeau (Phase 3 Lot 3)`.

---

## Lot 4 — UI non élevée

**But.** L'UI tourne en utilisateur normal ; le bandeau de service (Lot 3) remplace
le bandeau admin P13.

**Fichiers.** `electron-builder.yml`, `src/main/index.ts`,
`src/main/blocking/elevation.ts`, `src/main/blocking/ipc/blocking.handlers.ts`,
`src/shared/ipc-channels.ts`, `src/preload/index.ts`, renderer.

**Tâches.**

1. **`electron-builder.yml`** — supprimer la ligne `requestedExecutionLevel: requireAdministrator`.

2. **`index.ts`** — supprimer l'appel `await ensureElevatedAtStartup()` du
   `app.whenReady` et son import.

3. **Retirer le code d'élévation devenu mort.** En Phase 3 l'UI n'est plus élevée :
   - `ensureElevatedAtStartup` n'a plus d'appelant → supprimer.
   - Les canaux `BLOCKING_IS_ELEVATED` / `BLOCKING_REQUEST_ELEVATION` n'ont plus de
     sens → les retirer de `ipc-channels.ts`, des handlers du relais
     (`blocking.handlers.ts`), du `preload`, et de leur usage côté renderer.
   - `isElevated` / `requestElevatedRelaunch` de `elevation.ts` n'ont alors plus
     d'appelant → supprimer. Si `elevation.ts` devient vide, `git rm` le fichier
     (vérifier `grep` qu'aucun import ne subsiste).

4. **Renderer** — retirer le bandeau admin P13 et tout usage de `isElevated` /
   `requestElevation` dans le store de blocage. Le bandeau de service du Lot 3 est
   le seul bandeau d'état désormais.

5. `typecheck` + `lint` + `test` verts. Commit `feat: UI non élevée, retrait de requireAdministrator (Phase 3 Lot 4)`.

**Vérification manuelle :** l'app packagée se lance **sans prompt UAC** ; le service
(installé) porte le blocage ; service absent → le bandeau propose l'installation
(seul moment où un UAC apparaît).

**Fin de Phase 3.** Merger `vethos-service-phase3` dans `master`. ⚠️ Resynchroniser
avec le correctif du bug de lancement mené par Codex en parallèle (il touche le
même chemin d'élévation que le Lot 4 retire).

---

## Phase 4 — Durcissement

Branche neuve `vethos-service-phase4` depuis `master`, après le merge de la Phase 3.
La spec maître (§11 Phase 4) ne détaille pas cette phase — le découpage ci-dessous
est **indicatif** et à re-cadrer (brainstorming) avant implémentation sérieuse.

### Lot 4.1 — ACL & isolation du pipe
- `C:\ProgramData\Vethos` : à la création du dossier par le service, poser une ACL —
  écriture SYSTEM + Administrateurs, lecture seule pour les utilisateurs — via
  `icacls` (`execFile`), une seule fois.
- Named pipe : le restreindre aux utilisateurs interactifs locaux, refuser l'accès
  réseau. **Inconnue technique réelle** : le serveur `net` de Node n'expose pas de
  descripteur de sécurité pour les named pipes. → **Mini-spike requis** : mesurer
  le périmètre d'exposition réel du pipe `\\.\pipe\VethosServiceBridge` (par défaut
  déjà local), décider si un addon natif est nécessaire ou si la limite est
  acceptable. Ne pas s'engager sur du code avant ce spike.

### Lot 4.2 — Reconnexion & notification
- Vérifier / affiner le backoff de reconnexion du `ServiceClient` (`src/main/service-client/client.ts` — déjà présent).
- Notification « service non démarré » : quand `service-status` passe `unavailable`,
  déclencher une notification native (ajouter une fonction `notifyServiceDown` dans
  `src/main/notifications.ts`). Réclamée aussi par le point P22 de l'audit V3.

### Lot 4.3 — Documentation
- Mettre à jour `VETHOS_SPEC.md` : architecture du service Windows, cycle de vie
  (install / boot / restart / réparation), dépannage.

**Critères d'acceptation Phase 2-3 (rappel spec §12)** à re-vérifier en fin de
Phase 4 : blocage 100 % dans le service ; tuer l'UI n'arrête pas le blocage ;
démarrage au boot SYSTEM ; UI sans `requireAdministrator` ; service absent →
install proposée ; bandeau + réparation ; reconnexion auto ; fichiers migrés ;
`GET_LAYER_STATUS` réel ; lint + typecheck + tests verts ; `VETHOS_SPEC.md` à jour.

---

## Récapitulatif pour le handoff

| Lot | Statut | Plan |
|---|---|---|
| Phase 3 Lot 1 | Plan écrit — **spike, à implémenter + vérifier en premier** | `...phase3-lot1-plan.md` |
| Phase 3 Lot 2 | Plan ci-dessus | ce document |
| Phase 3 Lot 3 | Plan ci-dessus | ce document |
| Phase 3 Lot 4 | Plan ci-dessus | ce document |
| Phase 4 (4.1-4.3) | Découpage indicatif, à re-cadrer | ce document |

Codex implémente lot par lot, un commit par lot, sur `vethos-service-phase3` (puis
`vethos-service-phase4`). Claude vérifie chaque lot après coup (conformité au plan +
qualité). Le Lot 1 est le verrou : pas de Lot 2 avant un spike vérifié.
